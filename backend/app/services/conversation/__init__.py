"""Pluggable conversation structures and decision-making methods.

The orchestrator drives one ConversationStructure (how the discussion
is organized) followed by one DecisionMethod (how a verdict is
reached). The two are decoupled by the `DecisionInput` contract in
`types.py`: every structure produces one, every method consumes one,
so in principle any combination is valid.

Adding a new structure or decision method means:

  1. Subclass `ConversationStructure` or `DecisionMethod` in
     `structures/` or `decisions/`.
  2. Register the class in the appropriate registry below.

Built-in choices:

  Structures:
    - "collaborative" → CollaborativeDiscussion (default)
    - "roberts_rules" → RobertsRulesDiscussion
    - "document_pipeline" → DocumentPipelineDiscussion

  Decision methods:
    - "consensus" → ConsensusDecision (default)
    - "majority" → MajorityRulesDecision
    - "ranked_choice" → RankedChoiceDecision
    - "roberts_rules_vote" → RobertsRulesVote
    - "document_publish" → DocumentPublishDecision
"""
from __future__ import annotations

from typing import Type

from app.services.conversation.decisions.base import DecisionMethod
from app.services.conversation.decisions.consensus import ConsensusDecision
from app.services.conversation.decisions.document_publish import DocumentPublishDecision
from app.services.conversation.decisions.majority import MajorityRulesDecision
from app.services.conversation.decisions.ranked_choice import RankedChoiceDecision
from app.services.conversation.decisions.roberts_rules_vote import RobertsRulesVote
from app.services.conversation.structures.base import ConversationStructure
from app.services.conversation.structures.collaborative import CollaborativeDiscussion
from app.services.conversation.structures.document_pipeline import DocumentPipelineDiscussion
from app.services.conversation.structures.roberts_rules import RobertsRulesDiscussion
from app.services.conversation.types import DecisionInput  # noqa: F401  re-export

DEFAULT_STRUCTURE_ID = "collaborative"
DEFAULT_DECISION_ID = "consensus"


STRUCTURE_REGISTRY: dict[str, Type[ConversationStructure]] = {
    "collaborative": CollaborativeDiscussion,
    "roberts_rules": RobertsRulesDiscussion,
    "document_pipeline": DocumentPipelineDiscussion,
}


DECISION_REGISTRY: dict[str, Type[DecisionMethod]] = {
    "consensus": ConsensusDecision,
    "majority": MajorityRulesDecision,
    "ranked_choice": RankedChoiceDecision,
    "roberts_rules_vote": RobertsRulesVote,
    "document_publish": DocumentPublishDecision,
}


def get_structure(structure_id: str | None) -> Type[ConversationStructure]:
    """Resolve a structure id to its class, defaulting on miss."""
    if not structure_id or structure_id not in STRUCTURE_REGISTRY:
        return STRUCTURE_REGISTRY[DEFAULT_STRUCTURE_ID]
    return STRUCTURE_REGISTRY[structure_id]


def get_decision(decision_id: str | None) -> Type[DecisionMethod]:
    """Resolve a decision-method id to its class, defaulting on miss."""
    if not decision_id or decision_id not in DECISION_REGISTRY:
        return DECISION_REGISTRY[DEFAULT_DECISION_ID]
    return DECISION_REGISTRY[decision_id]


def list_structures() -> list[dict[str, str]]:
    """Catalog data for the frontend picker."""
    return [
        {"id": sid, "name": cls.NAME, "description": cls.DESCRIPTION}
        for sid, cls in STRUCTURE_REGISTRY.items()
    ]


def list_decisions() -> list[dict[str, str]]:
    """Catalog data for the frontend picker."""
    return [
        {"id": did, "name": cls.NAME, "description": cls.DESCRIPTION}
        for did, cls in DECISION_REGISTRY.items()
    ]
