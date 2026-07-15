"""CCAI orchestrator: six-phase state machine driving a multi-participant
group discussion to a consensus (or to a documented failure-to-consense).

Phase outline (matches the build plan):

    1. Initial Opinions (independent, no peeking)
    1.5. Credential Summary (built concurrently during Phase 1)
    2. Critique x 2 rounds (full history visible)
    3. Status Assessment (max 3 iterations of targeted follow-ups)
    4. Opinion Finalization
    5. Consensus Gathering (alliance-aware, addressed-to aware)
    6. Closure (majority report, or unaddressed-factor probe + retry,
       or failure report)

Two failsafes pause the loop until the user clicks "Continue":
    - Participant-message cap: 60, then +20.
    - Orchestrator-call cap: 100, then +50.

Every LLM response runs through `app.utils.sanitize.strip_thinking` on
its way into history, into the orchestrator's prompts, and into the
summarizer.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from dataclasses import asdict
from typing import Any, AsyncIterator

from app.clients.llm_router import chat_completion
from app.config import settings
from app.services import context_budget, human_io
from app.services.consensus import (
    assess_consensus_status,
    classify_addressed_to,
    detect_alliances,
    find_unaddressed_factor,
)
from app.services.context_budget import (
    ContextSummary,
    DEFAULT_REPLY_BUDGET,
    KEEP_RECENT_MESSAGES,
    build_compressed_transcript_block,
    cap_max_tokens_for_window,
    replace_embedded_transcript,
    run_summarize,
    select_summarizer_model_id,
    should_summarize,
)
from app.services.credential import (
    assemble_credential_summary_list,
    build_credential_for_participant,
    credentials_to_block,
)
from app.services.json_calls import orchestrator_call
from app.services.orchestrator_speed import (
    _AiTurnResult,
    _AiTurnSpec,
    compact_transcript_for_orchestrator,
    orchestrator_fast_model_id,
    run_initial_opinions_roster,
    run_roster_ai_turns_parallel,
)
from app.services.resilience import run_resilient_turn
from app.services.live_sse import iter_resilient_turn_sse
from app.services.models import (
    DEFAULT_MAX_PARTICIPANTS,
    MAX_MAX_PARTICIPANTS,
    MIN_MAX_PARTICIPANTS,
    Participant,
    Phase,
    Session,
)
from app.services.prompts import (
    CONSENSUS_ALLIED_PROMPT,
    CONSENSUS_SOLO_PROMPT,
    CONTRIBUTION_SUMMARY_PROMPT,
    CRITIQUE_PROMPT,
    FINALIZATION_PROMPT,
    INITIAL_OPINION_PROMPT,
    MAJORITY_REPORT_PROMPT,
    NO_CONSENSUS_REPORT_PROMPT,
    NO_REASONING_DIRECTIVE,
    PARTICIPANT_BASE_DIRECTIVE,
    STATUS_ASSESSMENT_PROMPT,
    TARGETED_FOLLOWUP_PROMPT,
    TARGETED_FOLLOWUP_FROM_PARTICIPANT_PROMPT,
)
from app.utils.sanitize import strip_thinking

LOG = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Session registry
# ---------------------------------------------------------------------------

_sessions: dict[str, Session] = {}


def get_session(sid: str) -> Session | None:
    return _sessions.get(sid)


def create_session() -> Session:
    s = Session()
    _sessions[s.session_id] = s
    return s


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------

def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _active_participants(session: Session) -> list[Participant]:
    return [p for p in session.participants if p.enabled]


def _orchestrator_model_id(session: Session) -> str:
    return session.orchestrator_model_id or settings.orchestrator_model


def _summarizer_model_id(session: Session) -> str:
    return select_summarizer_model_id(
        session.summarizer_model_id,
        session.orchestrator_model_id,
    )


def _format_history(
    messages: list[dict[str, Any]],
    *,
    include_orchestrator: bool = True,
) -> str:
    lines: list[str] = []
    for m in messages:
        if m.get("role") == "orchestrator" and not include_orchestrator:
            continue
        speaker = m.get("speaker_name") or m.get("speaker_id") or "(anon)"
        if m.get("role") == "orchestrator":
            speaker = "Orchestrator"
        lines.append(f"{speaker}: {m.get('text', '')}")
    return "\n".join(lines)


def _participant_roster_string(
    speaker: Participant,
    participants: list[Participant],
) -> str:
    others = [p.name for p in participants if p.participant_id != speaker.participant_id]
    return ", ".join(others) if others else "(no other participants)"


# Per-prompt cap on how much of a long pending-thread message we quote back
# to the speaker. The full message is still in the transcript above; this
# block is a "what specifically is owed to you" reminder, not a re-render.
_PENDING_TRUNCATE_CHARS = 600


def _pending_addressed_for(
    session: Session,
    speaker: Participant,
) -> list[tuple[str, str, str]]:
    """Return (asker_id, asker_name, message_text) for participant messages
    that addressed `speaker` since `speaker`'s last own-message turn.

    Used to (1) inject an "Open threads directed at you" block into per-
    speaker prompt templates and (2) populate the `replying_to` field on
    the speaker's outgoing message so the frontend can render a
    "Replying to X, Y" pill above the bubble.
    """
    last_own_idx = -1
    for i, m in enumerate(session.messages):
        if (
            m.get("role") == "participant"
            and m.get("speaker_id") == speaker.participant_id
        ):
            last_own_idx = i

    pending: list[tuple[str, str, str]] = []
    for m in session.messages[last_own_idx + 1:]:
        if m.get("role") != "participant":
            continue
        if m.get("addressed_to") != speaker.participant_id:
            continue
        asker_id = m.get("speaker_id") or "unknown"
        asker_name = m.get("speaker_name") or "another participant"
        text = (m.get("text") or "").strip()
        if not text:
            continue
        pending.append((asker_id, asker_name, text))
    return pending


def _format_pending_block(
    pending: list[tuple[str, str, str]],
) -> str:
    """Render the open-threads section that gets interpolated into per-
    speaker prompt templates. Always non-empty so templates read naturally;
    we explicitly print "(none)" when there are no open threads.
    """
    if not pending:
        return (
            "Open threads directed at you since your last turn: (none).\n\n"
        )
    lines = ["Open threads directed at you since your last turn:"]
    for _asker_id, asker_name, text in pending:
        snippet = text
        if len(snippet) > _PENDING_TRUNCATE_CHARS:
            snippet = snippet[:_PENDING_TRUNCATE_CHARS].rstrip() + "..."
        lines.append(f'  - {asker_name} said to you: "{snippet}"')
    return "\n".join(lines) + "\n\n"


def _replying_to_ids(pending: list[tuple[str, str, str]]) -> list[str]:
    """Stable, de-duplicated list of asker participant_ids extracted from a
    pending-thread list. Used to populate the message's `replying_to`
    field so the frontend can render the "Replying to X, Y" pill.
    """
    seen: set[str] = set()
    out: list[str] = []
    for asker_id, _name, _text in pending:
        if asker_id in seen:
            continue
        seen.add(asker_id)
        out.append(asker_id)
    return out


# ---------------------------------------------------------------------------
# Failsafe checks
# ---------------------------------------------------------------------------

def _participant_msg_cap_hit(session: Session) -> bool:
    return session.total_participant_messages >= session.participant_message_cap


def _orchestrator_cap_hit(session: Session) -> bool:
    return session.orchestrator_call_count >= session.orchestrator_call_cap


def _bump_orchestrator_count(session: Session) -> None:
    session.orchestrator_call_count += 1


async def _wait_for_continue(
    session: Session,
    reason: str,
) -> AsyncIterator[str]:
    """Pause the state machine until the user clicks Continue.

    Increment values come from `session.limits`, which the user can
    tune via the settings menu. Defaults match the historical
    PARTICIPANT_MESSAGE_PAUSE_INC / ORCHESTRATOR_CALL_PAUSE_INC.
    """
    session.paused_for_continue = True
    session.pause_reason = reason
    if reason == "messages":
        bump_inc = session.limits.participant_message_pause_inc
        msg = (
            f"Conversation paused after {session.total_participant_messages} "
            "participant messages. Click Continue to allow another "
            f"{bump_inc} messages."
        )
        evt = "failsafe_pause"
    else:
        bump_inc = session.limits.orchestrator_call_pause_inc
        msg = (
            f"Conversation paused after {session.orchestrator_call_count} "
            "orchestrator calls. Click Continue to allow another "
            f"{bump_inc} orchestrator calls."
        )
        evt = "orchestrator_cap_pause"

    yield _sse(evt, {
        "reason": reason,
        "message": msg,
        "participant_messages": session.total_participant_messages,
        "orchestrator_calls": session.orchestrator_call_count,
    })

    # Block until pending_continue is flipped by the API layer.
    while session.paused_for_continue and not session.pending_continue:
        await asyncio.sleep(0.25)
    session.pending_continue = False
    session.paused_for_continue = False
    if reason == "messages":
        session.participant_message_cap += bump_inc
    else:
        session.orchestrator_call_cap += bump_inc
    session.pause_reason = None
    for chunk in _orchestrator_banner_sse(session, "Resuming conversation..."):
        yield chunk


# ---------------------------------------------------------------------------
# Human-participant turn
# ---------------------------------------------------------------------------

async def _wait_for_human_text(
    session: Session,
    participant: Participant,
    *,
    phase: Phase,
    addressed_to: str | None = None,
    asker_id: str | None = None,
    asker_name: str | None = None,
    prompt_context: str | None = None,
) -> AsyncIterator[str]:
    """Pause the orchestrator until the human types a response (or skips).

    Yields a `human_turn_needed` SSE event with the metadata the
    frontend needs to render the input slot and the lower-screen
    "waiting for your input" cue, then polls the human_io slot until
    the API layer's POST /human-response sets it, then yields a
    `human_turn_cleared` event so the frontend can dismiss the cue.

    The actual response text + skipped flag are NOT returned from this
    generator (async gens can't return values cleanly). The caller
    reads them via `human_io.slot_for(session.session_id)` AFTER the
    iteration completes:

        slot.response_text   (str)
        slot.skipped         (bool)
        slot.started_at      (float)  - subtract from now() for elapsed
        slot.pending_snapshot (list)  - pending threads at turn-start

    Caller is expected to reset_slot after consuming the result.
    """
    started = time.time()
    pending = _pending_addressed_for(session, participant)
    slot = human_io.slot_for(session.session_id)
    slot.event.clear()
    slot.response_text = ""
    slot.skipped = False
    slot.started_at = started
    slot.pending_snapshot = pending

    awaiting = {
        "speaker_id": participant.participant_id,
        "speaker_name": participant.name,
        "phase": phase.value,
        "addressed_to": addressed_to,
        "asker_id": asker_id,
        "asker_name": asker_name,
        "prompt_context": prompt_context,
    }
    session.awaiting_human = awaiting
    session.paused_for_continue = True
    session.pause_reason = "human_turn"

    yield _sse("human_turn_needed", awaiting)

    try:
        # Poll with the same 0.25s cadence as _wait_for_continue so
        # SSE-stream cancellation propagates promptly to the user
        # clicking Stop.
        while not slot.event.is_set():
            await asyncio.sleep(0.25)
    finally:
        session.paused_for_continue = False
        session.pause_reason = None
        session.awaiting_human = None

    yield _sse("human_turn_cleared", {
        "speaker_id": participant.participant_id,
    })


async def _do_human_turn(
    session: Session,
    participant: Participant,
    *,
    phase: Phase,
    actives: list[Participant],
    addressed_to_target: str | None = None,
    asker_id: str | None = None,
    asker_name: str | None = None,
    prompt_context: str | None = None,
    classify_addressed: bool = False,
    track_initial_opinion: bool = False,
    track_final_opinion: bool = False,
    addressed_state: dict[str, Any] | None = None,
) -> AsyncIterator[str]:
    """End-to-end human turn: emit human_turn_needed, await response,
    emit human_turn_cleared, then either record a skip note or append a
    participant message (with addressed-to classification when asked).
    Yields SSE chunks throughout, then runs the failsafe-pause check.

    `addressed_state`, when provided, is a caller-owned dict that gets
    mutated with {"last_addressed": <participant_id|None>} after the
    turn so the consensus phase can update its routing variable
    without a return value sneaking out of the generator.
    """
    async for chunk in _wait_for_human_text(
        session, participant, phase=phase,
        addressed_to=addressed_to_target,
        asker_id=asker_id, asker_name=asker_name,
        prompt_context=prompt_context,
    ):
        yield chunk

    slot = human_io.slot_for(session.session_id)
    text = (slot.response_text or "").strip()
    skipped = slot.skipped
    elapsed = max(0.0, time.time() - slot.started_at)
    pending = list(slot.pending_snapshot or [])
    human_io.reset_slot(session.session_id)

    if skipped or not text:
        note = _add_orchestrator_message(
            session,
            f"{participant.name} declined to comment this turn.",
            kind="status",
        )
        yield _sse("orchestrator", _msg_payload(note))
        if addressed_state is not None:
            addressed_state["last_addressed"] = None
        return

    addressed: str | None = None
    if classify_addressed:
        addressed = await classify_addressed_to(
            orchestrator_model_id=orchestrator_fast_model_id(session),
            participants=actives,
            speaker_name=participant.name,
            message=text,
            api_log=session.api_log,
        )
        _bump_orchestrator_count(session)

    msg = _add_participant_message(
        session, participant, text,
        phase=phase, elapsed=elapsed,
        addressed_to=addressed,
        replying_to=_replying_to_ids(pending),
    )
    if track_initial_opinion:
        session.initial_opinions[participant.participant_id] = text
    if track_final_opinion:
        session.final_opinions[participant.participant_id] = text
    if addressed_state is not None:
        addressed_state["last_addressed"] = addressed

    yield _sse("message", _msg_payload(msg))

    if _participant_msg_cap_hit(session):
        async for chunk in _wait_for_continue(session, "messages"):
            yield chunk
    if _orchestrator_cap_hit(session):
        async for chunk in _wait_for_continue(session, "orchestrator"):
            yield chunk


# ---------------------------------------------------------------------------
# Participant turn (with context budgeting + summarize-on-demand)
# ---------------------------------------------------------------------------

async def _maybe_summarize_for_participant(
    session: Session,
    participant: Participant,
    api_messages: list[dict[str, Any]],
) -> None:
    """If this participant's input estimate exceeds the threshold, run a
    summarize call against the configured summarizer model and update
    `participant.summary` in place."""
    needs_sum, _trim, _budget = should_summarize(
        participant.model_id, api_messages, participant.summary,
    )
    if not needs_sum:
        return

    # Build a transcript that excludes orchestrator status banners (those
    # don't add information value to a summary) but keeps everything the
    # participant has said and heard.
    summarizable_msgs = [
        m for m in session.messages
        if m.get("role") != "orchestrator_status"
    ]
    if not summarizable_msgs:
        return

    transcript = _format_history(summarizable_msgs, include_orchestrator=False)
    if not transcript.strip():
        return

    summarizer_id = _summarizer_model_id(session)
    summary_text = await run_summarize(summarizer_id, transcript)
    # The summarizer counts as an orchestrator-side call for cap purposes.
    session.orchestrator_call_count += 1
    if summary_text:
        participant.summary.summary_text = summary_text
        participant.summary.summarized_through_idx = len(session.messages) - 1


async def _call_participant(
    *,
    session: Session,
    participant: Participant,
    user_prompt: str,
    label: str,
    max_tokens: int = 600,
    timeout: float = 45.0,
    stream_events: list[str] | None = None,
    stream_message_id: str | None = None,
) -> tuple[str, float, bool, str]:
    """Run one participant turn.

    Returns ``(text, elapsed_seconds, ok, error_kind)``.

    ``error_kind`` is ``""`` on success. On failure it's one of:
      * ``"transient"`` — HTTP 5xx, 429, timeout, connection error. The
        same model is worth retrying.
      * ``"permanent"`` — auth, invalid request, content filter, model
        gone. Retrying the same model won't help.
      * ``"empty"`` — call returned a 200 with an empty body. Treated
        as transient by the resilience layer (retry once before
        substituting).
      * ``"unknown"`` — orchestrator-side exception we couldn't
        classify.

    The state-machine handles auto-disable on repeated failure; the
    resilience layer (`services.resilience.run_resilient_turn`) handles
    in-turn retry / alternate / substitution under speed-priority.
    """
    others = _participant_roster_string(participant, _active_participants(session))
    base_directive = PARTICIPANT_BASE_DIRECTIVE.format(
        n_participants=len(_active_participants(session)),
        other_participants=others,
    )
    system_text = (
        f"{participant.role_prompt}\n\n{base_directive}\n\n{NO_REASONING_DIRECTIVE}"
    )
    api_messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_text},
        {"role": "user", "content": user_prompt},
    ]

    if participant.web_search_enabled or participant.documents_enabled:
        from app.services.knowledge.enrich import (
            build_retrieval_query,
            build_retrieved_context,
        )
        query = build_retrieval_query(session.question, session.messages)
        if stream_events is not None:
            stream_events.append(_sse("status", {
                "message": f"Retrieving sources for {participant.name}…",
            }))
        try:
            retrieved = await build_retrieved_context(
                participant_id=participant.participant_id,
                query=query,
                documents_enabled=participant.documents_enabled,
                web_search_enabled=participant.web_search_enabled,
            )
        except Exception as exc:  # noqa: BLE001
            LOG.warning(
                "Knowledge enrich failed for %s: %s",
                participant.participant_id, exc,
            )
            retrieved = ""
        if retrieved:
            user_prompt = f"{user_prompt}\n\n{retrieved}"
            api_messages[1] = {"role": "user", "content": user_prompt}

    if session.attached_documents:
        from app.services.knowledge.enrich import build_attachment_context

        attached = build_attachment_context(session.attached_documents)
        if attached:
            user_prompt = f"{user_prompt}\n\n{attached}"
            api_messages[1] = {"role": "user", "content": user_prompt}

    await _maybe_summarize_for_participant(session, participant, api_messages)

    needs_sum, needs_trim, input_budget = should_summarize(
        participant.model_id, api_messages, participant.summary,
    )

    # CCAI embeds the transcript inside the user prompt. When over budget,
    # swap that block for summary + recent tail (AskJerry pattern).
    if needs_sum or needs_trim:
        recent_transcript = _format_history(
            session.messages[-KEEP_RECENT_MESSAGES:],
            include_orchestrator=False,
        )
        compressed_block = build_compressed_transcript_block(
            participant.summary,
            recent_transcript,
        )
        if compressed_block:
            user_prompt = replace_embedded_transcript(user_prompt, compressed_block)
            api_messages[1] = {"role": "user", "content": user_prompt}
        elif len(user_prompt) > input_budget * 4:
            # Last-resort: keep prompt head + tail if no transcript header matched.
            keep = max(512, input_budget * 2)
            user_prompt = (
                user_prompt[:keep]
                + "\n\n[…middle truncated for context…]\n\n"
                + user_prompt[-keep:]
            )
            api_messages[1] = {"role": "user", "content": user_prompt}

    max_tokens = cap_max_tokens_for_window(
        participant.model_id, api_messages, max_tokens,
    )

    resolved = {
        "model_id": participant.model_id,
        "base_url": participant.base_url,
        "api_key": participant.api_key,
        "is_neon": participant.is_neon,
        "hana_model_id": participant.hana_model_id,
        "persona_name": participant.persona_name,
        "neon_direct_vllm": participant.neon_direct_vllm,
        "vllm_base_url": participant.vllm_base_url,
        "vllm_api_key": participant.vllm_api_key,
    }

    log_entry: dict[str, Any] = {
        "timestamp": time.time(),
        "label": f"participant:{participant.participant_id}:{label}",
        "model": participant.model_id,
        "request": {"messages": api_messages, "max_tokens": max_tokens},
    }

    msg_id = stream_message_id or str(uuid.uuid4())
    on_text_delta_cb = None
    if stream_events is not None:
        stream_events.append(_sse("message_stream_start", {
            "message_id": msg_id,
            "speaker_id": participant.participant_id,
            "speaker_name": participant.name,
            "kind": participant.kind,
            "phase": session.phase.value,
            "model_id": participant.model_id,
            "model_display": participant.display_name,
        }))

        def on_text_delta_cb(piece: str) -> None:
            stream_events.append(_sse("message_delta", {
                "message_id": msg_id,
                "delta": piece,
            }))

    try:
        result = await chat_completion(
            resolved=resolved,
            messages=api_messages,
            temperature=0.7,
            max_tokens=max_tokens,
            timeout=timeout,
            on_text_delta=on_text_delta_cb,
        )
    except Exception as exc:
        LOG.exception("Participant %s call failed: %s", participant.participant_id, exc)
        log_entry["response"] = {"error": str(exc)}
        session.api_log.append(log_entry)
        participant.consecutive_failures += 1
        return "", 0.0, False, "unknown"

    log_entry["response"] = result
    session.api_log.append(log_entry)

    if result.get("error"):
        participant.consecutive_failures += 1
        return (
            "",
            result.get("elapsed_seconds", 0),
            False,
            result.get("error_kind") or "permanent",
        )

    text = strip_thinking(result.get("response", ""))
    elapsed = float(result.get("elapsed_seconds", 0) or 0)
    if not text.strip():
        # 200 OK but the model returned nothing usable. Worth one
        # retry / substitute attempt before we surface participant_error.
        participant.consecutive_failures += 1
        return "", elapsed, False, "empty"

    participant.consecutive_failures = 0
    return text, elapsed, True, ""


def _add_participant_message(
    session: Session,
    participant: Participant,
    text: str,
    *,
    phase: Phase,
    elapsed: float,
    addressed_to: str | None = None,
    replying_to: list[str] | None = None,
    message_id: str | None = None,
) -> dict[str, Any]:
    msg = {
        "message_id": message_id or str(uuid.uuid4()),
        "speaker_id": participant.participant_id,
        "speaker_name": participant.name,
        "role": "participant",
        # `kind` lets the frontend distinguish a human participant's
        # message ("human") from LLM messages ("neon" | "extra" |
        # "expert") so the green left-edge accent can be applied
        # independently of the rotating color palette.
        "kind": participant.kind,
        "text": text,
        "phase": phase.value,
        "timestamp": time.time(),
        "elapsed_seconds": round(elapsed, 2),
        "addressed_to": addressed_to,
        # `replying_to` mirrors the pending-thread list we showed the
        # speaker at turn-start: ordered, de-duplicated participant_ids of
        # everyone whose questions this turn was supposed to address.
        # Empty list when there were no open threads. The frontend renders
        # this as a "Replying to X, Y" pill above the bubble.
        "replying_to": list(replying_to) if replying_to else [],
        "model_id": participant.model_id,
        "model_display": participant.display_name,
    }
    session.messages.append(msg)
    session.total_participant_messages += 1
    return msg


def _add_orchestrator_message(
    session: Session,
    text: str,
    *,
    kind: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    msg = {
        "speaker_id": "orchestrator",
        "speaker_name": "Orchestrator",
        "role": "orchestrator",
        "kind": kind,  # "status" | "factor" | "majority_report" | "no_consensus_report"
        "text": text,
        "phase": session.phase.value,
        "timestamp": time.time(),
    }
    if extra:
        msg.update(extra)
    session.messages.append(msg)
    return msg


def _msg_payload(msg: dict[str, Any]) -> dict[str, Any]:
    """Public payload for a message event over SSE."""
    return msg


def _orchestrator_banner_sse(
    session: Session,
    text: str,
    *,
    kind: str = "status",
    extra: dict[str, Any] | None = None,
) -> list[str]:
    """Append an orchestrator line to the transcript and emit chat + status SSE."""
    msg = _add_orchestrator_message(session, text, kind=kind, extra=extra)
    return [
        _sse("orchestrator", _msg_payload(msg)),
        _sse("status", {"message": text}),
    ]


def _participant_turn_failure_sse(
    session: Session,
    participant: Participant,
) -> list[str]:
    """Emit participant_error and auto-disable banner when threshold hit."""
    out = [
        _sse("participant_error", {
            "participant_id": participant.participant_id,
            "name": participant.name,
            "phase": session.phase.value,
        }),
    ]
    if participant.consecutive_failures >= session.limits.auto_disable_failures:
        participant.enabled = False
        out.extend(_orchestrator_banner_sse(
            session,
            f"{participant.name} auto-disabled after "
            f"{session.limits.auto_disable_failures} consecutive failures.",
        ))
    return out


# ---------------------------------------------------------------------------
# Credential summary (concurrent with Phase 1)
# ---------------------------------------------------------------------------

async def _credential_build_runner(
    session: Session,
    participant: Participant,
    initial_opinion: str,
) -> None:
    """Background task: one participant's credential row."""
    try:
        cred = await build_credential_for_participant(
            orchestrator_model_id=_orchestrator_model_id(session),
            question=session.question,
            participant=participant,
            initial_opinion=initial_opinion,
            api_log=session.api_log,
        )
        session.credential_entries_by_pid[participant.participant_id] = cred
        session.credential_model_by_pid[participant.participant_id] = (
            participant.model_id
        )
        _bump_orchestrator_count(session)
    except Exception as exc:
        LOG.exception(
            "Credential build failed for %s: %s",
            participant.participant_id,
            exc,
        )


def _schedule_phase1_credential_build(
    session: Session,
    participant: Participant,
    initial_opinion: str,
) -> None:
    """Start (or restart) a background credential build for one AI participant."""
    if participant.kind == "human":
        return
    if not (initial_opinion or "").strip():
        return

    pid = participant.participant_id
    existing = session.credential_build_tasks.get(pid)
    if existing is not None and not existing.done():
        existing.cancel()

    session.credential_build_tasks[pid] = asyncio.create_task(
        _credential_build_runner(session, participant, initial_opinion),
        name=f"credential:{pid}",
    )


def _sync_credential_summary_from_entries(session: Session) -> None:
    session.credential_summary = assemble_credential_summary_list(
        participants=_active_participants(session),
        credential_entries_by_pid=session.credential_entries_by_pid,
        human_credential=session.human_credential,
    )


async def _await_phase1_credential_tasks(session: Session) -> None:
    """Wait for any in-flight per-participant credential builds."""
    tasks = [
        t for t in session.credential_build_tasks.values()
        if t is not None and not t.done()
    ]
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
    _sync_credential_summary_from_entries(session)


async def _rebuild_participant_credential_on_model_change(
    session: Session,
    participant: Participant,
) -> bool:
    """Rebuild one credential row when the backing LLM model changes."""
    if participant.kind == "human":
        return False
    pid = participant.participant_id
    opinion = (session.initial_opinions or {}).get(pid, "")
    if not opinion.strip():
        return False
    prior_model = session.credential_model_by_pid.get(pid)
    if not prior_model or prior_model == participant.model_id:
        return False

    cred = await build_credential_for_participant(
        orchestrator_model_id=_orchestrator_model_id(session),
        question=session.question,
        participant=participant,
        initial_opinion=opinion,
        api_log=session.api_log,
    )
    _bump_orchestrator_count(session)
    session.credential_entries_by_pid[pid] = cred
    session.credential_model_by_pid[pid] = participant.model_id
    _sync_credential_summary_from_entries(session)
    return True


# ---------------------------------------------------------------------------
# Phase implementations
# ---------------------------------------------------------------------------

async def _phase_initial_opinions(session: Session) -> AsyncIterator[str]:
    session.phase = Phase.INITIAL_OPINIONS
    for chunk in _orchestrator_banner_sse(
        session, "Phase 1: collecting independent first opinions...",
    ):
        yield chunk

    actives = _active_participants(session)

    async def _human_initial(p: Participant) -> AsyncIterator[str]:
        async for chunk in _do_human_turn(
            session, p, phase=session.phase, actives=actives,
            track_initial_opinion=True,
            prompt_context=(
                "Share your initial opinion on the question. "
                "You're speaking BEFORE seeing the other participants."
            ),
        ):
            yield chunk

    async def _post_initial(result: _AiTurnResult) -> dict[str, Any]:
        speaker = result.turn.speaker
        session.initial_opinions[speaker.participant_id] = result.turn.text
        _schedule_phase1_credential_build(
            session, speaker, result.turn.text,
        )
        return {}

    def _build_initial_spec(p: Participant) -> _AiTurnSpec | None:
        if p.kind == "human":
            return None
        return _AiTurnSpec(
            participant=p,
            user_prompt=INITIAL_OPINION_PROMPT.format(question=session.question),
            label="initial_opinion",
            max_tokens=700,
        )

    async for chunk in run_initial_opinions_roster(
        session,
        actives,
        build_spec=_build_initial_spec,
        call_participant=_call_participant,
        on_human_turn=_human_initial,
        post_process=_post_initial,
    ):
        yield chunk

    # Credential rows were built in parallel as each opinion landed;
    # only wait here if any background task is still finishing.
    await _await_phase1_credential_tasks(session)
    yield _sse("credentials_updated", {
        "stage": "built",
        "credentials": session.credential_summary,
    })


_CRITIQUE_PHASES = {
    1: Phase.CRITIQUE_ROUND_1,
    2: Phase.CRITIQUE_ROUND_2,
    3: Phase.CRITIQUE_ROUND_3,
    4: Phase.CRITIQUE_ROUND_4,
}


def _critique_phase_for(round_number: int) -> Phase:
    """Map a critique round number to the matching Phase enum value.
    Falls back to CRITIQUE_ROUND_2 for unknown numbers - the API layer
    clamps `critique_rounds` to the bounds, so this fallback is purely
    defensive."""
    return _CRITIQUE_PHASES.get(round_number, Phase.CRITIQUE_ROUND_2)


async def _phase_critique(session: Session, round_number: int) -> AsyncIterator[str]:
    session.phase = _critique_phase_for(round_number)
    round_total = session.limits.critique_rounds
    for chunk in _orchestrator_banner_sse(
        session,
        f"Phase 2: critique round {round_number} of {round_total}...",
    ):
        yield chunk
    cred_block = credentials_to_block(session.credential_summary)
    actives = _active_participants(session)
    # Freeze transcript + pending threads at round start so parallel
    # turns see the same context and reply metadata stays consistent.
    transcript_snapshot = _format_history(session.messages)
    pending_snapshot = {
        p.participant_id: _pending_addressed_for(session, p)
        for p in actives
        if p.kind != "human"
    }

    async def _human_critique(p: Participant) -> AsyncIterator[str]:
        async for chunk in _do_human_turn(
            session, p, phase=session.phase, actives=actives,
            classify_addressed=True,
            prompt_context=(
                f"Critique round {round_number} of {round_total}. "
                "Push back on, agree with, or build on what others "
                "have said. Address other participants by name."
            ),
        ):
            yield chunk

    def _build_critique_spec(p: Participant) -> _AiTurnSpec | None:
        if p.kind == "human":
            return None
        pending = pending_snapshot.get(p.participant_id, [])
        pending_block = _format_pending_block(pending)
        prompt = CRITIQUE_PROMPT.format(
            round_number=round_number,
            round_total=round_total,
            question=session.question,
            credential_summary=cred_block,
            transcript=transcript_snapshot,
            pending_block=pending_block,
        )
        return _AiTurnSpec(
            participant=p,
            user_prompt=prompt,
            label=f"critique_round_{round_number}",
            max_tokens=700,
        )

    async def _post_critique(result: _AiTurnResult) -> dict[str, Any]:
        speaker = result.turn.speaker
        addressed = await classify_addressed_to(
            orchestrator_model_id=orchestrator_fast_model_id(session),
            participants=_active_participants(session),
            speaker_name=speaker.name,
            message=result.turn.text,
            api_log=session.api_log,
        )
        _bump_orchestrator_count(session)
        return {
            "addressed_to": addressed,
            "replying_to": _replying_to_ids(result.pending),
        }

    async for chunk in run_roster_ai_turns_parallel(
        session,
        actives,
        phase=session.phase,
        build_spec=_build_critique_spec,
        call_participant=_call_participant,
        on_human_turn=_human_critique,
        post_process=_post_critique,
    ):
        yield chunk


async def _phase_status_assessment(session: Session) -> AsyncIterator[str]:
    session.phase = Phase.STATUS_ASSESSMENT
    for chunk in _orchestrator_banner_sse(
        session, "Phase 3: assessing whether more questions are needed...",
    ):
        yield chunk

    cred_block = credentials_to_block(session.credential_summary)

    for iteration in range(session.limits.status_assessment_max):
        session.status_assessment_iterations = iteration + 1
        transcript = await compact_transcript_for_orchestrator(
            session,
            orchestrator_model_id=orchestrator_fast_model_id(session),
        )
        prompt = STATUS_ASSESSMENT_PROMPT.format(
            question=session.question,
            credential_summary=cred_block,
            transcript=transcript,
        )
        _raw, parsed = await orchestrator_call(
            orchestrator_model_id=_orchestrator_model_id(session),
            user_prompt=prompt,
            label=f"status_assessment_{iteration + 1}",
            api_log=session.api_log,
            max_tokens=512,
        )
        _bump_orchestrator_count(session)

        opinions_solidified = bool(
            isinstance(parsed, dict) and parsed.get("opinions_solidified")
        )
        open_qs: list[dict[str, Any]] = []
        if isinstance(parsed, dict):
            open_qs = parsed.get("open_questions") or []

        if opinions_solidified or not open_qs:
            msg = _add_orchestrator_message(
                session,
                "Opinions appear solidified - moving to finalization.",
                kind="status",
            )
            yield _sse("orchestrator", _msg_payload(msg))
            return

        # Otherwise run targeted follow-ups
        active_ids = {p.participant_id for p in _active_participants(session)}
        for oq in open_qs:
            pid = oq.get("participant_id")
            question_text = (oq.get("question") or "").strip()
            if not pid or pid not in active_ids or not question_text:
                continue
            target = next(p for p in session.participants if p.participant_id == pid)

            # Decide synthesized vs verbatim. Source of truth is
            # asker_participant_id - if it resolves to a real, *different*,
            # active participant we treat the question as verbatim from
            # them. Otherwise we treat it as orchestrator-synthesized.
            asker_id = (oq.get("asker_participant_id") or "").strip() or None
            asker: Participant | None = None
            if asker_id and asker_id in active_ids and asker_id != pid:
                asker = next(
                    p for p in session.participants
                    if p.participant_id == asker_id
                )

            if asker is not None:
                announce = (
                    f"{asker.name} raised a question earlier, to "
                    f"{target.name}: \"{question_text}\""
                )
            else:
                announce = (
                    f"I have a follow-up question for {target.name}: "
                    f"\"{question_text}\""
                )
            announce_msg = _add_orchestrator_message(session, announce, kind="status")
            yield _sse("orchestrator", _msg_payload(announce_msg))

            if target.kind == "human":
                async for chunk in _do_human_turn(
                    session, target, phase=session.phase,
                    actives=_active_participants(session),
                    asker_id=(asker.participant_id if asker else None),
                    asker_name=(asker.name if asker else None),
                    prompt_context=question_text,
                ):
                    yield chunk
                continue

            transcript = _format_history(session.messages)
            if asker is not None:
                prompt2 = TARGETED_FOLLOWUP_FROM_PARTICIPANT_PROMPT.format(
                    transcript=transcript,
                    credential_summary=cred_block,
                    targeted_question=question_text,
                    asker_name=asker.name,
                )
            else:
                prompt2 = TARGETED_FOLLOWUP_PROMPT.format(
                    transcript=transcript,
                    credential_summary=cred_block,
                    targeted_question=question_text,
                )
            stream_msg_id = str(uuid.uuid4())
            turn = None
            async for item in iter_resilient_turn_sse(
                session=session, participant=target,
                user_prompt=prompt2,
                label="targeted_followup",
                max_tokens=600,
                call_participant=_call_participant,
                stream_message_id=stream_msg_id,
            ):
                if isinstance(item, tuple) and item and item[0] == "turn":
                    _, turn, stream_msg_id = item
                else:
                    yield item
            assert turn is not None
            for ev in turn.sse_events:
                yield ev
            if not turn.ok:
                for chunk in _participant_turn_failure_sse(session, target):
                    yield chunk
                continue
            speaker = turn.speaker
            text, elapsed = turn.text, turn.elapsed
            # When the orchestrator is relaying a verbatim question from
            # another participant, mark this turn as replying to that
            # asker so the frontend can render the "Replying to X" pill.
            replying_to = [asker.participant_id] if asker is not None else []
            msg = _add_participant_message(
                session, speaker, text, phase=session.phase, elapsed=elapsed,
                replying_to=replying_to,
                message_id=stream_msg_id,
            )
            yield _sse("message", _msg_payload(msg))

            if _participant_msg_cap_hit(session):
                async for chunk in _wait_for_continue(session, "messages"):
                    yield chunk
            if _orchestrator_cap_hit(session):
                async for chunk in _wait_for_continue(session, "orchestrator"):
                    yield chunk

    msg = _add_orchestrator_message(
        session,
        "Moving to finalization.",
        kind="status",
    )
    yield _sse("orchestrator", _msg_payload(msg))


async def _phase_finalization(session: Session) -> AsyncIterator[str]:
    session.phase = Phase.FINALIZATION
    for chunk in _orchestrator_banner_sse(session, "Phase 4: opinion finalization..."):
        yield chunk

    cred_block = credentials_to_block(session.credential_summary)
    actives = _active_participants(session)
    transcript_snapshot = _format_history(session.messages)
    pending_snapshot = {
        p.participant_id: _pending_addressed_for(session, p)
        for p in actives
        if p.kind != "human"
    }

    async def _human_final(p: Participant) -> AsyncIterator[str]:
        async for chunk in _do_human_turn(
            session, p, phase=session.phase, actives=actives,
            track_final_opinion=True,
            prompt_context=(
                "Phase 4: state your final opinion on the question, "
                "incorporating whatever you've learned in the discussion."
            ),
        ):
            yield chunk

    def _build_final_spec(p: Participant) -> _AiTurnSpec | None:
        if p.kind == "human":
            return None
        pending = pending_snapshot.get(p.participant_id, [])
        pending_block = _format_pending_block(pending)
        prompt = FINALIZATION_PROMPT.format(
            question=session.question,
            credential_summary=cred_block,
            transcript=transcript_snapshot,
            pending_block=pending_block,
        )
        return _AiTurnSpec(
            participant=p,
            user_prompt=prompt,
            label="finalization",
            max_tokens=600,
        )

    async def _post_final(result: _AiTurnResult) -> dict[str, Any]:
        session.final_opinions[result.participant.participant_id] = result.turn.text
        return {"replying_to": _replying_to_ids(result.pending)}

    async for chunk in run_roster_ai_turns_parallel(
        session,
        actives,
        phase=session.phase,
        build_spec=_build_final_spec,
        call_participant=_call_participant,
        on_human_turn=_human_final,
        post_process=_post_final,
    ):
        yield chunk


async def _phase_consensus(session: Session) -> AsyncIterator[str]:
    session.phase = Phase.CONSENSUS
    for chunk in _orchestrator_banner_sse(session, "Phase 5: consensus gathering..."):
        yield chunk

    cred_block = credentials_to_block(session.credential_summary)
    actives = _active_participants(session)

    # Initial alliance detection from the finalization-phase opinions
    groups = await detect_alliances(
        orchestrator_model_id=_orchestrator_model_id(session),
        question=session.question,
        participants=actives,
        final_opinions=session.final_opinions,
        api_log=session.api_log,
    )
    _bump_orchestrator_count(session)
    session.alliance_groups = groups

    # Render alliance group members using the same display names shown
    # in the sidebar (Participant.name), not raw participant_ids.
    id_to_name = {p.participant_id: p.name for p in actives}
    alliance_prefix = (
        "Updated alliance groups detected: "
        if session.consensus_attempts > 0
        else "Alliance groups detected: "
    )
    announce = alliance_prefix + "; ".join(
        f"\"{g.get('stance', '')}\" -> ["
        + ", ".join(
            id_to_name.get(m, m) for m in (g.get("members") or [])
        )
        + "]"
        for g in groups
    )
    msg = _add_orchestrator_message(session, announce, kind="status")
    yield _sse("orchestrator", _msg_payload(msg))

    # Round-robin among active participants, but yield to the addressed-to
    # target whenever the previous message named one explicitly. To keep
    # two participants from monopolizing the floor with an A->B->A->B
    # loop, we cap consecutive addressed-to routings at the configured
    # `dyad_cap`. After that many in a row, we force a round-robin pick.
    queue: list[Participant] = list(actives)
    last_addressed: str | None = None
    dyad_run: int = 0
    dyad_cap = session.limits.dyad_cap

    # Hard backstop on this phase: if we make a lot of consensus turns
    # without resolving, exit and let closure handle it. The orchestrator-
    # call cap will usually hit before this, but it's a clean upper bound.
    max_consensus_turns = (
        session.limits.consensus_turns_per_participant * len(actives)
    )
    consensus_turns = 0

    while consensus_turns < max_consensus_turns:
        consensus_turns += 1
        actives = _active_participants(session)
        if len(actives) < 2:
            break
        queue = [p for p in queue if p.enabled]

        # Pick speaker. Prefer the addressed-to target (dyadic exchange)
        # only while we're under the consecutive-routing cap. Once the
        # cap is hit, force a round-robin pick so a third voice can join.
        if last_addressed and dyad_run < dyad_cap:
            speaker = next(
                (p for p in actives if p.participant_id == last_addressed),
                None,
            )
            if speaker is None:
                speaker = queue[0] if queue else actives[0]
                dyad_run = 0
            else:
                queue = [p for p in queue if p.participant_id != speaker.participant_id]
                dyad_run += 1
            last_addressed = None
        else:
            if not queue:
                queue = list(actives)
            speaker = queue.pop(0)
            dyad_run = 0
            last_addressed = None

        if speaker.kind == "human":
            addressed_state: dict[str, Any] = {}
            async for chunk in _do_human_turn(
                session, speaker, phase=session.phase, actives=actives,
                classify_addressed=True,
                addressed_state=addressed_state,
                prompt_context=(
                    "Phase 5: weigh in on whether you agree, disagree, "
                    "or want to refine. Address other participants by "
                    "name when you're responding to something specific "
                    "they said."
                ),
            ):
                yield chunk
            # Propagate addressed_to so dyad routing also works when the
            # last speaker was the human.
            last_addressed = addressed_state.get("last_addressed")
            # Status check every full round (every len(actives) turns).
            # Replicated here because the LLM-path code below also does
            # it, and we need it on the human path too.
            if consensus_turns % max(1, len(actives)) == 0:
                terminal = await _consensus_status_terminal_sse(session, actives)
                if terminal:
                    yield terminal
                    return
            continue

        # Decide allied vs solo prompt
        speaker_group, other_groups = _find_speaker_group(speaker, session.alliance_groups)
        prompt = _build_consensus_prompt(
            session, speaker, speaker_group, other_groups,
            actives, cred_block,
        )

        # Snapshot pending threads BEFORE the call so the outgoing
        # message records who this turn was supposed to be replying to.
        pending = _pending_addressed_for(session, speaker)

        stream_msg_id = str(uuid.uuid4())
        turn = None
        async for item in iter_resilient_turn_sse(
            session=session, participant=speaker,
            user_prompt=prompt,
            label="consensus",
            max_tokens=700,
            call_participant=_call_participant,
            stream_message_id=stream_msg_id,
        ):
            if isinstance(item, tuple) and item and item[0] == "turn":
                _, turn, stream_msg_id = item
            else:
                yield item
        assert turn is not None
        for ev in turn.sse_events:
            yield ev
        if not turn.ok:
            for chunk in _participant_turn_failure_sse(session, speaker):
                yield chunk
            continue
        # Consensus phase doesn't swap participants, only LLMs behind
        # them, so turn.speaker is the same instance as `speaker`. Use
        # turn.speaker to stay consistent with other phases.
        speaker = turn.speaker
        text, elapsed = turn.text, turn.elapsed

        addressed = await classify_addressed_to(
            orchestrator_model_id=orchestrator_fast_model_id(session),
            participants=actives,
            speaker_name=speaker.name,
            message=text,
            api_log=session.api_log,
        )
        _bump_orchestrator_count(session)
        last_addressed = addressed

        msg = _add_participant_message(
            session, speaker, text, phase=session.phase, elapsed=elapsed,
            addressed_to=addressed,
            replying_to=_replying_to_ids(pending),
            message_id=stream_msg_id,
        )
        yield _sse("message", _msg_payload(msg))

        if _participant_msg_cap_hit(session):
            async for chunk in _wait_for_continue(session, "messages"):
                yield chunk
        if _orchestrator_cap_hit(session):
            async for chunk in _wait_for_continue(session, "orchestrator"):
                yield chunk

        # Status check every full round (every len(actives) turns)
        if consensus_turns % max(1, len(actives)) == 0:
            terminal = await _consensus_status_terminal_sse(session, actives)
            if terminal:
                yield terminal
                return


async def _consensus_status_terminal_sse(
    session: Session,
    actives: list[Participant],
) -> str | None:
    """Run a consensus status check. Returns an SSE chunk when the phase
    should end (majority or unproductive), else None."""
    transcript = await compact_transcript_for_orchestrator(
        session,
        orchestrator_model_id=orchestrator_fast_model_id(session),
    )
    status = await assess_consensus_status(
        orchestrator_model_id=orchestrator_fast_model_id(session),
        question=session.question,
        transcript=transcript,
        alliance_groups=session.alliance_groups,
        api_log=session.api_log,
    )
    _bump_orchestrator_count(session)
    if status.get("status") == "majority":
        session.alliance_groups = await _refresh_alliance_groups(session, actives)
        msg = _add_orchestrator_message(
            session,
            f"Majority reached. {status.get('rationale', '')}".strip(),
            kind="status",
        )
        return _sse("orchestrator", _msg_payload(msg))
    if status.get("status") == "unproductive":
        msg = _add_orchestrator_message(
            session,
            f"Conversation no longer productive. {status.get('rationale', '')}".strip(),
            kind="status",
        )
        return _sse("orchestrator", _msg_payload(msg))
    return None


async def _refresh_alliance_groups(
    session: Session,
    actives: list[Participant],
) -> list[dict[str, Any]]:
    """Re-cluster after the consensus phase, treating the latest round of
    consensus statements as each participant's current stance."""
    latest_by_id: dict[str, str] = {}
    for m in session.messages:
        if m.get("role") != "participant":
            continue
        if m.get("phase") != Phase.CONSENSUS.value:
            continue
        latest_by_id[m["speaker_id"]] = m["text"]
    # Fall back to finalization opinions for any participant who didn't
    # speak in the consensus phase yet.
    merged: dict[str, str] = dict(session.final_opinions)
    merged.update(latest_by_id)
    groups = await detect_alliances(
        orchestrator_model_id=_orchestrator_model_id(session),
        question=session.question,
        participants=actives,
        final_opinions=merged,
        api_log=session.api_log,
    )
    _bump_orchestrator_count(session)
    return groups


def _find_speaker_group(
    speaker: Participant,
    groups: list[dict[str, Any]],
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    speaker_group: dict[str, Any] | None = None
    others: list[dict[str, Any]] = []
    for g in groups:
        if speaker.participant_id in (g.get("members") or []):
            speaker_group = g
        else:
            others.append(g)
    return speaker_group, others


def _build_consensus_prompt(
    session: Session,
    speaker: Participant,
    speaker_group: dict[str, Any] | None,
    other_groups: list[dict[str, Any]],
    actives: list[Participant],
    cred_block: str,
) -> str:
    transcript = _format_history(session.messages)
    pending_block = _format_pending_block(
        _pending_addressed_for(session, speaker)
    )

    # NOTE: The "speaker is whoever was addressed last" routing happens in
    # _phase_consensus, NOT here. This function only renders the prompt the
    # speaker receives. Whatever needs answering shows up in pending_block,
    # so a single unified allied/solo template handles both targeted and
    # broadcast turns - the prompt's "FIRST address open threads" rule
    # naturally focuses the speaker on whoever was just talking to them.
    if speaker_group and len(speaker_group.get("members") or []) > 1:
        members = ", ".join(
            p.name for p in actives
            if p.participant_id in (speaker_group.get("members") or [])
            and p.participant_id != speaker.participant_id
        ) or "(no co-allies named)"
        return CONSENSUS_ALLIED_PROMPT.format(
            alliance_members=members,
            alliance_stance=speaker_group.get("stance", "(unspecified)"),
            question=session.question,
            credential_summary=cred_block,
            transcript=transcript,
            pending_block=pending_block,
        )

    other_groups_block = "\n".join(
        f"  - \"{g.get('stance', '')}\" supported by " + ", ".join(
            p.name for p in actives if p.participant_id in (g.get("members") or [])
        )
        for g in other_groups
    ) or "(no other groups)"
    return CONSENSUS_SOLO_PROMPT.format(
        your_stance=(speaker_group or {}).get("stance", "(unspecified)"),
        other_groups_block=other_groups_block,
        question=session.question,
        credential_summary=cred_block,
        transcript=transcript,
        pending_block=pending_block,
    )


# ---------------------------------------------------------------------------
# Closure
# ---------------------------------------------------------------------------

async def _phase_closure(session: Session) -> AsyncIterator[str]:
    session.phase = Phase.CLOSURE
    for chunk in _orchestrator_banner_sse(session, "Phase 6: closure..."):
        yield chunk

    cred_block = credentials_to_block(session.credential_summary)
    transcript = await compact_transcript_for_orchestrator(
        session,
        orchestrator_model_id=orchestrator_fast_model_id(session),
    )

    status = await assess_consensus_status(
        orchestrator_model_id=orchestrator_fast_model_id(session),
        question=session.question,
        transcript=transcript,
        alliance_groups=session.alliance_groups,
        api_log=session.api_log,
    )
    _bump_orchestrator_count(session)

    actives = _active_participants(session)
    if status.get("status") == "majority":
        idx = status.get("majority_group_index")
        majority_group = None
        if isinstance(idx, int) and 0 <= idx < len(session.alliance_groups):
            majority_group = session.alliance_groups[idx]
        else:
            # Fallback: largest group wins
            if session.alliance_groups:
                majority_group = max(
                    session.alliance_groups,
                    key=lambda g: len(g.get("members") or []),
                )
        if majority_group:
            members_names = [
                p.name for p in actives
                if p.participant_id in (majority_group.get("members") or [])
            ]
            stance = majority_group.get("stance", "")
            prompt = MAJORITY_REPORT_PROMPT.format(
                question=session.question,
                credential_summary=cred_block,
                majority_members=", ".join(members_names),
                majority_stance=stance,
                transcript=transcript,
            )
            raw, _ = await orchestrator_call(
                orchestrator_model_id=_orchestrator_model_id(session),
                user_prompt=prompt,
                label="majority_report",
                api_log=session.api_log,
                expect_json=False,
                max_tokens=900,
                temperature=0.3,
            )
            _bump_orchestrator_count(session)
            session.final_report = {
                "kind": "majority",
                "text": raw,
                "majority_members": members_names,
                "majority_stance": stance,
                "alliance_groups": session.alliance_groups,
            }
            msg = _add_orchestrator_message(
                session, raw, kind="majority_report",
                extra={
                    "majority_members": members_names,
                    "majority_stance": stance,
                    "alliance_groups": session.alliance_groups,
                },
            )
            yield _sse("orchestrator", _msg_payload(msg))
            return

    # Not productive / no majority. We may surface an unaddressed
    # factor and re-run consensus up to `stall_recovery_attempts` times
    # before giving up and emitting the no-consensus report.
    if session.consensus_attempts < session.limits.stall_recovery_attempts:
        session.consensus_attempts += 1
        factor = await find_unaddressed_factor(
            orchestrator_model_id=_orchestrator_model_id(session),
            question=session.question,
            credential_summary_block=cred_block,
            transcript=transcript,
            api_log=session.api_log,
        )
        _bump_orchestrator_count(session)
        if factor and factor.get("factor"):
            announce = (
                f"The discussion has stalled. The orchestrator surfaces a new "
                f"factor for the group to consider: {factor['factor']}"
            )
            msg = _add_orchestrator_message(
                session, announce, kind="factor",
                extra={"expected_to_shift": factor.get("expected_to_shift") or []},
            )
            yield _sse("orchestrator", _msg_payload(msg))
            # Re-run the consensus phase once more
            async for chunk in _phase_consensus(session):
                yield chunk
            async for chunk in _phase_closure(session):
                yield chunk
            return

    # Failed twice (or no factor surfaced) -> emit no-consensus report
    prompt = NO_CONSENSUS_REPORT_PROMPT.format(
        question=session.question,
        credential_summary=cred_block,
        alliance_block="\n".join(
            f"  - \"{g.get('stance', '')}\": "
            + ", ".join(
                p.name for p in actives
                if p.participant_id in (g.get("members") or [])
            )
            for g in session.alliance_groups
        ),
        transcript=transcript,
    )
    raw, _ = await orchestrator_call(
        orchestrator_model_id=_orchestrator_model_id(session),
        user_prompt=prompt,
        label="no_consensus_report",
        api_log=session.api_log,
        expect_json=False,
        max_tokens=900,
        temperature=0.3,
    )
    _bump_orchestrator_count(session)
    session.final_report = {
        "kind": "no_consensus",
        "text": raw,
        "alliance_groups": session.alliance_groups,
    }
    msg = _add_orchestrator_message(
        session, raw, kind="no_consensus_report",
        extra={"alliance_groups": session.alliance_groups},
    )
    yield _sse("orchestrator", _msg_payload(msg))


# ---------------------------------------------------------------------------
# Public driver
# ---------------------------------------------------------------------------

async def run_conversation(session: Session) -> AsyncIterator[str]:
    """Drive the full conversation, yielding SSE chunks.

    The flow is structure → decision: the chosen ConversationStructure
    runs its phases, then hands a DecisionInput to the chosen
    DecisionMethod which runs the decision phase(s). Both are
    resolved from `session.conversation_structure_id` /
    `session.decision_method_id` (defaults: collaborative + consensus,
    which preserves the original CCAI behavior).
    """
    # Lazy import so the conversation package can import orchestrator
    # helpers without a circular module load.
    from app.services.conversation import get_structure, get_decision

    actives = _active_participants(session)
    if len(actives) < 2:
        yield _sse("error", {
            "message": "Need at least 2 active participants to start.",
        })
        yield _sse("done", {})
        return
    if len(actives) > session.max_participants:
        # Defense in depth - the API layer should have already enforced this.
        for extra in actives[session.max_participants:]:
            extra.enabled = False

    structure_cls = get_structure(session.conversation_structure_id)
    decision_cls = get_decision(session.decision_method_id)
    structure = structure_cls(session)

    try:
        async for chunk in structure.run():
            yield chunk

        # Kick off contribution summaries in the background just before
        # the decision phase. The Table View blocks on this task only if
        # the user opens it before it finishes - usually it'll be done
        # by then, so the table loads instantly.
        _start_contribution_summary_task(session)

        decision_input = structure.build_decision_input()
        decision = decision_cls(session, decision_input)
        async for chunk in decision.run():
            yield chunk
    except Exception as exc:
        LOG.exception("Conversation crashed: %s", exc)
        yield _sse("error", {"message": f"Internal error: {exc}"})
    finally:
        session.finished = True
        session.phase = Phase.FINISHED
        # Drop the human-input slot (if any) so its asyncio.Event
        # doesn't outlive the session in the module-level registry.
        human_io.drop_session(session.session_id)

    yield _sse("system", {"text": "End of Chat", "phase": session.phase.value})
    yield _sse("done", {})


def _start_contribution_summary_task(session: Session) -> None:
    """Schedule the contribution-summary build as a background task.

    Idempotent: if a task is already in flight (or completed) we don't
    start another one. Errors in the background task are swallowed and
    logged - the Table View endpoint will fall back to a synchronous
    build if needed.
    """
    if session.contribution_summary_task is not None:
        return
    if any((session.contribution_summaries or {}).values()):
        return

    async def _runner() -> None:
        try:
            await _build_contribution_summaries(session)
        except Exception as exc:  # noqa: BLE001
            LOG.warning(
                "Background contribution_summaries failed for %s: %s",
                session.session_id, exc,
            )

    try:
        session.contribution_summary_task = asyncio.create_task(_runner())
    except RuntimeError:
        session.contribution_summary_task = None


async def ensure_contribution_summaries(session: Session) -> None:
    """Block on contribution summaries for the Table View.

    Order of preference:
      1. Cached - return immediately.
      2. Background task in flight - await it.
      3. Nothing started - build synchronously.
    """
    if any((session.contribution_summaries or {}).values()):
        return
    task = session.contribution_summary_task
    if task is not None and not task.done():
        try:
            await task
        except Exception as exc:  # noqa: BLE001
            LOG.warning("contribution_summary_task await failed: %s", exc)
    if any((session.contribution_summaries or {}).values()):
        return
    await _build_contribution_summaries(session)


async def _build_contribution_summaries(session: Session) -> None:
    actives = _active_participants(session)
    roster = "\n".join(
        f"- id: {p.participant_id} | name: {p.name}" for p in actives
    )
    transcript = _format_history(session.messages)
    prompt = CONTRIBUTION_SUMMARY_PROMPT.format(
        roster_block=roster,
        transcript=transcript,
    )
    _raw, parsed = await orchestrator_call(
        orchestrator_model_id=_orchestrator_model_id(session),
        user_prompt=prompt,
        label="contribution_summaries",
        api_log=session.api_log,
        max_tokens=900,
    )
    session.orchestrator_call_count += 1
    if isinstance(parsed, dict) and isinstance(parsed.get("contributions"), list):
        for c in parsed["contributions"]:
            pid = c.get("participant_id")
            summary = (c.get("summary") or "").strip()
            if pid and summary:
                session.contribution_summaries[pid] = summary
