"""Base class every ConversationStructure plugin inherits.

A structure drives the *discussion* phase of a chat: how participants
present their views, debate, refine, and finalize positions. It does
NOT decide the verdict — that's the DecisionMethod's job. The two are
joined by `DecisionInput` (see `..types`).

Subclasses should:

  1. Override `NAME` and `DESCRIPTION` so the frontend picker can
     present a sensible label.
  2. Implement `run()` as an async generator that yields SSE chunks.
     Use the orchestrator's `_sse(...)` helper (imported lazily so
     this module doesn't pull in the whole orchestrator) — see
     existing structures for the pattern.
  3. Implement `build_decision_input()` to return a `DecisionInput`
     populated from the session state your `run()` produced.

Plugins live in this directory and are registered in
`app/services/conversation/__init__.py`.
"""
from __future__ import annotations

from typing import AsyncIterator, TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.conversation.types import DecisionInput
    from app.services.models import Session


class ConversationStructure:
    """Abstract base; subclass and override `NAME`, `DESCRIPTION`,
    `run()`, and `build_decision_input()`."""

    #: Short label shown in the Settings menu.
    NAME: str = "Conversation"

    #: One-line description for the picker tooltip.
    DESCRIPTION: str = ""

    def __init__(self, session: "Session") -> None:
        self.session = session

    async def run(self) -> AsyncIterator[str]:  # noqa: D401
        """Drive the discussion. Yields SSE chunks."""
        raise NotImplementedError
        yield  # pragma: no cover  # keeps mypy happy that this is a generator

    def build_decision_input(self) -> "DecisionInput":
        """Produce the standardized hand-off for the decision phase.

        Called once `run()` completes. The result is passed verbatim
        to the chosen DecisionMethod's constructor.
        """
        raise NotImplementedError
