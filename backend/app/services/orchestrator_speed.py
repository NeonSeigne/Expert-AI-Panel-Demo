"""Speed-oriented orchestration helpers.

Parallel participant turns, compact orchestrator context, and fast-
model routing for lightweight classifier calls. Keeps the same
visible message count while shortening wall-clock time.
"""
from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Awaitable, Callable, TYPE_CHECKING

from app.services.resilience import ResilientTurnResult, run_resilient_turn

if TYPE_CHECKING:
    from app.services.models import Participant, Phase, Session

LOG = logging.getLogger(__name__)

# Rough char budget for orchestrator-side prompts that would otherwise
# resend the entire transcript every few turns.
ORCHESTRATOR_TRANSCRIPT_CHAR_BUDGET = 14_000
_RECENT_TAIL_MESSAGES = 24

CallParticipantFn = Callable[..., Awaitable[tuple[str, float, bool, str]]]


@dataclass
class _AiTurnSpec:
    participant: "Participant"
    user_prompt: str
    label: str
    max_tokens: int


@dataclass
class _AiTurnResult:
    participant: "Participant"
    turn: ResilientTurnResult
    pending: list[tuple[str, str, str]] = field(default_factory=list)


def orchestrator_fast_model_id(session: "Session") -> str:
    """Model for lightweight orchestrator classifiers (addressed-to, status)."""
    from app.config import settings
    from app.services.orchestrator import _orchestrator_model_id

    fast = (getattr(settings, "orchestrator_fast_model", None) or "").strip()
    if fast and settings.resolve_model(fast):
        return fast
    return _orchestrator_model_id(session)


def _format_history_for_orchestrator(
    messages: list[dict[str, Any]],
    *,
    include_orchestrator: bool = True,
) -> str:
    from app.services.orchestrator import _format_history

    return _format_history(messages, include_orchestrator=include_orchestrator)


async def compact_transcript_for_orchestrator(
    session: "Session",
    *,
    orchestrator_model_id: str,
) -> str:
    """Return a transcript block sized for orchestrator judge prompts.

    Uses a rolling summary + recent tail when the full history exceeds
    the char budget. Summaries are built lazily (one extra orchestrator
    call) and cached on the session.
    """
    from app.services.json_calls import orchestrator_call
    from app.services.orchestrator import _bump_orchestrator_count

    messages = session.messages
    full = _format_history_for_orchestrator(messages)
    if len(full) <= ORCHESTRATOR_TRANSCRIPT_CHAR_BUDGET:
        return full

    tail = messages[-_RECENT_TAIL_MESSAGES:]
    tail_text = _format_history_for_orchestrator(tail)
    through = len(messages) - len(tail)
    if (
        session.orchestrator_context_summary
        and session.orchestrator_context_through_idx >= through - 2
    ):
        return (
            "[Earlier discussion summary]\n"
            f"{session.orchestrator_context_summary}\n\n"
            "[Recent messages]\n"
            f"{tail_text}"
        )

    prompt = (
        "Summarize the following group discussion for an orchestrator that "
        "will judge consensus and open questions. Preserve names, stances, "
        "and unresolved disagreements. Be concise (under 400 words).\n\n"
        f"{full}"
    )
    raw, _ = await orchestrator_call(
        orchestrator_model_id=orchestrator_model_id,
        user_prompt=prompt,
        label="orchestrator_transcript_summary",
        api_log=session.api_log,
        expect_json=False,
        max_tokens=700,
        temperature=0.2,
    )
    _bump_orchestrator_count(session)
    summary = (raw or "").strip() or full[-ORCHESTRATOR_TRANSCRIPT_CHAR_BUDGET:]
    session.orchestrator_context_summary = summary
    session.orchestrator_context_through_idx = through
    return (
        "[Earlier discussion summary]\n"
        f"{summary}\n\n"
        "[Recent messages]\n"
        f"{tail_text}"
    )


async def _execute_ai_turn(
    session: "Session",
    spec: _AiTurnSpec,
    call_participant: CallParticipantFn,
) -> _AiTurnResult:
    from app.services.orchestrator import _pending_addressed_for

    pending = _pending_addressed_for(session, spec.participant)
    turn = await run_resilient_turn(
        session=session,
        participant=spec.participant,
        user_prompt=spec.user_prompt,
        label=spec.label,
        max_tokens=spec.max_tokens,
        call_participant=call_participant,
    )
    return _AiTurnResult(
        participant=spec.participant,
        turn=turn,
        pending=pending,
    )


PostProcessFn = Callable[
    [_AiTurnResult],
    Awaitable[dict[str, Any] | None],
]


async def run_roster_ai_turns_parallel(
    session: "Session",
    actives: list["Participant"],
    *,
    phase: "Phase",
    build_spec: Callable[["Participant"], _AiTurnSpec | None],
    call_participant: CallParticipantFn,
    on_human_turn: Callable[
        ["Participant"],
        AsyncIterator[str],
    ],
    post_process: PostProcessFn | None = None,
) -> AsyncIterator[str]:
    """Run participant turns: humans sequentially, AI in parallel batches.

    Walks `actives` in roster order. Consecutive AI participants are
    executed with ``asyncio.gather``; results are applied in roster
    order so the message log stays deterministic. Humans are awaited
    one at a time via ``on_human_turn``.

    Yields orchestrator SSE strings (status, message, errors, etc.).
    """
    from app.services.orchestrator import (
        _msg_payload,
        _participant_msg_cap_hit,
        _sse,
        _wait_for_continue,
    )

    ai_batch: list[_AiTurnSpec] = []

    async def flush_ai_batch() -> AsyncIterator[str]:
        nonlocal ai_batch
        if not ai_batch:
            return
        specs = ai_batch
        ai_batch = []
        results = await asyncio.gather(
            *[
                _execute_ai_turn(session, spec, call_participant)
                for spec in specs
            ],
            return_exceptions=True,
        )
        for spec, item in zip(specs, results):
            if isinstance(item, BaseException):
                LOG.exception(
                    "Parallel turn failed for %s: %s",
                    spec.participant.participant_id,
                    item,
                )
                yield _sse("participant_error", {
                    "participant_id": spec.participant.participant_id,
                    "name": spec.participant.name,
                    "phase": phase.value,
                })
                continue
            extra: dict[str, Any] | None = None
            if post_process is not None:
                extra = await post_process(item) or {}
            async for chunk in _emit_ai_turn_result(
                session, item, phase=phase, extra=extra,
            ):
                yield chunk
            if _participant_msg_cap_hit(session):
                async for chunk in _wait_for_continue(session, "messages"):
                    yield chunk

    for p in actives:
        if p.kind == "human":
            async for chunk in flush_ai_batch():
                yield chunk
            async for chunk in on_human_turn(p):
                yield chunk
            continue

        spec = build_spec(p)
        if spec is None:
            continue
        ai_batch.append(spec)

    async for chunk in flush_ai_batch():
        yield chunk


async def _emit_ai_turn_result(
    session: "Session",
    result: _AiTurnResult,
    *,
    phase: "Phase",
    extra: dict[str, Any] | None = None,
) -> AsyncIterator[str]:
    """Apply a completed AI turn to the session and yield SSE."""
    from app.services.orchestrator import (
        _add_participant_message,
        _msg_payload,
        _orchestrator_cap_hit,
        _replying_to_ids,
        _sse,
        _wait_for_continue,
    )

    p = result.participant
    turn = result.turn
    for ev in turn.sse_events:
        yield ev
    if not turn.ok:
        yield _sse("participant_error", {
            "participant_id": p.participant_id,
            "name": p.name,
            "phase": phase.value,
        })
        if p.consecutive_failures >= session.limits.auto_disable_failures:
            p.enabled = False
            yield _sse("status", {
                "message": (
                    f"{p.name} auto-disabled after "
                    f"{session.limits.auto_disable_failures} failures."
                ),
            })
        return

    speaker = turn.speaker
    meta = extra or {}
    msg = _add_participant_message(
        session,
        speaker,
        turn.text,
        phase=phase,
        elapsed=turn.elapsed,
        addressed_to=meta.get("addressed_to"),
        replying_to=meta.get(
            "replying_to",
            _replying_to_ids(result.pending),
        ),
        message_id=meta.get("message_id"),
    )
    yield _sse("message", _msg_payload(msg))

    if _orchestrator_cap_hit(session):
        async for chunk in _wait_for_continue(session, "orchestrator"):
            yield chunk


async def run_parallel_coroutines(
    coros: list[Awaitable[Any]],
) -> list[Any]:
    """Gather with exception isolation (failed tasks become exceptions)."""
    return await asyncio.gather(*coros, return_exceptions=True)
