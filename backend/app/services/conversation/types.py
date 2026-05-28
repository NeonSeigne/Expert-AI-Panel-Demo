"""Shared dataclasses for the conversation plugin system.

`DecisionInput` is the contract between a ConversationStructure and a
DecisionMethod: whatever shape the discussion took, by the time the
structure hands off, we should have a question, the active
participants, the transcript, and each participant's finalized
position. Structures that surface explicit options or motions
(notably Robert's Rules) populate the optional fields.

Keeping this in its own module avoids structures and decisions having
to import from each other.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.services.models import Participant


@dataclass
class DecisionInput:
    """Standardized hand-off from a ConversationStructure to a
    DecisionMethod.

    Fields:
      * question: the conversation's prompt.
      * participants: snapshot of active LLM + human participants in
        roster order. (Disabled participants are filtered out by the
        structure before handoff.)
      * transcript_messages: full ordered message log; decision
        methods may quote or summarize.
      * finalized_positions: participant_id -> short text summary of
        that participant's final stance. Always populated for
        non-human AI participants by the end of discussion. Human
        participants may also have entries when they spoke a final
        opinion.
      * proposed_candidates: explicit list of options the structure
        surfaced (e.g. Robert's Rules motions, or an LLM-extracted
        cluster of positions from a collaborative discussion). When
        None, the decision method derives candidates from
        `finalized_positions`.
      * main_motion: for Robert's Rules, the text of the main motion
        on the floor. When set, decision methods that support a
        binary vote (RobertsRulesVote, MajorityRulesDecision) will
        vote yes/no/abstain on this motion instead of choosing among
        candidates.
      * extras: free-form bag for structure-specific metadata a
        decision method might want (motion seconder, debate
        speaker order, etc.). Treat as opaque unless you know the
        structure produced something specific.
    """
    question: str
    participants: list["Participant"]
    transcript_messages: list[dict[str, Any]]
    finalized_positions: dict[str, str]
    proposed_candidates: list[str] | None = None
    main_motion: str | None = None
    extras: dict[str, Any] = field(default_factory=dict)
