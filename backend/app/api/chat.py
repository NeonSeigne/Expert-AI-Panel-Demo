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
from typing import Any

from app.clients.hana_client import hana_client
from app.services import human_io
from app.services.credential import (
    build_human_credential_from_profile,
    normalize_one_credential,
)
from app.services.extra_personas import EXTRA_PERSONAS, get_extra_persona
from app.services.json_calls import orchestrator_call
from app.services.resilience import build_substitution_chain
from app.services.prompts import (
    CREDENTIAL_INTAKE_EMPTY_TRANSCRIPT,
    CREDENTIAL_INTAKE_TURN_PROMPT,
)
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
from app.services.model_recommend import suggest_model_for_persona
from app.services.prompts.catalog import build_prompt_catalog
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
    """Structured persona fields → role prompt. `model_id` is ignored (legacy)."""

    model_id: str = ""
    name: str = ""
    profile: str = ""
    identity: str = ""
    samples: str = ""
    role_style: str = "exact"
    orchestrator_model_id: str | None = None


class GenerateRoleFreeformRequest(BaseModel):
    """Freeform persona text → role prompt. `model_id` is ignored (legacy)."""

    model_id: str = ""
    name: str = ""
    text: str = ""
    role_style: str = "ai_completed"
    orchestrator_model_id: str | None = None


class AvailableModelPayload(BaseModel):
    """One row of the builder's live model list (from allModelsFlat)."""

    id: str
    name: str = ""
    provider: str = ""
    kind: str = "provider"


class PanelMemberPayload(BaseModel):
    """Another participant already in the panel (for diversity hints)."""

    name: str = ""
    model_id: str = ""
    provider: str = ""


class SuggestModelRequest(BaseModel):
    """Body of POST /api/chat/suggest-model."""

    persona_name: str = ""
    source_text: str = ""
    role_prompt: str = ""
    available_models: list[AvailableModelPayload]
    panel_context: list[PanelMemberPayload] = Field(default_factory=list)
    orchestrator_model_id: str | None = None


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


class HumanCredentialPayload(BaseModel):
    """Structured credential summary for the in-the-loop human.

    Generated from the user's profile text via /credentials/from-profile.
    The orchestrator prepends this entry to the LLM-built credential
    summary so the human always appears first in the modal / exports.
    """

    participant_id: str
    name: str
    expertise: str = ""
    personality: str = ""
    credibility_for_question: float = 0.5
    bias_to_watch: str = ""


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
    # Optional in-the-loop human participant's pre-authored credential
    # summary. Must reference a participant in the `participants` list
    # that has kind == "human". Capped at one human per session.
    human_credential: HumanCredentialPayload | None = None

    # Conversation-format plugin selection. IDs come from
    # app.services.conversation.STRUCTURE_REGISTRY /
    # DECISION_REGISTRY. Missing or unknown IDs are silently coerced
    # to the defaults (collaborative + consensus) at start time.
    conversation_structure_id: str | None = None
    decision_method_id: str | None = None


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


@router.get("/chat/conversation-formats")
async def api_conversation_formats():
    """Catalog the available conversation structures + decision methods.

    The frontend reads this once to populate the "Conversation format"
    accordion in Settings. IDs returned here are the same values
    accepted by /chat/start under `conversation_structure_id` and
    `decision_method_id`.
    """
    from app.services.conversation import (
        list_structures,
        list_decisions,
        DEFAULT_STRUCTURE_ID,
        DEFAULT_DECISION_ID,
    )
    return {
        "structures": list_structures(),
        "decisions": list_decisions(),
        "default_structure_id": DEFAULT_STRUCTURE_ID,
        "default_decision_id": DEFAULT_DECISION_ID,
    }


@router.put("/chat/speed-priority")
async def api_set_speed_priority(req: SetSpeedPriorityRequest):
    settings.speed_priority = req.enabled
    return {"enabled": settings.speed_priority}


# ---------------------------------------------------------------------------
# Role-prompt generation (used by the Expert Persona modal)
# ---------------------------------------------------------------------------

async def _builder_neon_model_ids() -> list[str]:
    """Flat neon:model@ver:persona ids for neutral writer fallback."""
    ids: list[str] = []
    try:
        for nm in await hana_client.get_models():
            base = nm.get("model_id") or ""
            for p in nm.get("personas") or []:
                if p.get("enabled") is False:
                    continue
                pname = p.get("persona_name") or ""
                if base and pname:
                    ids.append(f"neon:{base}:{pname}")
    except Exception as exc:
        LOG.warning("Could not list Neon models for role writer pick: %s", exc)
    return ids


@router.post("/chat/generate-role")
async def api_generate_role(req: GenerateRoleRequest):
    neon_ids = await _builder_neon_model_ids()
    orchestrator_id = req.orchestrator_model_id or settings.orchestrator_model
    result = await generate_role_prompt(
        name=req.name,
        profile=req.profile,
        identity=req.identity,
        samples=req.samples,
        role_style=req.role_style,
        orchestrator_model_id=orchestrator_id,
        extra_model_ids=neon_ids,
    )
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/chat/generate-role-freeform")
async def api_generate_role_freeform(req: GenerateRoleFreeformRequest):
    neon_ids = await _builder_neon_model_ids()
    orchestrator_id = req.orchestrator_model_id or settings.orchestrator_model
    result = await generate_role_prompt_freeform(
        name=req.name,
        text=req.text,
        role_style=req.role_style,
        orchestrator_model_id=orchestrator_id,
        extra_model_ids=neon_ids,
    )
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/chat/suggest-model")
async def api_suggest_model(req: SuggestModelRequest):
    """Recommend an LLM for an Expert Persona from the builder's model list.

    Returns: {"recommended_model_id": "...", "rationale": "..."} on success,
    or {"error": "..."} when the description is empty, the model list is
    empty, or the orchestrator call fails / returns an invalid id.
    """
    if not req.available_models:
        raise HTTPException(400, "At least one available model is required")

    orchestrator_id = req.orchestrator_model_id or settings.orchestrator_model
    neon_ids = await _builder_neon_model_ids()
    result = await suggest_model_for_persona(
        orchestrator_model_id=orchestrator_id,
        persona_name=req.persona_name,
        source_text=req.source_text,
        role_prompt=req.role_prompt,
        available_models=[m.model_dump() for m in req.available_models],
        panel_context=[p.model_dump() for p in req.panel_context],
    )
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result


# ---------------------------------------------------------------------------
# Prompt catalog (Transparency: "View current chat prompts")
# ---------------------------------------------------------------------------

@router.get("/chat/prompts/catalog")
async def api_chat_prompts_catalog():
    """Return every prompt template the orchestrator and participants
    use during a chat, grouped by phase, each with a short purpose and
    a list of runtime template variables. Used by the
    PromptCatalogModal in the settings menu's Transparency section.

    Shape:
      {"groups": [{"title": "...", "items": [{"name", "purpose",
       "variables", "template"}]}, ...]}
    """
    return build_prompt_catalog()


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

def _neon_role_prompt_from_model_id(model_id: str) -> str:
    """Look up a Neon persona's HANA system_prompt from the client cache."""
    if not model_id.startswith("neon:"):
        return ""
    parts = model_id.split(":", 2)
    if len(parts) != 3:
        return ""
    sp = hana_client.get_persona_system_prompt(parts[1], parts[2])
    return (sp or "").strip()


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
            role_prompt = _neon_role_prompt_from_model_id(model_id)
        if not role_prompt:
            role_prompt = (
                f"You are {name}, a Neon.ai persona. Speak naturally in your "
                "own voice and bring the perspective your background suggests."
            )
    elif kind == "human":
        # Human participants don't use an LLM at all; the orchestrator
        # pauses for their typed input. They still need a participant
        # row so the rest of the state machine (credential summary,
        # alliance detection, addressed-to routing, etc.) can refer to
        # them by id and name.
        if not name:
            raise HTTPException(400, "Human participant requires a name")
        return Participant(
            participant_id=pid,
            name=name,
            role_prompt="",
            model_id="",
            kind="human",
            enabled=True,
            display_name="Human participant",
        )
    else:
        raise HTTPException(400, f"Unknown participant kind: {kind}")

    # When the user assigns a Neon model to a non-Neon persona, surface
    # that model's HANA persona prompt for inference context.
    if not role_prompt and model_id.startswith("neon:"):
        role_prompt = _neon_role_prompt_from_model_id(model_id)

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

    # Populate the HANA persona prompt cache so Neon role_prompt
    # resolution works even if /api/models hasn't been called yet.
    try:
        await hana_client.get_models()
    except Exception as exc:
        LOG.warning("HANA get_models during chat start failed: %s", exc)

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

    humans = [p for p in participants if p.kind == "human"]
    if len(humans) > 1:
        raise HTTPException(400, "Only one human participant is supported per session.")
    if humans and req.human_credential is None:
        raise HTTPException(
            400,
            "Human participant requires a human_credential payload.",
        )
    if humans and req.human_credential.participant_id != humans[0].participant_id:
        raise HTTPException(
            400,
            "human_credential.participant_id must match the human participant.",
        )

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

    # Resilience: precompute the per-session alternate-participant pool
    # and LLM substitution chain so the orchestrator doesn't have to
    # walk the catalog at runtime when a participant fails. These are
    # only *consulted* when settings.speed_priority is on; building
    # them unconditionally keeps the start path simple and the work is
    # cheap (one cached HANA fetch + a few synchronous list builds).
    selected_ids = {p.participant_id for p in participants}
    candidate_pool: list[Participant] = []
    # Extra personas first (general-purpose lenses; resolvable as
    # long as the matching API key is configured).
    for spec in EXTRA_PERSONAS:
        if spec.participant_id in selected_ids:
            continue
        resolved = settings.resolve_model(spec.default_model_id)
        if not resolved:
            continue
        candidate_pool.append(Participant(
            participant_id=spec.participant_id,
            name=spec.name,
            role_prompt=spec.role_prompt,
            model_id=resolved["model_id"],
            kind="extra",
            base_url=resolved.get("base_url", ""),
            api_key=resolved.get("api_key", ""),
            display_name=resolved.get("display_name", spec.default_model_id),
        ))
    # Neon personas next, from whatever HANA returns. HANA being
    # unreachable just yields an empty list — fine, the pool's already
    # got the extras.
    neon_hana_model_ids: list[str] = []
    try:
        neon_models = await hana_client.get_models()
    except Exception as exc:  # noqa: BLE001
        LOG.warning("HANA models unavailable while building candidate pool: %s", exc)
        neon_models = []
    for nm in neon_models or []:
        hana_mid = nm.get("model_id")
        if hana_mid:
            neon_hana_model_ids.append(hana_mid)
        for persona in nm.get("personas", []) or []:
            if persona.get("enabled") is False:
                continue
            persona_name = persona.get("persona_name") or ""
            pn_lower = persona_name.lower()
            if "vanilla" in pn_lower or "rag" in pn_lower:
                continue
            pid = f"neon:{hana_mid}:{persona_name}"
            if pid in selected_ids:
                continue
            resolved = settings.resolve_model(pid)
            if not resolved:
                continue
            candidate_pool.append(Participant(
                participant_id=pid,
                name=persona_name or hana_mid.split("/")[-1],
                role_prompt=(
                    f"You are {persona_name}, a Neon.ai persona. Speak "
                    "naturally in your own voice and bring the perspective "
                    "your background suggests."
                ),
                model_id=resolved["model_id"],
                kind="neon",
                base_url=resolved.get("base_url", ""),
                api_key=resolved.get("api_key", ""),
                display_name=resolved.get("display_name", pid),
                is_neon=True,
                hana_model_id=resolved.get("hana_model_id", ""),
                persona_name=resolved.get("persona_name", ""),
                neon_direct_vllm=resolved.get("neon_direct_vllm", False),
                vllm_base_url=resolved.get("vllm_base_url", ""),
                vllm_api_key=resolved.get("vllm_api_key", ""),
            ))
    session.candidate_pool = candidate_pool
    session.substitution_chain = build_substitution_chain(neon_hana_model_ids)

    # Conversation-format plugin selection. Coerce unknown IDs to the
    # defaults via the get_structure/get_decision resolvers.
    from app.services.conversation import (
        get_structure as _get_structure_cls,
        get_decision as _get_decision_cls,
        STRUCTURE_REGISTRY as _STRUCT_REG,
        DECISION_REGISTRY as _DEC_REG,
    )
    if req.conversation_structure_id and req.conversation_structure_id in _STRUCT_REG:
        session.conversation_structure_id = req.conversation_structure_id
    if req.decision_method_id and req.decision_method_id in _DEC_REG:
        session.decision_method_id = req.decision_method_id

    if humans and req.human_credential is not None:
        session.human_credential = normalize_one_credential({
            "participant_id": req.human_credential.participant_id,
            "name": req.human_credential.name,
            "expertise": req.human_credential.expertise,
            "personality": req.human_credential.personality,
            "credibility_for_question": req.human_credential.credibility_for_question,
            "bias_to_watch": req.human_credential.bias_to_watch,
            "is_human": True,
        })

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
# Human participant: turn response + credential intake Q&A
# ---------------------------------------------------------------------------

class HumanResponseRequest(BaseModel):
    """POST body for the human's response to a pending turn.

    `skip` flips this turn into a "declined to comment" note from the
    orchestrator rather than a participant message; `text` is ignored
    when skip is true.
    """

    text: str = ""
    skip: bool = False


@router.post("/chat/{session_id}/human-response")
async def api_human_response(session_id: str, req: HumanResponseRequest):
    """Deliver the human participant's text for the current pending
    turn. Wakes the orchestrator coroutine waiting on the
    `human_io` slot for this session."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if session.awaiting_human is None:
        raise HTTPException(409, "Session is not awaiting a human turn")
    if not req.skip and not (req.text or "").strip():
        raise HTTPException(400, "text is required unless skip is true")
    delivered = human_io.deliver_human_response(
        session_id, req.text, skip=req.skip,
    )
    if not delivered:
        raise HTTPException(409, "No pending human turn for this session")
    return {"ok": True, "skipped": req.skip}


class HumanCredentialEditRequest(BaseModel):
    """PATCH body for editing the human's credential summary mid-chat."""

    name: str | None = None
    expertise: str | None = None
    personality: str | None = None
    credibility_for_question: float | None = None
    bias_to_watch: str | None = None


@router.patch("/chat/{session_id}/credentials/human")
async def api_edit_human_credential(
    session_id: str,
    req: HumanCredentialEditRequest,
):
    """Update the human participant's credential summary in place.

    The View Credential Summary modal lets the user tweak the human's
    entry (name, expertise, style, credibility, bias). Only fields
    provided in the body are changed; others are left as-is. The
    updated entry is reflected in subsequent participant prompts (the
    credentials_to_block call rebuilds the prompt block each turn).
    """
    session = get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if session.human_credential is None:
        raise HTTPException(404, "Session has no human participant")

    updated = dict(session.human_credential)
    for field_name in (
        "name", "expertise", "personality",
        "credibility_for_question", "bias_to_watch",
    ):
        value = getattr(req, field_name)
        if value is not None:
            updated[field_name] = value
    updated["is_human"] = True
    updated = normalize_one_credential(updated)
    session.human_credential = updated

    # Also patch the entry inside session.credential_summary so the
    # View Credential Summary modal reflects the edit without waiting
    # for the next phase-refresh.
    for i, c in enumerate(session.credential_summary or []):
        if c.get("participant_id") == updated["participant_id"]:
            session.credential_summary[i] = updated
            break

    return {"ok": True, "credential": updated}


class HumanCredentialFromProfileRequest(BaseModel):
    """Body for POST /api/chat/credentials/from-profile."""

    name: str
    question: str = ""
    profile_text: str
    participant_id: str = ""
    orchestrator_model_id: str | None = None


@router.post("/chat/credentials/from-profile")
async def api_human_credential_from_profile(req: HumanCredentialFromProfileRequest):
    """Generate a structured credential summary from a human's profile text.

    The orchestrator assesses the self-description the same way it would
    a participant role prompt when building the Phase-1 Credential
    Summary (expertise, style, credibility on this question, biases).
    """
    if not req.name.strip():
        raise HTTPException(400, "name is required")
    if not req.profile_text.strip():
        raise HTTPException(400, "profile_text is required")

    orchestrator_id = req.orchestrator_model_id or settings.orchestrator_model
    credential = await build_human_credential_from_profile(
        orchestrator_model_id=orchestrator_id,
        question=(req.question or "").strip(),
        name=req.name.strip(),
        profile_text=req.profile_text.strip(),
        participant_id=req.participant_id.strip(),
    )
    return {"credential": credential}


# Module-level registry of in-flight credential drafts. Each draft is a
# tiny piece of state: the question being discussed, the human's name,
# the question/answer history, and the configured cap. Drafts are
# transient (lifetime = a few seconds of Q&A in the modal) so we don't
# bother persisting them; the registry is cleared by the API when the
# draft is finalized or abandoned.
_credential_drafts: dict[str, dict[str, Any]] = {}


class CredentialDraftStartRequest(BaseModel):
    """Body for POST /api/chat/credentials/draft - kicks off a Q&A."""

    name: str
    question: str
    max_questions: int = 6
    orchestrator_model_id: str | None = None


class CredentialDraftAnswerRequest(BaseModel):
    """Body for POST /api/chat/credentials/draft/{draft_id}/answer."""

    answer: str = ""


def _intake_transcript(history: list[dict[str, str]]) -> str:
    """Render the Q&A history into a transcript snippet for the prompt.

    Each entry of history is {"q": "...", "a": "..."}. The last entry
    may have only "q" (the question the user is currently answering)
    when called BEFORE the first answer, but in practice we render
    history only after the LLM has emitted a question and the user has
    answered, so both keys are present.
    """
    if not history:
        return CREDENTIAL_INTAKE_EMPTY_TRANSCRIPT
    lines: list[str] = []
    for i, qa in enumerate(history, start=1):
        q = (qa.get("q") or "").strip()
        a = (qa.get("a") or "").strip()
        lines.append(f"Q{i}: {q}")
        lines.append(f"A{i}: {a}" if a else f"A{i}: (no answer yet)")
    return "\n".join(lines)


async def _intake_turn(draft: dict[str, Any]) -> dict[str, Any]:
    """Run one orchestrator turn for the credential intake Q&A.

    Returns either {"kind": "question", "text": ...} or
    {"kind": "summary", "summary": {...}} as parsed from the
    orchestrator's JSON output. Falls back to a safe default question
    if parsing fails.
    """
    transcript = _intake_transcript(draft["history"])
    prompt = CREDENTIAL_INTAKE_TURN_PROMPT.format(
        name=draft["name"],
        question=draft["question"],
        max_questions=draft["max_questions"],
        questions_asked=draft["questions_asked"],
        transcript=transcript,
    )
    _raw, parsed = await orchestrator_call(
        orchestrator_model_id=draft["orchestrator_model_id"],
        user_prompt=prompt,
        label="credential_intake",
        api_log=draft.get("api_log"),
        max_tokens=512,
    )

    if isinstance(parsed, dict):
        kind = parsed.get("kind")
        if kind == "summary" and isinstance(parsed.get("summary"), dict):
            return {"kind": "summary", "summary": parsed["summary"]}
        if kind == "question" and isinstance(parsed.get("text"), str):
            return {"kind": "question", "text": parsed["text"].strip()}

    # Defensive fallback: if the model returned garbage, ask a sensible
    # next-question rather than crashing the modal.
    if draft["questions_asked"] >= draft["max_questions"]:
        return {
            "kind": "summary",
            "summary": {
                "name": draft["name"],
                "expertise": "(intake LLM did not return a summary)",
                "personality": "",
                "credibility_for_question": 0.5,
                "bias_to_watch": "",
            },
        }
    return {
        "kind": "question",
        "text": (
            "Could you tell me a bit about your background relevant to "
            f'this question: "{draft["question"]}"?'
        ),
    }


@router.post("/chat/credentials/draft")
async def api_credential_draft_start(req: CredentialDraftStartRequest):
    """Kick off a new credential-intake Q&A. Returns the draft id plus
    the LLM's first question (or, if it bailed immediately, a final
    summary)."""
    if not req.name.strip():
        raise HTTPException(400, "name is required")
    if not req.question.strip():
        raise HTTPException(400, "question is required")
    max_q = max(1, min(10, int(req.max_questions or 6)))

    import uuid as _uuid
    draft_id = str(_uuid.uuid4())
    draft: dict[str, Any] = {
        "draft_id": draft_id,
        "name": req.name.strip(),
        "question": req.question.strip(),
        "max_questions": max_q,
        "questions_asked": 0,
        "history": [],
        "orchestrator_model_id": (
            req.orchestrator_model_id or settings.orchestrator_model
        ),
        "api_log": [],
    }

    result = await _intake_turn(draft)
    if result["kind"] == "question":
        draft["questions_asked"] += 1
        draft["history"].append({"q": result["text"], "a": ""})
        _credential_drafts[draft_id] = draft
        return {
            "draft_id": draft_id,
            "kind": "question",
            "question": result["text"],
            "questions_asked": draft["questions_asked"],
            "max_questions": max_q,
        }

    # The intake LLM jumped straight to a summary (no answers needed).
    return {
        "draft_id": draft_id,
        "kind": "summary",
        "summary": result["summary"],
        "questions_asked": 0,
        "max_questions": max_q,
    }


@router.post("/chat/credentials/draft/{draft_id}/answer")
async def api_credential_draft_answer(
    draft_id: str,
    req: CredentialDraftAnswerRequest,
):
    """Submit the human's answer to the last question; receive either
    the LLM's next question or the final credential summary."""
    draft = _credential_drafts.get(draft_id)
    if draft is None:
        raise HTTPException(404, "Draft not found or already finalized")
    if not draft["history"]:
        raise HTTPException(409, "Draft has no pending question to answer")
    # Stamp the answer onto the last question.
    draft["history"][-1]["a"] = (req.answer or "").strip()

    result = await _intake_turn(draft)
    if result["kind"] == "question":
        draft["questions_asked"] += 1
        draft["history"].append({"q": result["text"], "a": ""})
        return {
            "draft_id": draft_id,
            "kind": "question",
            "question": result["text"],
            "questions_asked": draft["questions_asked"],
            "max_questions": draft["max_questions"],
        }

    # Final summary; clear the draft from the registry.
    _credential_drafts.pop(draft_id, None)
    return {
        "draft_id": draft_id,
        "kind": "summary",
        "summary": result["summary"],
        "questions_asked": draft["questions_asked"],
        "max_questions": draft["max_questions"],
    }


@router.delete("/chat/credentials/draft/{draft_id}")
async def api_credential_draft_cancel(draft_id: str):
    """User abandoned the AI Q&A (e.g. closed the modal). No-op if
    already gone."""
    _credential_drafts.pop(draft_id, None)
    return {"ok": True}


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

    from app.services.orchestrator import ensure_contribution_summaries

    try:
        await ensure_contribution_summaries(session)
    except Exception as exc:
        LOG.warning("Failed to build contribution summaries: %s", exc)

    rows = []
    threshold = session.limits.auto_disable_failures
    for p in session.participants:
        first = (session.initial_opinions or {}).get(p.participant_id, "")
        contribution = (session.contribution_summaries or {}).get(p.participant_id, "")
        revised = (session.final_opinions or {}).get(p.participant_id, "")
        final_msg = _last_consensus_message_for(session, p.participant_id) or revised
        cred = _credential_for(session, p.participant_id)
        credibility = cred.get("credibility_for_question")
        try:
            credibility_val = float(credibility) if credibility is not None else None
        except (TypeError, ValueError):
            credibility_val = None
        failures = int(getattr(p, "consecutive_failures", 0) or 0)
        enabled = bool(p.enabled)
        auto_disabled = (not enabled) and failures >= threshold
        rows.append({
            "participant_id": p.participant_id,
            "name": p.name,
            "model_display": p.display_name,
            "first_opinion": first,
            "contribution_summary": contribution,
            "revised_opinion": revised,
            "final_opinion": final_msg,
            "credibility_for_question": credibility_val,
            "consecutive_failures": failures,
            "enabled": enabled,
            "auto_disabled": auto_disabled,
        })
    final_report = (session.final_report or {}).get("text", "")
    decision = dict(session.final_report) if session.final_report else None
    return {
        "session_id": session_id,
        "question": session.question,
        "final_report": final_report,
        "final_report_kind": (session.final_report or {}).get("kind", ""),
        "decision": decision,
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
        "Consecutive failures",
        "Enabled",
        "Auto-disabled",
    ])
    threshold = session.limits.auto_disable_failures
    for p in session.participants:
        cred = _credential_for(session, p.participant_id)
        failures = int(getattr(p, "consecutive_failures", 0) or 0)
        enabled = bool(p.enabled)
        auto_disabled = (not enabled) and failures >= threshold
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
            failures,
            "yes" if enabled else "no",
            "yes" if auto_disabled else "no",
        ])
    return {"filename": "ccai_chat_table.csv", "content": buf.getvalue()}
