"""Hand-curated catalog of every prompt template the CCAI orchestrator
and participants use, organized by the order they fire during a chat.

This backs GET /api/chat/prompts/catalog, which feeds the "View current
chat prompts" modal in the settings menu. The goal is user-facing
transparency: a non-technical user should be able to scroll the modal
and understand exactly what the orchestrator asks each participant to
do at each phase.

The catalog is intentionally explicit (rather than auto-discovered) so
the per-prompt `purpose` strings can stay readable and so the
ordering matches the live conversation flow even when prompts are
imported from different modules.
"""
from __future__ import annotations

import re
from typing import Any

from app.services.prompts import (
    ADDRESSED_TO_PROMPT,
    ALLIANCE_DETECTION_PROMPT,
    AUTO_SELECT_PARTICIPANTS_PROMPT,
    CONSENSUS_ALLIED_PROMPT,
    CONSENSUS_SOLO_PROMPT,
    CONSENSUS_STATUS_PROMPT,
    CONTRIBUTION_SUMMARY_PROMPT,
    CREDENTIAL_BUILD_PROMPT,
    CREDENTIAL_REFRESH_PROMPT,
    CRITIQUE_PROMPT,
    FINALIZATION_PROMPT,
    INITIAL_OPINION_PROMPT,
    MAJORITY_REPORT_PROMPT,
    NO_CONSENSUS_REPORT_PROMPT,
    NO_REASONING_DIRECTIVE,
    ORCHESTRATOR_BASE_DIRECTIVE,
    PARTICIPANT_BASE_DIRECTIVE,
    STATUS_ASSESSMENT_PROMPT,
    TARGETED_FOLLOWUP_FROM_PARTICIPANT_PROMPT,
    TARGETED_FOLLOWUP_PROMPT,
    UNADDRESSED_FACTOR_PROMPT,
)


# Each entry: (constant_name, prompt_text, purpose). The frontend will
# also derive {var} placeholders from the prompt text directly, but
# `name` and `purpose` stay hand-curated for readability.
_PROMPTS_BY_NAME: dict[str, tuple[str, str]] = {
    # ── Always-on directives ─────────────────────────────────────
    "PARTICIPANT_BASE_DIRECTIVE": (
        PARTICIPANT_BASE_DIRECTIVE,
        "Appended to every participant's role prompt so they know they "
        "are in a CCAI forum, who the other participants are, and that "
        "the orchestrator (not them) controls the floor.",
    ),
    "NO_REASONING_DIRECTIVE": (
        NO_REASONING_DIRECTIVE,
        "Hard 'no reasoning, no meta-commentary' guard added to every "
        "participant call so models don't leak chain-of-thought, "
        "<think> tags, or scratchpad text into the chat.",
    ),
    "ORCHESTRATOR_BASE_DIRECTIVE": (
        ORCHESTRATOR_BASE_DIRECTIVE,
        "System message for every orchestrator-side LLM call. "
        "Establishes neutrality and demands strict JSON for the "
        "structured ones (status checks, alliance detection, etc.).",
    ),

    # ── Optional pre-chat: Select N Automatically ────────────────
    "AUTO_SELECT_PARTICIPANTS_PROMPT": (
        AUTO_SELECT_PARTICIPANTS_PROMPT,
        "Used when the user enables 'Select N Automatically' in the "
        "participants dropdown. The orchestrator LLM ranks every "
        "available candidate persona by relevance to the question and "
        "returns the top N just before /chat/start.",
    ),

    # ── Phase 1 ─────────────────────────────────────────────────
    "INITIAL_OPINION_PROMPT": (
        INITIAL_OPINION_PROMPT,
        "Phase 1. Asks each participant for an independent first "
        "opinion, with no awareness of what anyone else has said. "
        "This independence is what makes the Credential Summary in "
        "the next step meaningful.",
    ),

    # ── Credential Summary (build) ──────────────────────────────
    "CREDENTIAL_BUILD_PROMPT": (
        CREDENTIAL_BUILD_PROMPT,
        "After Phase 1 the orchestrator builds the Credential Summary: "
        "a neutral assessment of each participant's expertise, "
        "personality, biases, and a 0-1 credibility score on this "
        "specific question. Returned as strict JSON.",
    ),

    # ── Phase 2 ─────────────────────────────────────────────────
    "CRITIQUE_PROMPT": (
        CRITIQUE_PROMPT,
        "Phase 2. Each participant gets one or more critique rounds "
        "(count is tunable in Settings -> Conversation limits). They "
        "address any open questions aimed at them first, then offer "
        "constructive critique of others and may revise their opinion.",
    ),

    # ── Credential Summary (refresh) ────────────────────────────
    "CREDENTIAL_REFRESH_PROMPT": (
        CREDENTIAL_REFRESH_PROMPT,
        "After the last critique round, the orchestrator refreshes "
        "the Credential Summary because participants reveal a lot "
        "more about themselves through critique than through their "
        "opening pitch.",
    ),

    # ── Phase 3 ─────────────────────────────────────────────────
    "STATUS_ASSESSMENT_PROMPT": (
        STATUS_ASSESSMENT_PROMPT,
        "Phase 3. The orchestrator decides whether the group needs "
        "targeted follow-ups before finalization. It prefers to relay "
        "unanswered participant-to-participant questions verbatim and "
        "only synthesizes a new one if no real open thread exists.",
    ),
    "TARGETED_FOLLOWUP_PROMPT": (
        TARGETED_FOLLOWUP_PROMPT,
        "Used inside Phase 3 when the orchestrator is asking a "
        "follow-up of its own initiative (no real open thread "
        "existed). The participant sees this as 'The orchestrator "
        "has a follow-up for you'.",
    ),
    "TARGETED_FOLLOWUP_FROM_PARTICIPANT_PROMPT": (
        TARGETED_FOLLOWUP_FROM_PARTICIPANT_PROMPT,
        "Used inside Phase 3 when the orchestrator is relaying a "
        "previously-unanswered question verbatim from another "
        "participant, attributed to the original asker.",
    ),

    # ── Phase 4 ─────────────────────────────────────────────────
    "FINALIZATION_PROMPT": (
        FINALIZATION_PROMPT,
        "Phase 4. Each participant states a revised post-discussion "
        "opinion OR endorses another participant's revised opinion "
        "(with an optional caveat). Open threads aimed at them are "
        "answered briefly at the top.",
    ),

    # ── Phase 5 ─────────────────────────────────────────────────
    "ALLIANCE_DETECTION_PROMPT": (
        ALLIANCE_DETECTION_PROMPT,
        "Start of Phase 5. The orchestrator clusters participants "
        "into 'alliance groups' based on their revised opinions, so "
        "consensus prompts can address allies and solo voices "
        "differently.",
    ),
    "ADDRESSED_TO_PROMPT": (
        ADDRESSED_TO_PROMPT,
        "Used after each Phase 5 message to classify whether it was "
        "aimed at one specific other participant (a dyadic exchange) "
        "or broadcast to the whole group. Drives the back-and-forth "
        "routing and the 'A -> B' header on each chat bubble.",
    ),
    "CONSENSUS_ALLIED_PROMPT": (
        CONSENSUS_ALLIED_PROMPT,
        "Phase 5 prompt for participants who are part of an alliance. "
        "They advocate for the group's shared stance and try to win "
        "over participants from other groups, addressing ONE "
        "specific participant when possible.",
    ),
    "CONSENSUS_SOLO_PROMPT": (
        CONSENSUS_SOLO_PROMPT,
        "Phase 5 prompt for participants who have no allies. They "
        "pick one of three strategies: persuade the closest group, "
        "switch sides, or propose a compromise.",
    ),
    "CONSENSUS_STATUS_PROMPT": (
        CONSENSUS_STATUS_PROMPT,
        "Used periodically during Phase 5. The orchestrator decides "
        "whether the group has reached majority agreement, is still "
        "shifting productively, or has stalled and needs intervention.",
    ),

    # ── Phase 6 (closure) ───────────────────────────────────────
    "UNADDRESSED_FACTOR_PROMPT": (
        UNADDRESSED_FACTOR_PROMPT,
        "If Phase 5 stalls, the orchestrator looks for ONE important "
        "factor the group hasn't adequately discussed and surfaces it "
        "as a new consideration before re-running consensus.",
    ),
    "MAJORITY_REPORT_PROMPT": (
        MAJORITY_REPORT_PROMPT,
        "Final report when the group reaches majority agreement. The "
        "orchestrator writes a neutral prose summary of the decision, "
        "the strongest supporting reasons, and high-credibility "
        "dissenting points.",
    ),
    "NO_CONSENSUS_REPORT_PROMPT": (
        NO_CONSENSUS_REPORT_PROMPT,
        "Final report when consensus retries are exhausted without "
        "agreement. The orchestrator lays out the major opinions, "
        "names supporters, and offers its own neutral recommendation "
        "with a note that the user should ultimately decide.",
    ),

    # ── Utility / table view ────────────────────────────────────
    "CONTRIBUTION_SUMMARY_PROMPT": (
        CONTRIBUTION_SUMMARY_PROMPT,
        "Run after the chat ends to populate the per-participant "
        "summary column in the table view (and CSV export). Asks the "
        "orchestrator to write a neutral 2-3 sentence recap of each "
        "participant's overall contribution.",
    ),
}


# Ordered grouping that mirrors the live phase flow. Names reference
# `_PROMPTS_BY_NAME` keys; the frontend renders groups in this order.
_GROUPS: list[tuple[str, list[str]]] = [
    ("Always-on directives", [
        "PARTICIPANT_BASE_DIRECTIVE",
        "NO_REASONING_DIRECTIVE",
        "ORCHESTRATOR_BASE_DIRECTIVE",
    ]),
    ("Optional pre-chat", [
        "AUTO_SELECT_PARTICIPANTS_PROMPT",
    ]),
    ("Phase 1: Initial Opinions", [
        "INITIAL_OPINION_PROMPT",
    ]),
    ("Credential Summary (build)", [
        "CREDENTIAL_BUILD_PROMPT",
    ]),
    ("Phase 2: Critique", [
        "CRITIQUE_PROMPT",
    ]),
    ("Credential Summary (refresh)", [
        "CREDENTIAL_REFRESH_PROMPT",
    ]),
    ("Phase 3: Status assessment & targeted follow-ups", [
        "STATUS_ASSESSMENT_PROMPT",
        "TARGETED_FOLLOWUP_PROMPT",
        "TARGETED_FOLLOWUP_FROM_PARTICIPANT_PROMPT",
    ]),
    ("Phase 4: Opinion Finalization", [
        "FINALIZATION_PROMPT",
    ]),
    ("Phase 5: Consensus Gathering", [
        "ALLIANCE_DETECTION_PROMPT",
        "ADDRESSED_TO_PROMPT",
        "CONSENSUS_ALLIED_PROMPT",
        "CONSENSUS_SOLO_PROMPT",
        "CONSENSUS_STATUS_PROMPT",
    ]),
    ("Phase 6: Closure", [
        "UNADDRESSED_FACTOR_PROMPT",
        "MAJORITY_REPORT_PROMPT",
        "NO_CONSENSUS_REPORT_PROMPT",
    ]),
    ("Utility prompts", [
        "CONTRIBUTION_SUMMARY_PROMPT",
    ]),
]


_VAR_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")


def _extract_variables(template: str) -> list[str]:
    """Pull single-brace `{var}` placeholders out of a template,
    preserving the first-occurrence order. Double-brace literals
    (`{{` and `}}` from the JSON examples) are correctly ignored
    because the regex only matches a single brace pair.
    """
    seen: set[str] = set()
    out: list[str] = []
    for m in _VAR_RE.finditer(template):
        name = m.group(1)
        if name in seen:
            continue
        seen.add(name)
        out.append(name)
    return out


def build_prompt_catalog() -> dict[str, Any]:
    """Return the catalog as a JSON-serializable dict.

    Shape:
      {
        "groups": [
          {"title": "...", "items": [{"name", "purpose", "variables", "template"}, ...]},
          ...
        ]
      }
    """
    groups_out: list[dict[str, Any]] = []
    for group_title, names in _GROUPS:
        items: list[dict[str, Any]] = []
        for name in names:
            if name not in _PROMPTS_BY_NAME:
                # Defensive: skip a name typo rather than 500.
                continue
            template, purpose = _PROMPTS_BY_NAME[name]
            items.append({
                "name": name,
                "purpose": purpose,
                "variables": _extract_variables(template),
                "template": template,
            })
        groups_out.append({"title": group_title, "items": items})
    return {"groups": groups_out}
