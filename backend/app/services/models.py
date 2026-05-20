"""Core dataclasses for a CCAI session.

Kept in their own module so `orchestrator.py` can import from them
cleanly and the API layer doesn't need to reach into the orchestrator
to construct one.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from app.services.context_budget import ContextSummary


class Phase(str, Enum):
    INITIAL_OPINIONS = "initial_opinions"
    CRITIQUE_ROUND_1 = "critique_round_1"
    CRITIQUE_ROUND_2 = "critique_round_2"
    STATUS_ASSESSMENT = "status_assessment"
    FINALIZATION = "finalization"
    CONSENSUS = "consensus"
    CLOSURE = "closure"
    FAILSAFE_PAUSED = "failsafe_paused"
    FINISHED = "finished"


# How many participants a session may include (overridable by the user
# via Settings; values outside [3, 9] are clamped server-side).
DEFAULT_MAX_PARTICIPANTS = 5
MIN_MAX_PARTICIPANTS = 3
MAX_MAX_PARTICIPANTS = 9


# Failsafe defaults from the plan: pause every N=60 participant messages
# (then every +20), and every M=100 orchestrator calls (then every +50).
PARTICIPANT_MESSAGE_PAUSE_AT = 60
PARTICIPANT_MESSAGE_PAUSE_INC = 20
ORCHESTRATOR_CALL_PAUSE_AT = 100
ORCHESTRATOR_CALL_PAUSE_INC = 50


@dataclass
class Participant:
    """One member of the CCAI forum.

    `kind` distinguishes Neon HANA personas, the four bundled "extra"
    personas, and user-created Expert Personas. `enabled` reflects the
    sidebar slider. Disabled participants are kept on the session so
    the user can re-enable mid-conversation, but they don't take turns.
    """

    participant_id: str
    name: str
    role_prompt: str
    model_id: str

    kind: str = "expert"  # "neon" | "extra" | "expert"
    enabled: bool = True

    # Resolved provider routing (populated from settings.resolve_model)
    base_url: str = ""
    api_key: str = ""
    display_name: str = ""

    # Neon-specific routing
    is_neon: bool = False
    hana_model_id: str = ""
    persona_name: str = ""
    neon_direct_vllm: bool = False
    vllm_base_url: str = ""
    vllm_api_key: str = ""

    # Per-participant context summary (managed by services.context_budget)
    summary: ContextSummary = field(default_factory=ContextSummary)

    # Robustness counter: 3 consecutive failures auto-disables.
    consecutive_failures: int = 0


@dataclass
class Session:
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))

    question: str = ""
    participants: list[Participant] = field(default_factory=list)

    # Both fall through to settings.orchestrator_model when None. The
    # summarizer additionally falls through to the orchestrator's id when
    # None (so changing one auto-changes the other unless overridden).
    orchestrator_model_id: str | None = None
    summarizer_model_id: str | None = None

    max_participants: int = DEFAULT_MAX_PARTICIPANTS

    phase: Phase = Phase.INITIAL_OPINIONS

    # Phase 1 outputs
    initial_opinions: dict[str, str] = field(default_factory=dict)
    credential_summary: list[dict[str, Any]] = field(default_factory=list)

    # Phase 2 / 3 / 4 / 5 message store. Each entry:
    #   { speaker_id, speaker_name, role: "participant"|"orchestrator",
    #     text, phase, timestamp, elapsed_seconds, addressed_to,
    #     model_id, model_display }
    messages: list[dict[str, Any]] = field(default_factory=list)

    # Phase-4 state: per-participant final opinion text (for alliances)
    final_opinions: dict[str, str] = field(default_factory=dict)
    alliance_groups: list[dict[str, Any]] = field(default_factory=list)

    # Phase-3 status-assessment loop counter (max 3)
    status_assessment_iterations: int = 0

    # Phase-5 / Phase-6 attempts at consensus before giving up (max 2)
    consensus_attempts: int = 0

    # Final structured report after closure
    final_report: dict[str, Any] | None = None

    # Per-participant contribution summaries for the table view
    contribution_summaries: dict[str, str] = field(default_factory=dict)

    # Failsafes
    total_participant_messages: int = 0
    participant_message_cap: int = PARTICIPANT_MESSAGE_PAUSE_AT
    orchestrator_call_count: int = 0
    orchestrator_call_cap: int = ORCHESTRATOR_CALL_PAUSE_AT

    paused_for_continue: bool = False
    pause_reason: str | None = None  # "messages" | "orchestrator"
    finished: bool = False

    # Streaming control: the orchestrator state-machine writes to this and
    # the API layer reads it.
    api_log: list[dict[str, Any]] = field(default_factory=list)
    pending_continue: bool = False
