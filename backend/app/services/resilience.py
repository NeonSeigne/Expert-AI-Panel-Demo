"""Participant-turn resilience helpers.

This module owns the logic for what happens after an AI participant's
LLM call fails. The orchestrator delegates each AI turn to
`run_resilient_turn`, which then decides whether to:

  - return the original failure unchanged (when "Prioritize model
    choice" is on; the user explicitly picked this model, so we don't
    swap it out behind their back — they get the existing 2-attempt
    HTTP retry from openai_compat and that's it),
  - in Phase 1 only, retire the original participant and bring in an
    alternate from the catalog,
  - swap the backing LLM behind the participant's persona prompt by
    walking the per-session substitution chain (gpt-5.4 →
    gemini-2.5-flash → other externals → Neon "vanilla" models), or
  - retry the same backing LLM once when the error looks transient
    (5xx / 429 / timeout) in Phase 2+.

All of the post-failure behaviour is gated on
`settings.speed_priority`. The reasoning: under "Prioritize model
choice" the user has explicitly chosen a model and expects exactly
that model to speak (or the conversation to note the failure and
continue without lying about which model produced what). Under
"Prioritize conversation speed" the user has signalled they care
about the conversation flowing more than about which specific model
spoke — so we aggressively work around failures.

The orchestrator's existing `participant_error` SSE + auto-disable
threshold still apply as a final backstop: if every tier in this
module has been exhausted and the participant *still* can't speak,
the orchestrator emits `participant_error` and (in Phases 1/2)
auto-disables the participant after N consecutive failures.
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Awaitable, Callable

from app.config import settings

if TYPE_CHECKING:
    # Avoid an import cycle: orchestrator imports this module, and
    # this module only needs the types for annotations.
    from app.services.models import Participant, Phase, Session

LOG = logging.getLogger(__name__)


# Substitution chain: head-of-list models we always try first because
# they're known to be widely-available and have generous context
# windows. The remainder of the chain is filled in dynamically from
# settings.providers at session-start.
PREFERRED_SUBSTITUTE_MODEL_IDS: list[str] = [
    "gpt-5.4",
    "gemini-2.5-flash",
]


# ---------------------------------------------------------------------------
# Result type returned to the orchestrator
# ---------------------------------------------------------------------------

@dataclass
class ResilientTurnResult:
    """Outcome of `run_resilient_turn` from the orchestrator's POV.

    `speaker` is the Participant whose name + role_prompt produced the
    response. Normally it's the same instance the orchestrator passed
    in — but in Phase 1 we may swap an alternate participant in,
    in which case `speaker` is the alternate. The orchestrator should
    attribute the resulting message to `speaker`, not the original.

    `sse_events` is a list of pre-encoded SSE chunks the caller should
    yield *before* emitting the actual `message` event (roster
    updates, substitution notices, etc.). They're returned rather than
    yielded directly so the resilience layer doesn't have to be an
    async generator — keeps the caller simple.
    """
    speaker: "Participant"
    text: str
    elapsed: float
    ok: bool
    error_kind: str = ""
    sse_events: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Substitution chain construction (called from api/chat.py at session start)
# ---------------------------------------------------------------------------

def build_substitution_chain(
    neon_model_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Resolve each model id we'd want to fall back to into a routing
    dict the same shape as `settings.resolve_model()` returns.

    Order:
      1. PREFERRED_SUBSTITUTE_MODEL_IDS (gpt-5.4, gemini-2.5-flash)
      2. Every other non-Neon model registered in settings.providers,
         in provider order (deterministic).
      3. Neon "vanilla" models (no persona overlay) as a last resort —
         the caller supplies HANA model ids (e.g. "BrainForge/Engineer@2026.03.18")
         which we expand into `neon:{id}:vanilla` participant ids.

    Duplicates are dropped, so each model id appears at most once.
    Models that fail to resolve (e.g. the API key isn't configured)
    are silently skipped.
    """
    chain: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(model_id: str) -> None:
        if not model_id or model_id in seen:
            return
        resolved = settings.resolve_model(model_id)
        if not resolved:
            return
        seen.add(model_id)
        chain.append(resolved)

    for mid in PREFERRED_SUBSTITUTE_MODEL_IDS:
        add(mid)

    for prov in settings.providers:
        for m in prov.get("models", []):
            mid = m.get("id")
            if not mid:
                continue
            resolved = settings.resolve_model(mid)
            if resolved and not resolved.get("is_neon"):
                add(mid)

    for hana_mid in neon_model_ids or []:
        add(f"neon:{hana_mid}:vanilla")

    return chain


# ---------------------------------------------------------------------------
# Core wrapper: run_resilient_turn
# ---------------------------------------------------------------------------

# The orchestrator passes in `call_participant` so this module doesn't
# have to import from orchestrator.py (avoids the cycle).  Signature:
#   async def call_participant(session, participant, user_prompt, label,
#                              max_tokens) -> tuple[str, float, bool, str]
CallParticipantFn = Callable[..., Awaitable[tuple[str, float, bool, str]]]


def _swap_participant_model_in_place(
    participant: "Participant",
    resolved: dict[str, Any],
) -> None:
    """Rewrite a Participant's backing-LLM fields with a resolved
    substitute. Persona identity (participant_id, name, role_prompt,
    kind) is left untouched, so transcript continuity is preserved —
    only the speaker behind the persona changes.

    Records the previous model_id on `substituted_from_model_id` so
    api_log entries from before/after the swap can be cross-referenced.
    """
    if not participant.substituted_from_model_id:
        participant.substituted_from_model_id = participant.model_id
    participant.model_id = resolved.get("model_id", participant.model_id)
    participant.base_url = resolved.get("base_url", "")
    participant.api_key = resolved.get("api_key", "")
    participant.display_name = resolved.get("display_name", resolved.get("model_id", ""))
    participant.is_neon = resolved.get("is_neon", False)
    participant.hana_model_id = resolved.get("hana_model_id", "")
    participant.persona_name = resolved.get("persona_name", "")
    participant.neon_direct_vllm = resolved.get("neon_direct_vllm", False)
    participant.vllm_base_url = resolved.get("vllm_base_url", "")
    participant.vllm_api_key = resolved.get("vllm_api_key", "")


def _sse(event: str, data: dict[str, Any]) -> str:
    """Mirrors orchestrator._sse so we don't have to import it."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _try_substitution_chain(
    *,
    session: "Session",
    participant: "Participant",
    user_prompt: str,
    label: str,
    max_tokens: int,
    call_participant: CallParticipantFn,
) -> tuple[str, float, bool, str, list[str]]:
    """Walk session.substitution_chain trying each backing LLM in turn.

    On the first success: mutate `participant` in place to point at the
    successful substitute (so subsequent rounds also use it), emit a
    `participant_substituted` SSE so the frontend can surface the
    change, and return the result.

    On exhaustion: return the last failure tuple unchanged.
    """
    events: list[str] = []
    last_text = ""
    last_elapsed = 0.0
    last_kind = ""

    for resolved in session.substitution_chain:
        candidate_id = resolved.get("model_id", "")
        if not candidate_id or candidate_id == participant.model_id:
            continue

        original_model_id = participant.model_id
        _swap_participant_model_in_place(participant, resolved)
        LOG.info(
            "Resilience: substituting backing LLM for %s (%s) — trying %s",
            participant.name, participant.participant_id, candidate_id,
        )

        text, elapsed, ok, kind = await call_participant(
            session=session,
            participant=participant,
            user_prompt=user_prompt,
            label=f"{label}:sub:{candidate_id}",
            max_tokens=max_tokens,
        )
        last_text, last_elapsed, last_kind = text, elapsed, kind

        if ok and text.strip():
            events.append(_sse("participant_substituted", {
                "participant_id": participant.participant_id,
                "name": participant.name,
                "from_model_id": original_model_id,
                "to_model_id": participant.model_id,
                "to_model_display": participant.display_name,
                "phase": session.phase.value,
            }))
            return text, elapsed, True, "", events

    # Exhausted the chain. Caller will fall through to participant_error.
    return last_text, last_elapsed, False, last_kind, events


async def _try_alternate_for_phase1(
    *,
    session: "Session",
    original: "Participant",
    user_prompt: str,
    label: str,
    max_tokens: int,
    call_participant: CallParticipantFn,
) -> tuple["Participant | None", str, float, bool, str, list[str]]:
    """Phase 1 only: try alternate participants from the candidate pool.

    Pops alternates one at a time off session.candidate_pool (so they
    aren't tried twice across the chat), running the same initial-
    opinion prompt against each in turn. On the first success the
    alternate REPLACES `original` in session.participants (preserving
    roster order), and a `participant_replaced` SSE is emitted so the
    sidebar can re-render.

    Returns (alternate, text, elapsed, ok, error_kind, sse_events).
    If the pool is exhausted without a success, returns
    (None, "", 0.0, False, "...", events).
    """
    events: list[str] = []
    last_text = ""
    last_elapsed = 0.0
    last_kind = ""

    while session.candidate_pool:
        alt = session.candidate_pool.pop(0)
        if alt.kind == "human":
            continue
        LOG.info(
            "Resilience: trying alternate participant %s (%s) in place of %s",
            alt.name, alt.participant_id, original.name,
        )

        text, elapsed, ok, kind = await call_participant(
            session=session,
            participant=alt,
            user_prompt=user_prompt,
            label=f"{label}:alt:{alt.participant_id}",
            max_tokens=max_tokens,
        )
        last_text, last_elapsed, last_kind = text, elapsed, kind

        if ok and text.strip():
            # Replace original in the roster at its original index so
            # turn order is preserved for the rest of the chat.
            try:
                idx = session.participants.index(original)
            except ValueError:
                idx = len(session.participants)
                session.participants.append(alt)
            else:
                session.participants[idx] = alt

            events.append(_sse("participant_replaced", {
                "original_participant_id": original.participant_id,
                "original_name": original.name,
                "new_participant_id": alt.participant_id,
                "new_name": alt.name,
                "new_model_id": alt.model_id,
                "new_model_display": alt.display_name,
                "new_kind": alt.kind,
                "phase": session.phase.value,
                "roster": [
                    {
                        "participant_id": p.participant_id,
                        "name": p.name,
                        "kind": p.kind,
                        "model_id": p.model_id,
                        "model_display": p.display_name,
                    }
                    for p in session.participants
                ],
            }))
            return alt, text, elapsed, True, "", events

    return None, last_text, last_elapsed, False, last_kind, events


async def run_resilient_turn(
    *,
    session: "Session",
    participant: "Participant",
    user_prompt: str,
    label: str,
    max_tokens: int,
    call_participant: CallParticipantFn,
    stream_events: list[str] | None = None,
    stream_message_id: str | None = None,
) -> ResilientTurnResult:
    """Phase-aware wrapper around a single participant LLM turn.

    Always invokes `call_participant` once with the original
    participant + model. If that succeeds (or speed-priority is off),
    returns immediately — the existing 2-attempt HTTP retry in
    `openai_compat` already serves as the "second try" for the
    Prioritize-Model-Choice mode.

    Otherwise, under speed-priority:
      - Phase 1 (initial opinions): try an alternate participant from
        the catalog; if that also fails, walk the LLM substitution
        chain on the *original* persona.
      - Phase 2+ : if the error looks transient (5xx/429/timeout)
        retry the same model once; if it still fails, or the error
        was permanent, walk the substitution chain.
    """
    # Lazy phase import to avoid a circular dependency at module load.
    from app.services.models import Phase  # noqa: WPS433

    t0 = time.time()  # noqa: F841 — kept around in case future telemetry needs it
    text, elapsed, ok, error_kind = await call_participant(
        session=session,
        participant=participant,
        user_prompt=user_prompt,
        label=label,
        max_tokens=max_tokens,
        stream_events=stream_events,
        stream_message_id=stream_message_id,
    )

    if ok and text.strip():
        return ResilientTurnResult(
            speaker=participant, text=text, elapsed=elapsed,
            ok=True, error_kind="", sse_events=[],
        )

    if not settings.speed_priority:
        # "Prioritize model choice" — caller will emit participant_error
        # and the conversation continues as today. The 2-attempt HTTP
        # retry in openai_compat already satisfied "always a second try"
        # per the resilience spec.
        return ResilientTurnResult(
            speaker=participant, text=text, elapsed=elapsed,
            ok=False, error_kind=error_kind, sse_events=[],
        )

    events: list[str] = []

    if session.phase == Phase.INITIAL_OPINIONS:
        # Tier 2: alternate participant from catalog pool.
        alt, alt_text, alt_elapsed, alt_ok, alt_kind, alt_events = await _try_alternate_for_phase1(
            session=session,
            original=participant,
            user_prompt=user_prompt,
            label=label,
            max_tokens=max_tokens,
            call_participant=call_participant,
        )
        events.extend(alt_events)
        if alt_ok and alt is not None:
            return ResilientTurnResult(
                speaker=alt, text=alt_text, elapsed=alt_elapsed,
                ok=True, error_kind="", sse_events=events,
            )

        # Tier 3: substitute the LLM behind the *original* persona.
        sub_text, sub_elapsed, sub_ok, sub_kind, sub_events = await _try_substitution_chain(
            session=session,
            participant=participant,
            user_prompt=user_prompt,
            label=label,
            max_tokens=max_tokens,
            call_participant=call_participant,
        )
        events.extend(sub_events)
        return ResilientTurnResult(
            speaker=participant, text=sub_text, elapsed=sub_elapsed,
            ok=sub_ok and bool(sub_text.strip()),
            error_kind="" if sub_ok else (sub_kind or alt_kind or error_kind),
            sse_events=events,
        )

    # Phase 2+ : retry-or-substitute fork.
    if error_kind == "transient":
        LOG.info(
            "Resilience: transient failure on %s for %s — retrying same model",
            participant.model_id, participant.name,
        )
        retry_text, retry_elapsed, retry_ok, retry_kind = await call_participant(
            session=session,
            participant=participant,
            user_prompt=user_prompt,
            label=f"{label}:retry",
            max_tokens=max_tokens,
        )
        if retry_ok and retry_text.strip():
            return ResilientTurnResult(
                speaker=participant, text=retry_text, elapsed=retry_elapsed,
                ok=True, error_kind="", sse_events=events,
            )
        text, elapsed, error_kind = retry_text, retry_elapsed, retry_kind

    # Either the error was permanent, or the same-model retry also failed.
    sub_text, sub_elapsed, sub_ok, sub_kind, sub_events = await _try_substitution_chain(
        session=session,
        participant=participant,
        user_prompt=user_prompt,
        label=label,
        max_tokens=max_tokens,
        call_participant=call_participant,
    )
    events.extend(sub_events)
    return ResilientTurnResult(
        speaker=participant, text=sub_text, elapsed=sub_elapsed,
        ok=sub_ok and bool(sub_text.strip()),
        error_kind="" if sub_ok else (sub_kind or error_kind),
        sse_events=events,
    )
