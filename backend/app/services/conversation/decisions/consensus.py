"""Consensus — the original CCAI decision-making mode.

This is a thin wrapper over the existing Phase 5/6 implementation in
`app.services.orchestrator`. The structure produces a DecisionInput
with finalized positions; we discard the input fields here because
the consensus phase reads `session.final_opinions`,
`session.alliance_groups`, etc. directly. The wrapper exists so the
dispatcher in orchestrator.py can treat Consensus uniformly with the
new decision methods.

Behavior:
  Phase 5: Consensus deliberation (turn-based, alliance-aware,
           with dyad caps and addressed-to routing).
  Phase 6: Closure — if a majority emerges, emit a majority report;
           otherwise either re-run consensus with a surfaced
           "unaddressed factor" or emit a no-consensus report.
"""
from __future__ import annotations

from typing import AsyncIterator

from app.services.conversation.decisions.base import DecisionMethod


class ConsensusDecision(DecisionMethod):
    NAME = "Consensus"
    DESCRIPTION = (
        "Participants deliberate until either an alliance forms with "
        "majority support, or the orchestrator reports no consensus "
        "with the remaining points of disagreement."
    )

    async def run(self) -> AsyncIterator[str]:
        from app.services.orchestrator import (
            _phase_consensus,
            _phase_closure,
        )

        async for chunk in _phase_consensus(self.session):
            yield chunk

        async for chunk in _phase_closure(self.session):
            yield chunk
