"""Chat API: start a CCAI conversation, stream SSE, drive failsafe-pause
continues, and export results.
"""
from __future__ import annotations

import csv
import io
import json
import logging
import time

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.config import settings
from app.middleware.rate_limit import (
    DAILY_LIMIT,
    check_rate_limit,
    record_conversation,
)
from app.services.extra_personas import get_extra_persona
from app.services.models import (
    CONVERSATION_LIMIT_BOUNDS,
    CONVERSATION_LIMIT_DESCRIPTIONS,
    ConversationLimits,
    DEFAULT_MAX_PARTICIPANTS,
    MAX_MAX_PARTICIPANTS,
    MIN_MAX_PARTICIPANTS,
    Participant,
    Phase,
    Session,
    clamp_conversation_limits,
)
from app.services.auto_select import auto_select_participants
from app.services.orchestrator import (
    create_session,
    get_session,
    run_conversation,
)
from app.services.persona import (
    generate_role_prompt,
    generate_role_prompt_freeform,
)

router = APIRouter()
LOG = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class GenerateRoleRequest(BaseModel):
    model_id: str
    name: str = ""
    profile: str = ""
    identity: str = ""
    samples: str = ""
    role_style: str = "exact"


class GenerateRoleFreeformRequest(BaseModel):
    model_id: str
    name: str = ""
    text: str = ""
    role_style: str = "ai_completed"


class SetOrchestratorRequest(BaseModel):
    model_id: str


class SetSpeedPriorityRequest(BaseModel):
    enabled: bool


class ExpertPersonaPayload(BaseModel):
    """Expert Persona created by the user via the popup. Already carries a
    finished `role_prompt` (the frontend calls /generate-role-* for that)."""

    participant_id: str
    name: str
    model_id: str
    role_prompt: str


class ParticipantSelectionPayload(BaseModel):
    """Reference to a participant the user has chosen for this conversation."""

    participant_id: str
    kind: str  # "neon" | "extra" | "expert"
    # For Neon entries: the model_id IS the persona id (neon:model@ver:persona)
    # For extra/expert: defaults to the persona's bound model_id, but the
    # user can override via per-participant model_assignments.
    name: str
    role_prompt: str | None = None
    model_id_override: str | None = None


class AutoSelectCandidate(BaseModel):
    """One row of the candidate pool sent to the auto-select endpoint."""

    participant_id: str
    name: str
    role_prompt: str = ""
    kind: str = ""
    model_id: str = ""


class AutoSelectRequest(BaseModel):
    """Body of POST /api/chat/auto-select-participants."""

    question: str
    count: int = 5
    candidates: list[AutoSelectCandidate]
    # Optional: pin the orchestrator model used for ranking. Defaults
    # to the configured global orchestrator model.
    orchestrator_model_id: str | None = None


class StartChatRequest(BaseModel):
    question: str | None = None

    participants: list[ParticipantSelectionPayload]
    expert_personas: list[ExpertPersonaPayload] = Field(default_factory=list)
    model_assignments: dict[str, str] = Field(default_factory=dict)

    orchestrator_model_id: str | None = None
    summarizer_model_id: str | None = None
    max_participants: int = DEFAULT_MAX_PARTICIPANTS
    # User-supplied overrides for the conversation's repetition /
    # failsafe limits. Any field that is missing or out of range is
    # silently clamped to the server-side default; see
    # `clamp_conversation_limits` in services.models.
    limits: dict[str, int] | None = None


# ---------------------------------------------------------------------------
# Settings endpoints (orchestrator default + speed priority)
# ---------------------------------------------------------------------------

@router.get("/chat/orchestrator")
async def api_get_orchestrator():
    return {"model_id": settings.orchestrator_model}


@router.put("/chat/orchestrator")
async def api_set_orchestrator(req: SetOrchestratorRequest):
    settings.orchestrator_model = req.model_id
    return {"model_id": settings.orchestrator_model}


@router.get("/chat/speed-priority")
async def api_get_speed_priority():
    return {"enabled": settings.speed_priority}


@router.put("/chat/speed-priority")
async def api_set_speed_priority(req: SetSpeedPriorityRequest):
    settings.speed_priority = req.enabled
    return {"enabled": settings.speed_priority}


# ---------------------------------------------------------------------------
# Role-prompt generation (used by the Expert Persona modal)
# ---------------------------------------------------------------------------

@router.post("/chat/generate-role")
async def api_generate_role(req: GenerateRoleRequest):
    result = await generate_role_prompt(
        model_id=req.model_id,
        name=req.name,
        profile=req.profile,
        identity=req.identity,
        samples=req.samples,
        role_style=req.role_style,
    )
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/chat/generate-role-freeform")
async def api_generate_role_freeform(req: GenerateRoleFreeformRequest):
    result = await generate_role_prompt_freeform(
        model_id=req.model_id,
        name=req.name,
        text=req.text,
        role_style=req.role_style,
    )
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result


# ---------------------------------------------------------------------------
# Auto-select participants (LLM-based ranking for "Select N Automatically")
# ---------------------------------------------------------------------------

@router.post("/chat/auto-select-participants")
async def api_auto_select_participants(req: AutoSelectRequest):
    """Rank the candidate pool by relevance to the question and return
    the top `count` participant_ids. The frontend calls this just
    before /chat/start when the user has the auto-select toggle on.

    Returns: {"selected": [id, ...], "rationale": "short string"}.
    `selected` is exactly `count` long unless the candidate pool is
    smaller. Invalid / hallucinated ids are silently dropped and
    padded with the next unused candidates.
    """
    if not req.question or not req.question.strip():
        raise HTTPException(400, "Question is required")
    if not req.candidates:
        raise HTTPException(400, "At least one candidate is required")
    if req.count < 1:
        raise HTTPException(400, "count must be >= 1")

    candidates_payload = [c.dict() for c in req.candidates]
    orchestrator_id = req.orchestrator_model_id or settings.orchestrator_model
    result = await auto_select_participants(
        orchestrator_model_id=orchestrator_id,
        question=req.question,
        candidates=candidates_payload,
        count=req.count,
    )
    return result


# ---------------------------------------------------------------------------
# Conversation limits (steppers in the settings menu)
# ---------------------------------------------------------------------------

@router.get("/chat/limits/defaults")
async def api_chat_limits_defaults():
    """Return defaults, bounds, and human-readable descriptions for the
    `ConversationLimits` knobs the user can tune in the settings menu.

    The frontend uses the `defaults` to initialize the steppers, the
    `bounds` to set min/max and clamp on input, and the `descriptions`
    to render the section headers and per-field help text. Keeping
    this server-driven means we add a knob in one place
    (services.models) and the UI picks it up without a frontend
    change beyond rendering.
    """
    defaults = ConversationLimits()
    return {
        "defaults": {
            field_name: getattr(defaults, field_name)
            for field_name in CONVERSATION_LIMIT_BOUNDS.keys()
        },
        "bounds": {
            field_name: {"min": lo, "max": hi}
            for field_name, (lo, hi) in CONVERSATION_LIMIT_BOUNDS.items()
        },
        "descriptions": CONVERSATION_LIMIT_DESCRIPTIONS,
    }


# ---------------------------------------------------------------------------
# Demo questions
# ---------------------------------------------------------------------------

@router.get("/demo-questions")
async def api_demo_questions():
    from pathlib import Path

    path = Path(__file__).resolve().parent.parent / "data" / "demo_questions.json"
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


# ---------------------------------------------------------------------------
# Start chat
# ---------------------------------------------------------------------------

def _build_participant(
    sel: ParticipantSelectionPayload,
    expert_lookup: dict[str, ExpertPersonaPayload],
    model_assignments: dict[str, str],
) -> Participant:
    """Resolve a selection payload into a runnable Participant.

    Resolution order for the model:
      1. Explicit per-conversation override in `model_assignments`
      2. The persona's selection-time `model_id_override`
      3. The bundled extra persona's default model
      4. For Neon participants, the model_id is the participant_id itself
      5. For Expert personas, the persona's bound model_id

    Resolution order for the role_prompt:
      1. The selection's role_prompt (most flexible)
      2. The matching expert persona's role_prompt
      3. The bundled extra persona's role_prompt
      4. For Neon participants: a thin role wrapper just naming the persona
    """
    pid = sel.participant_id
    kind = sel.kind
    name = sel.name

    role_prompt = sel.role_prompt or ""
    model_id = sel.model_id_override or model_assignments.get(pid, "")

    if kind == "expert":
        ep = expert_lookup.get(pid)
        if ep is None:
            raise HTTPException(400, f"Expert persona payload missing for id {pid}")
        if not role_prompt:
            role_prompt = ep.role_prompt
        if not model_id:
            model_id = ep.model_id
        if not name:
            name = ep.name
    elif kind == "extra":
        ep = get_extra_persona(pid)
        if ep is None:
            raise HTTPException(400, f"Unknown extra persona: {pid}")
        if not role_prompt:
            role_prompt = ep.role_prompt
        if not model_id:
            model_id = ep.default_model_id
        if not name:
            name = ep.name
    elif kind == "neon":
        # The participant_id IS the model id for Neon personas, so it's
        # required to be a `neon:model@ver:persona` style string.
        if not pid.startswith("neon:"):
            raise HTTPException(
                400, f"Neon participant_id must start with 'neon:': {pid}",
            )
        if not model_id:
            model_id = pid
        if not role_prompt:
            role_prompt = (
                f"You are {name}, a Neon.ai persona. Speak naturally in your "
                "own voice and bring the perspective your background suggests."
            )
    else:
        raise HTTPException(400, f"Unknown participant kind: {kind}")

    resolved = settings.resolve_model(model_id)
    if not resolved:
        raise HTTPException(400, f"Unknown model: {model_id}")

    return Participant(
        participant_id=pid,
        name=name,
        role_prompt=role_prompt,
        model_id=resolved["model_id"],
        kind=kind,
        enabled=True,
        base_url=resolved.get("base_url", ""),
        api_key=resolved.get("api_key", ""),
        display_name=resolved.get("display_name", model_id),
        is_neon=resolved.get("is_neon", False),
        hana_model_id=resolved.get("hana_model_id", ""),
        persona_name=resolved.get("persona_name", ""),
        neon_direct_vllm=resolved.get("neon_direct_vllm", False),
        vllm_base_url=resolved.get("vllm_base_url", ""),
        vllm_api_key=resolved.get("vllm_api_key", ""),
    )


@router.post("/chat/start")
async def api_start_chat(req: StartChatRequest, request: Request):
    """Create a session and return a streaming SSE response for the conversation."""
    if not req.question or not req.question.strip():
        raise HTTPException(400, "Question is required")

    allowed, _ = check_rate_limit(request)
    if not allowed:
        return JSONResponse(
            status_code=429,
            content={
                "detail": (
                    f"Daily conversation limit reached ({DAILY_LIMIT}/day). "
                    "Sign in with HuggingFace as a neongeckocom org member "
                    "for unlimited access."
                ),
                "remaining": 0,
            },
        )

    expert_lookup = {ep.participant_id: ep for ep in req.expert_personas}

    max_p = max(MIN_MAX_PARTICIPANTS, min(MAX_MAX_PARTICIPANTS, req.max_participants))
    if len(req.participants) < 2:
        raise HTTPException(400, "Need at least 2 participants")
    if len(req.participants) > max_p:
        raise HTTPException(
            400, f"Got {len(req.participants)} participants but max is {max_p}",
        )

    participants: list[Participant] = []
    for sel in req.participants:
        participants.append(_build_participant(sel, expert_lookup, req.model_assignments))

    record_conversation(request)

    session = create_session()
    session.question = req.question.strip()
    session.participants = participants
    session.orchestrator_model_id = req.orchestrator_model_id
    session.summarizer_model_id = req.summarizer_model_id
    session.max_participants = max_p
    # Attach the user-tunable limits and seed the runtime failsafe
    # caps from them. clamp_conversation_limits silently coerces any
    # missing or out-of-range values back to the defaults / bounds.
    session.limits = clamp_conversation_limits(req.limits)
    session.participant_message_cap = session.limits.participant_message_pause_at
    session.orchestrator_call_cap = session.limits.orchestrator_call_pause_at

    async def event_stream():
        yield (
            "event: session\ndata: "
            + json.dumps({
                "session_id": session.session_id,
                "participants": [
                    {
                        "participant_id": p.participant_id,
                        "name": p.name,
                        "model_id": p.model_id,
                        "model_display": p.display_name,
                        "kind": p.kind,
                    } for p in session.participants
                ],
                "max_participants": session.max_participants,
                "orchestrator_model_id": session.orchestrator_model_id or settings.orchestrator_model,
                "summarizer_model_id": session.summarizer_model_id,
            })
            + "\n\n"
        )
        async for chunk in run_conversation(session):
            yield chunk

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/chat/{session_id}/continue")
async def api_continue(session_id: str, reason: str = "messages"):
    session = get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if not session.paused_for_continue:
        raise HTTPException(409, "Session is not paused")
    session.pending_continue = True
    return {"ok": True, "reason": reason}


# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------

@router.get("/chat/{session_id}/export")
async def api_export_chat(session_id: str, fmt: str = "txt"):
    session = get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    if fmt == "md":
        return _export_md(session)
    if fmt == "csv-table":
        return _export_csv_table(session)
    return _export_txt(session)


@router.get("/chat/{session_id}/credentials")
async def api_credentials(session_id: str):
    """Return the orchestrator-generated Credential Summary for the
    current session. Built after Phase 1 and refreshed once after Phase 2
    critique - so the response can be empty if the user opens the modal
    before Phase 1 finishes.
    """
    session = get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return {
        "session_id": session_id,
        "question": session.question,
        "credentials": session.credential_summary or [],
    }


@router.get("/chat/{session_id}/api-log")
async def api_export_log(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return {"session_id": session_id, "log": session.api_log}


@router.get("/chat/{session_id}/table")
async def api_table_view(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    rows = []
    for p in session.participants:
        first = (session.initial_opinions or {}).get(p.participant_id, "")
        contribution = (session.contribution_summaries or {}).get(p.participant_id, "")
        revised = (session.final_opinions or {}).get(p.participant_id, "")
        final_msg = _last_consensus_message_for(session, p.participant_id) or revised
        rows.append({
            "participant_id": p.participant_id,
            "name": p.name,
            "model_display": p.display_name,
            "first_opinion": first,
            "contribution_summary": contribution,
            "revised_opinion": revised,
            "final_opinion": final_msg,
        })
    final_report = (session.final_report or {}).get("text", "")
    return {
        "session_id": session_id,
        "question": session.question,
        "final_report": final_report,
        "final_report_kind": (session.final_report or {}).get("kind", ""),
        "rows": rows,
    }


def _last_consensus_message_for(session: Session, participant_id: str) -> str:
    """Return the participant's most recent message in the consensus or
    finalization phase - used as the 'final opinion' column."""
    for m in reversed(session.messages):
        if m.get("speaker_id") != participant_id:
            continue
        if m.get("phase") in {Phase.CONSENSUS.value, Phase.FINALIZATION.value}:
            return m.get("text", "")
    return ""


# ---------------------------------------------------------------------------
# Export helpers
# ---------------------------------------------------------------------------

def _format_participants_block(session: Session) -> list[str]:
    return [
        f"- {p.name} ({p.display_name})"
        for p in session.participants
    ]


def _credentials_intro_line() -> str:
    """One-liner that explains where this block came from. Repeated in TXT
    and MD exports so the file is self-explanatory without the UI."""
    return (
        "Orchestrator-generated assessments of each participant's "
        "expertise, debating style, credibility on this question, and "
        "biases to watch. Built after Phase 1 (initial opinions) and "
        "refreshed once after Phase 2 (critique)."
    )


def _format_credential_block_txt(session: Session) -> list[str]:
    """Plain-text Credential Summary section. Returns [] if no summary
    has been built yet (e.g. user exports mid-Phase-1)."""
    creds = session.credential_summary or []
    if not creds:
        return []
    lines = ["Credential Summary", "-" * 40, _credentials_intro_line(), ""]
    for c in creds:
        name = c.get("name") or c.get("participant_id") or "(unknown)"
        lines.append(f"{name}")
        if c.get("expertise"):
            lines.append(f"  Expertise:   {c['expertise']}")
        if c.get("personality"):
            lines.append(f"  Style:       {c['personality']}")
        if c.get("credibility_for_question") is not None:
            try:
                score = float(c["credibility_for_question"])
                lines.append(f"  Credibility: {score:.2f} (0-1)")
            except (TypeError, ValueError):
                pass
        if c.get("bias_to_watch"):
            lines.append(f"  Bias:        {c['bias_to_watch']}")
        lines.append("")
    return lines


def _format_credential_block_md(session: Session) -> list[str]:
    """Markdown Credential Summary section. Returns [] when empty."""
    creds = session.credential_summary or []
    if not creds:
        return []
    lines = ["## Credential Summary", "", f"_{_credentials_intro_line()}_", ""]
    for c in creds:
        name = c.get("name") or c.get("participant_id") or "(unknown)"
        lines.append(f"### {name}")
        lines.append("")
        if c.get("expertise"):
            lines.append(f"- **Expertise:** {c['expertise']}")
        if c.get("personality"):
            lines.append(f"- **Style:** {c['personality']}")
        if c.get("credibility_for_question") is not None:
            try:
                score = float(c["credibility_for_question"])
                lines.append(f"- **Credibility on this question:** {score:.2f} (0-1)")
            except (TypeError, ValueError):
                pass
        if c.get("bias_to_watch"):
            lines.append(f"- **Bias to watch:** {c['bias_to_watch']}")
        lines.append("")
    return lines


def _credential_for(session: Session, participant_id: str) -> dict:
    """Lookup helper used by the CSV writer. Empty dict if not built yet."""
    for c in session.credential_summary or []:
        if c.get("participant_id") == participant_id:
            return c
    return {}


def _format_credibility_score(value: object) -> str:
    """CSV-safe formatting for the credibility number (rounded float).
    Returns "" when the value is missing or not numeric."""
    if value is None:
        return ""
    try:
        return f"{float(value):.2f}"
    except (TypeError, ValueError):
        return ""


def _export_txt(session: Session) -> dict:
    lines = ["CCAI Conversation Log", "=" * 40, ""]
    lines.append("Question:")
    lines.append(session.question)
    lines.append("")
    lines.append("Participants:")
    lines.extend(_format_participants_block(session))
    lines.append("")
    cred_lines = _format_credential_block_txt(session)
    if cred_lines:
        lines.extend(cred_lines)
    for m in session.messages:
        speaker = m.get("speaker_name") or "(anon)"
        if m.get("role") == "orchestrator":
            speaker = "Orchestrator"
        lines.append(f"{speaker}: {m.get('text', '')}")
        lines.append("")
    if session.final_report and session.final_report.get("text"):
        lines.append("---")
        lines.append("Final Report:")
        lines.append(session.final_report["text"])
    return {"filename": "ccai_chat.txt", "content": "\n".join(lines)}


def _export_md(session: Session) -> dict:
    lines = ["# CCAI Conversation Log", ""]
    lines.append("## Question")
    lines.append("")
    lines.append(f"> {session.question}")
    lines.append("")
    lines.append("## Participants")
    lines.append("")
    for p in session.participants:
        lines.append(f"- **{p.name}** (*{p.display_name}*)")
    lines.append("")
    cred_lines = _format_credential_block_md(session)
    if cred_lines:
        lines.extend(cred_lines)
    lines.append("---")
    lines.append("")
    for m in session.messages:
        speaker = m.get("speaker_name") or "(anon)"
        is_orch = m.get("role") == "orchestrator"
        if is_orch:
            speaker = "Orchestrator"
        text = m.get("text", "")
        if is_orch:
            lines.append(f"_**{speaker}:**_ {text}")
        else:
            lines.append(f"**{speaker}:** {text}")
        lines.append("")
    if session.final_report and session.final_report.get("text"):
        lines.append("\n---\n")
        lines.append("## Final Report")
        lines.append("")
        lines.append(session.final_report["text"])
    return {"filename": "ccai_chat.md", "content": "\n".join(lines)}


def _export_csv_table(session: Session) -> dict:
    """RFC-4180 compliant CSV. csv.writer handles quoting/escaping.

    Columns include the orchestrator-generated Credential Summary so
    the table is self-contained: who each participant is (per the
    orchestrator's read), then what they said and how it evolved.
    """
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")

    writer.writerow(["Question", session.question])
    final_text = (session.final_report or {}).get("text", "")
    writer.writerow(["Final Group Opinion", final_text])
    writer.writerow([])
    writer.writerow([
        "Participant",
        "Expertise (orchestrator's read)",
        "Style",
        "Credibility on this question (0-1)",
        "Bias to watch",
        "First opinion",
        "Conversation contribution",
        "Revised opinion",
        "Final opinion",
    ])
    for p in session.participants:
        cred = _credential_for(session, p.participant_id)
        writer.writerow([
            p.name,
            cred.get("expertise", ""),
            cred.get("personality", ""),
            _format_credibility_score(cred.get("credibility_for_question")),
            cred.get("bias_to_watch", ""),
            (session.initial_opinions or {}).get(p.participant_id, ""),
            (session.contribution_summaries or {}).get(p.participant_id, ""),
            (session.final_opinions or {}).get(p.participant_id, ""),
            _last_consensus_message_for(session, p.participant_id),
        ])
    return {"filename": "ccai_chat_table.csv", "content": buf.getvalue()}
