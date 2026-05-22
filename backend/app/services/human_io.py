"""Human-participant I/O coordination.

Bridges the streaming SSE orchestrator to the asynchronous HTTP flow
where a human submits their response via POST. Mirrors the shape of
the existing failsafe pause:

  1. Orchestrator reaches a turn for a human participant.
  2. It populates `session.awaiting_human` and yields a
     `human_turn_needed` SSE event, then awaits this module's slot.
  3. The frontend renders the green-bordered input box and a
     lower-screen "waiting for your input" indicator.
  4. User clicks Submit (or Skip) -> POST /api/chat/{id}/human-response.
  5. The API layer calls `deliver_human_response`, which sets the
     slot's `asyncio.Event` and wakes the orchestrator. Orchestrator
     yields `human_turn_cleared`, appends the message (or a skip note),
     and proceeds.

Slot lifetime: lazily created per session_id on first wait, then
reused turn-after-turn. Cleared via `drop_session` when the session
ends (currently called from the orchestrator's finally block on
conversation completion).
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any


@dataclass
class HumanTurnSlot:
    """Per-session waiting-room for a single pending human turn.

    `event` is set by the API layer when the user submits or skips.
    `response_text` and `skipped` carry the payload across the event.
    `started_at` is wall-clock time stamped when the orchestrator
    starts waiting; the orchestrator subtracts it from now() to get
    `elapsed_seconds` for the message bubble.

    `pending_snapshot` stashes the result of
    `_pending_addressed_for(session, participant)` at turn-start so the
    orchestrator can stamp `replying_to` on the eventual message
    without re-walking the transcript after the user types.
    """

    event: asyncio.Event = field(default_factory=asyncio.Event)
    response_text: str = ""
    skipped: bool = False
    started_at: float = 0.0
    pending_snapshot: list[Any] = field(default_factory=list)


_slots: dict[str, HumanTurnSlot] = {}


def slot_for(session_id: str) -> HumanTurnSlot:
    """Get-or-create the slot for this session_id."""
    slot = _slots.get(session_id)
    if slot is None:
        slot = HumanTurnSlot()
        _slots[session_id] = slot
    return slot


def reset_slot(session_id: str) -> None:
    """Clear payload state in the slot so the next turn starts fresh.

    Idempotent: a no-op if no slot exists. The Event object itself is
    retained (cleared) so any callers that captured a reference keep
    working across turns.
    """
    slot = _slots.get(session_id)
    if slot is None:
        return
    slot.event.clear()
    slot.response_text = ""
    slot.skipped = False
    slot.started_at = 0.0
    slot.pending_snapshot = []


def deliver_human_response(
    session_id: str,
    text: str,
    *,
    skip: bool = False,
) -> bool:
    """Wake the orchestrator's wait on this session's human turn.

    Returns True if a slot was waiting; False if there was nothing
    pending (e.g. user double-clicked Submit, or sent a response after
    the orchestrator already moved on). Callers can surface that as a
    409 to the frontend.
    """
    slot = _slots.get(session_id)
    if slot is None:
        return False
    if slot.event.is_set():
        # Idempotent: already delivered, treat as no-op.
        return False
    slot.response_text = text or ""
    slot.skipped = bool(skip)
    slot.event.set()
    return True


def drop_session(session_id: str) -> None:
    """Cleanup at session-end so old slots don't accumulate."""
    _slots.pop(session_id, None)
