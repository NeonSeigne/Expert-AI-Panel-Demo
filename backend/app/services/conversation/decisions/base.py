"""Base class every DecisionMethod plugin inherits.

A decision method takes the `DecisionInput` produced by the
ConversationStructure and runs whatever process yields a verdict —
collaborative consensus, ranked-choice vote, simple majority, etc.

Subclasses should:

  1. Override `NAME` and `DESCRIPTION` for the frontend picker.
  2. Implement `run()` as an async generator that yields SSE chunks.
  3. Populate `session.final_report` with a dict the frontend can
     render. Conventionally:
        { "kind": "<decision-flavored kind>",
          "text": "<human-readable summary>",
          ... any per-method extras ... }
     The `kind` flows into `orchestrator` SSE messages so
     `OrchestratorMessage.js` can render distinct headers.

Plugins live in this directory and are registered in
`app/services/conversation/__init__.py`.
"""
from __future__ import annotations

from typing import AsyncIterator, TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.conversation.types import DecisionInput
    from app.services.models import Session


class DecisionMethod:
    """Abstract base; subclass and override `NAME`, `DESCRIPTION`,
    and `run()`."""

    NAME: str = "Decision"
    DESCRIPTION: str = ""

    def __init__(self, session: "Session", decision_input: "DecisionInput") -> None:
        self.session = session
        self.decision_input = decision_input

    async def run(self) -> AsyncIterator[str]:  # noqa: D401
        """Drive the decision phase. Yields SSE chunks."""
        raise NotImplementedError
        yield  # pragma: no cover
