"""Collaborative Discussion — the original CCAI structure.

This is a thin wrapper over the existing Phase 1-4 implementation in
`app.services.orchestrator`. We keep the function bodies in
orchestrator.py for now (less code churn during the plugin refactor)
and the plugin just dispatches to them in the historical order:

  Phase 1: Initial opinions (each participant speaks once with no
           transcript, so first opinions are independent).
  Phase 2: Critique rounds (1-4, configurable). Each participant
           critiques / agrees with / builds on what others said.
  Phase 3: Status assessment + targeted follow-ups (orchestrator
           surfaces open questions; max iterations from limits).
  Phase 4: Finalization (each participant states a final opinion,
           which is what we hand off to the decision phase).

When this structure finishes, `session.final_opinions[pid]` holds
each AI participant's last word. We marshal that into a
DecisionInput so any DecisionMethod can take over.
"""
from __future__ import annotations

from typing import AsyncIterator, TYPE_CHECKING

from app.services.conversation.structures.base import ConversationStructure
from app.services.conversation.types import DecisionInput

if TYPE_CHECKING:
    pass


class CollaborativeDiscussion(ConversationStructure):
    NAME = "Collaborative Discussion"
    DESCRIPTION = (
        "Initial opinions, then critique rounds, then a status check "
        "for unanswered questions, then a final opinion from each "
        "participant."
    )

    async def run(self) -> AsyncIterator[str]:
        # Lazy import so this module can be loaded without dragging
        # in the whole orchestrator (and so orchestrator.py can in
        # turn import the structures registry without a cycle).
        from app.services.orchestrator import (
            _phase_initial_opinions,
            _phase_critique,
            _phase_status_assessment,
            _phase_finalization,
        )

        async for chunk in _phase_initial_opinions(self.session):
            yield chunk

        for round_n in range(1, self.session.limits.critique_rounds + 1):
            async for chunk in _phase_critique(self.session, round_n):
                yield chunk

        async for chunk in _phase_status_assessment(self.session):
            yield chunk

        async for chunk in _phase_finalization(self.session):
            yield chunk

    def build_decision_input(self) -> DecisionInput:
        # Filter out disabled participants here — the decision phase
        # always speaks about the *active* roster, not whoever started
        # the chat. (Auto-disable in Phase 1/2 means some original
        # participants may have been removed.)
        actives = [p for p in self.session.participants if p.enabled]
        return DecisionInput(
            question=self.session.question,
            participants=actives,
            transcript_messages=list(self.session.messages),
            finalized_positions=dict(self.session.final_opinions),
        )
