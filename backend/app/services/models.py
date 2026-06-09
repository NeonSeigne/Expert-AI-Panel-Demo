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
    # Critique-round phases: up to 4 rounds are supported (matches the
    # max value of `ConversationLimits.critique_rounds`). The state
    # machine looks the active phase up via `_critique_phase_for(n)`.
    CRITIQUE_ROUND_1 = "critique_round_1"
    CRITIQUE_ROUND_2 = "critique_round_2"
    CRITIQUE_ROUND_3 = "critique_round_3"
    CRITIQUE_ROUND_4 = "critique_round_4"
    STATUS_ASSESSMENT = "status_assessment"
    FINALIZATION = "finalization"
    CONSENSUS = "consensus"
    CLOSURE = "closure"
    FAILSAFE_PAUSED = "failsafe_paused"
    FINISHED = "finished"
    # Robert's Rules of Order conversation-structure phases. These run
    # in place of (or alongside) the Collaborative Discussion phases
    # when the user picks the "Robert's Rules" conversation structure.
    RR_OPENING = "rr_opening"
    RR_INITIAL_REMARKS = "rr_initial_remarks"
    RR_MOTION = "rr_motion"
    RR_DEBATE = "rr_debate"
    RR_MOVE_THE_QUESTION = "rr_move_the_question"
    # Vote-based decision-method phases. Used by MajorityRulesDecision,
    # RankedChoiceDecision, and RobertsRulesVote so the frontend can
    # render an appropriate phase label.
    VOTING = "voting"


# How many participants a session may include (overridable by the user
# via Settings; values outside [3, 9] are clamped server-side).
DEFAULT_MAX_PARTICIPANTS = 5
MIN_MAX_PARTICIPANTS = 3
MAX_MAX_PARTICIPANTS = 9


# Failsafe defaults from the plan: pause every N=60 participant messages
# (then every +20), and every M=100 orchestrator calls (then every +50).
# These remain the *defaults* for ConversationLimits; the runtime values
# come from Session.limits so the user can tune them per-conversation.
PARTICIPANT_MESSAGE_PAUSE_AT = 60
PARTICIPANT_MESSAGE_PAUSE_INC = 20
ORCHESTRATOR_CALL_PAUSE_AT = 100
ORCHESTRATOR_CALL_PAUSE_INC = 50


@dataclass
class ConversationLimits:
    """Tunable repetition and failsafe limits for one CCAI session.

    Defaults match the historical hard-coded values; the API layer
    clamps user-supplied overrides via `clamp_conversation_limits` so
    out-of-range values don't break the orchestrator. The frontend
    gets the defaults + bounds + descriptions from
    GET /api/chat/limits/defaults so the settings UI is server-driven.
    """

    # ── Discussion structure ──────────────────────────────────────
    # How many critique turns each participant gets in Phase 2.
    critique_rounds: int = 2
    # How many times Phase 3 will surface a follow-up question
    # (orchestrator-synthesized or relayed from a participant) before
    # moving on to finalization. 0 skips Phase 3 entirely.
    status_assessment_max: int = 3
    # Phase 5 turn budget = this number x active participants. Higher
    # means more back-and-forth before the conversation auto-ends.
    consensus_turns_per_participant: int = 6
    # In Phase 5, how many consecutive "addressed-to" routings (one
    # participant addresses another, then is answered, etc.) before
    # we force a round-robin pick. Prevents two participants from
    # monopolizing the floor.
    dyad_cap: int = 2
    # If consensus fails the first time, how many additional attempts
    # the orchestrator makes by surfacing a new factor for the group
    # to consider. 0 disables retries.
    stall_recovery_attempts: int = 1

    # ── Reliability ──────────────────────────────────────────────
    # If a participant's LLM call fails this many times in a row, the
    # orchestrator auto-disables them for the rest of the chat.
    auto_disable_failures: int = 3

    # ── Failsafes ────────────────────────────────────────────────
    # First pause point for participant messages (then increments).
    participant_message_pause_at: int = PARTICIPANT_MESSAGE_PAUSE_AT
    participant_message_pause_inc: int = PARTICIPANT_MESSAGE_PAUSE_INC
    # First pause point for orchestrator-side LLM calls (then increments).
    orchestrator_call_pause_at: int = ORCHESTRATOR_CALL_PAUSE_AT
    orchestrator_call_pause_inc: int = ORCHESTRATOR_CALL_PAUSE_INC


# (min, max) bounds for each limit field. Any user-supplied value is
# clamped to this range server-side. Keep these conservative enough
# to stop runaway conversations and tight enough to keep behavior
# recognizable; widening is fine if a real use case emerges.
CONVERSATION_LIMIT_BOUNDS: dict[str, tuple[int, int]] = {
    "critique_rounds":                  (1, 4),
    "status_assessment_max":            (0, 5),
    "consensus_turns_per_participant":  (2, 12),
    "dyad_cap":                         (1, 5),
    "stall_recovery_attempts":          (0, 3),
    "auto_disable_failures":            (1, 10),
    "participant_message_pause_at":     (10, 500),
    "participant_message_pause_inc":    (5, 100),
    "orchestrator_call_pause_at":       (20, 500),
    "orchestrator_call_pause_inc":      (10, 200),
}


# Human-readable descriptions surfaced in the settings UI alongside
# each stepper. Group key controls the section header.
CONVERSATION_LIMIT_DESCRIPTIONS: dict[str, dict[str, str]] = {
    "critique_rounds": {
        "group": "Discussion structure",
        "label": "Critique rounds",
        "help": (
            "How many times each participant speaks in Phase 2 "
            "(critique). More rounds give the group more chances to "
            "challenge each other; fewer rounds wraps faster."
        ),
    },
    "status_assessment_max": {
        "group": "Discussion structure",
        "label": "Status-assessment iterations",
        "help": (
            "Max number of follow-up questions the orchestrator may "
            "surface in Phase 3 before moving to opinion finalization. "
            "Set to 0 to skip the follow-up phase entirely."
        ),
    },
    "consensus_turns_per_participant": {
        "group": "Discussion structure",
        "label": "Consensus turns per participant",
        "help": (
            "Multiplier on the Phase 5 (consensus) turn budget. The "
            "actual cap is this number times the count of active "
            "participants. Higher = more debate before timeout."
        ),
    },
    "dyad_cap": {
        "group": "Discussion structure",
        "label": "Dyad cap",
        "help": (
            "In Phase 5, how many consecutive addressed-to replies "
            "(A->B->A->...) are allowed before the orchestrator forces "
            "a round-robin pick. Keeps two voices from monopolizing."
        ),
    },
    "stall_recovery_attempts": {
        "group": "Discussion structure",
        "label": "Stall recovery attempts",
        "help": (
            "If the group can't reach majority and the conversation "
            "stalls, how many extra attempts the orchestrator makes "
            "by surfacing a new factor for the group to consider."
        ),
    },
    "auto_disable_failures": {
        "group": "Reliability",
        "label": "Auto-disable after N failures",
        "help": (
            "If a participant's LLM fails this many times in a row, "
            "the orchestrator removes them from the rest of the chat "
            "rather than keep trying."
        ),
    },
    "participant_message_pause_at": {
        "group": "Failsafes",
        "label": "First pause: participant messages",
        "help": (
            "Total participant messages allowed before the "
            "conversation pauses for a 'Continue' confirmation."
        ),
    },
    "participant_message_pause_inc": {
        "group": "Failsafes",
        "label": "Each subsequent pause: +N messages",
        "help": (
            "After the first pause, this many additional participant "
            "messages are allowed before the next pause."
        ),
    },
    "orchestrator_call_pause_at": {
        "group": "Failsafes",
        "label": "First pause: orchestrator calls",
        "help": (
            "Total orchestrator-side LLM calls (assessments, "
            "summaries, classifications) allowed before the "
            "conversation pauses for a 'Continue' confirmation."
        ),
    },
    "orchestrator_call_pause_inc": {
        "group": "Failsafes",
        "label": "Each subsequent pause: +N orchestrator calls",
        "help": (
            "After the first orchestrator-call pause, this many "
            "additional calls are allowed before the next pause."
        ),
    },
}


def clamp_conversation_limits(payload: dict[str, Any] | None) -> ConversationLimits:
    """Build a ConversationLimits from a partial dict. Each field is
    clamped to its declared (min, max) range; missing or non-int values
    fall back to the dataclass default. Never raises - any failure
    silently degrades to the default for that one field.
    """
    limits = ConversationLimits()
    if not payload:
        return limits
    for field_name, (lo, hi) in CONVERSATION_LIMIT_BOUNDS.items():
        if field_name not in payload:
            continue
        raw = payload.get(field_name)
        try:
            v = int(raw)
        except (TypeError, ValueError):
            continue
        v = max(lo, min(hi, v))
        setattr(limits, field_name, v)
    return limits


@dataclass
class Participant:
    """One member of the CCAI forum.

    `kind` distinguishes Neon HANA personas, the four bundled "extra"
    personas, user-created Expert Personas, and an optional in-the-loop
    human participant. `enabled` reflects the sidebar slider. Disabled
    participants are kept on the session so the user can re-enable
    mid-conversation, but they don't take turns.

    Human participants have `kind == "human"`, no `model_id`, and an
    empty `role_prompt`. The orchestrator pauses for their input via
    SSE instead of calling an LLM; the user supplies their text through
    POST /api/chat/{id}/human-response.
    """

    participant_id: str
    name: str
    role_prompt: str
    model_id: str

    kind: str = "expert"  # "neon" | "extra" | "expert" | "human"
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

    # Set by the resilience layer when this participant's backing LLM
    # had to be substituted mid-chat after the original model failed.
    # The persona's name and role_prompt stay the same; only the model
    # fields (model_id, base_url, etc.) get rewritten in place. We
    # stash the originally-resolved model_id here so it's still
    # recoverable in api_log entries and exports.
    substituted_from_model_id: str = ""


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
    # Per-participant credential builds kicked off as each initial
    # opinion completes during Phase 1 (concurrent with remaining turns).
    credential_build_tasks: dict[str, Any] = field(default_factory=dict)
    credential_entries_by_pid: dict[str, dict[str, Any]] = field(
        default_factory=dict,
    )
    # model_id each credential row was built for; used to rebuild only
    # when the backing LLM behind a participant changes.
    credential_model_by_pid: dict[str, str] = field(default_factory=dict)

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

    # User-tunable limits for this conversation. Defaults match the
    # legacy hard-coded values; the API layer overrides via
    # `clamp_conversation_limits` from the request payload. The
    # orchestrator reads only from `session.limits.*`, never the
    # module-level constants, so behavior is fully driven by config.
    limits: ConversationLimits = field(default_factory=ConversationLimits)

    # Failsafes (runtime state). The *_cap fields start at the limits'
    # configured first-pause point and grow by the configured increment
    # each time the user clicks Continue.
    total_participant_messages: int = 0
    participant_message_cap: int = PARTICIPANT_MESSAGE_PAUSE_AT
    orchestrator_call_count: int = 0
    orchestrator_call_cap: int = ORCHESTRATOR_CALL_PAUSE_AT

    paused_for_continue: bool = False
    pause_reason: str | None = None  # "messages" | "orchestrator" | "human_turn"
    finished: bool = False

    # While the orchestrator is awaiting the human participant's text,
    # this carries the metadata the frontend needs to render the input
    # slot (speaker_id, name, phase, etc.). None when no human turn is
    # pending. The session is paused_for_continue while this is set.
    awaiting_human: dict[str, Any] | None = None

    # User-authored credential summary for the in-the-loop human
    # participant (kind == "human"). None when there is no human in
    # this session. The orchestrator prepends this entry to the
    # LLM-built credential summary so the human always appears first
    # in the View Credential Summary modal and exports. Schema:
    #   {participant_id, name, expertise, personality,
    #    credibility_for_question (float 0..1), bias_to_watch}
    human_credential: dict[str, Any] | None = None

    # Streaming control: the orchestrator state-machine writes to this and
    # the API layer reads it.
    api_log: list[dict[str, Any]] = field(default_factory=list)
    pending_continue: bool = False

    # Resilience-layer state. Populated at /chat/start (api/chat.py) so
    # the orchestrator can swap participants / backing LLMs without
    # repeating the catalog + provider walks at runtime.
    #
    # * candidate_pool: fully-resolved Participant objects from the
    #   catalog (Neon + extras) that the user did NOT pick. Used in
    #   Phase 1 when an originally-selected participant fails their
    #   first opinion: we pop one from this list as the "alternate".
    #
    # * substitution_chain: resolved model-dicts (the same shape
    #   settings.resolve_model returns) in fallback order. Used when
    #   the original participant's backing LLM has to be swapped:
    #     gpt-5.4 -> gemini-2.5-flash -> every other external model
    #     -> Neon "vanilla" models as last resort.
    #
    # Both are computed once per session; consumers should treat them
    # as ordered queues (pop from front).
    candidate_pool: list[Participant] = field(default_factory=list)
    substitution_chain: list[dict[str, Any]] = field(default_factory=list)

    # Conversation-format plugin selection. Resolved via
    # `app.services.conversation.get_structure(...)` /
    # `get_decision(...)`. Default to the original CCAI behavior
    # (collaborative discussion + consensus decision) so older
    # /chat/start payloads keep working without changes.
    conversation_structure_id: str = "collaborative"
    decision_method_id: str = "consensus"

    # Robert's Rules state. Only populated when
    # `conversation_structure_id == "roberts_rules"`. The decision
    # method reads `main_motion` and (optionally) `proposed_motions`
    # so a non-RR decision method like RankedChoice can still operate
    # on RR output.
    main_motion: str | None = None
    proposed_motions: list[dict[str, Any]] = field(default_factory=list)

    # Rolling summary for orchestrator judge prompts when the transcript
    # grows past the compact-transcript char budget (see orchestrator_speed).
    orchestrator_context_summary: str = ""
    orchestrator_context_through_idx: int = -1

    # Background task that builds per-participant contribution summaries
    # for the Table View. Kicked off by run_conversation just before the
    # decision phase so that by the time the user opens Table View the
    # work is already done. `Any` rather than `asyncio.Task` to avoid the
    # import-time dependency on a running loop.
    contribution_summary_task: Any = None
