"""Phase-5 consensus helpers: alliance detection, addressed-to
classification, status-checks, and unaddressed-factor probing.

All four are short JSON-shaped orchestrator calls layered on top of
`json_calls.orchestrator_call`.
"""
from __future__ import annotations

import logging
from typing import Any

from app.services.json_calls import orchestrator_call
from app.services.prompts import (
    ALLIANCE_DETECTION_PROMPT,
    ADDRESSED_TO_PROMPT,
    CONSENSUS_STATUS_PROMPT,
    UNADDRESSED_FACTOR_PROMPT,
)

LOG = logging.getLogger(__name__)


def _format_finalization_block(
    participants: list[Any],
    final_opinions: dict[str, str],
) -> str:
    lines: list[str] = []
    for p in participants:
        text = final_opinions.get(p.participant_id, "(no final opinion)").strip()
        lines.append(f"--- {p.name} (id={p.participant_id}) ---")
        lines.append(text)
        lines.append("")
    return "\n".join(lines).strip()


def _format_roster_block(participants: list[Any]) -> str:
    return "\n".join(
        f"- id: {p.participant_id} | name: {p.name}" for p in participants
    )


def _format_alliance_block(groups: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for i, g in enumerate(groups):
        members = ", ".join(g.get("members") or [])
        lines.append(f"Group {i}: stance=\"{g.get('stance', '')}\" members=[{members}]")
    return "\n".join(lines)


async def detect_alliances(
    *,
    orchestrator_model_id: str,
    question: str,
    participants: list[Any],
    final_opinions: dict[str, str],
    api_log: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    prompt = ALLIANCE_DETECTION_PROMPT.format(
        question=question,
        finalization_block=_format_finalization_block(participants, final_opinions),
    )
    _raw, parsed = await orchestrator_call(
        orchestrator_model_id=orchestrator_model_id,
        user_prompt=prompt,
        label="alliances",
        api_log=api_log,
        max_tokens=1024,
    )
    if isinstance(parsed, dict) and isinstance(parsed.get("groups"), list):
        groups = parsed["groups"]
        return _normalize_groups(groups, participants)

    # Fallback: every participant in their own group.
    return [
        {"stance": "(unclassified)", "members": [p.participant_id]}
        for p in participants
    ]


def _normalize_groups(
    groups: list[dict[str, Any]],
    participants: list[Any],
) -> list[dict[str, Any]]:
    """Make sure every participant id appears in exactly one group."""
    valid_ids = {p.participant_id for p in participants}
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for g in groups:
        members = [m for m in (g.get("members") or []) if m in valid_ids and m not in seen]
        seen.update(members)
        if members:
            out.append({
                "stance": g.get("stance", "(unspecified)"),
                "members": members,
            })
    leftovers = [pid for pid in valid_ids if pid not in seen]
    for pid in leftovers:
        out.append({"stance": "(unclassified)", "members": [pid]})
    return out


async def classify_addressed_to(
    *,
    orchestrator_model_id: str,
    participants: list[Any],
    speaker_name: str,
    message: str,
    api_log: list[dict[str, Any]] | None = None,
) -> str | None:
    prompt = ADDRESSED_TO_PROMPT.format(
        roster_block=_format_roster_block(participants),
        speaker=speaker_name,
        message=message,
    )
    _raw, parsed = await orchestrator_call(
        orchestrator_model_id=orchestrator_model_id,
        user_prompt=prompt,
        label="addressed_to",
        api_log=api_log,
        max_tokens=128,
    )
    if isinstance(parsed, dict):
        target = parsed.get("addressed_to")
        if target and any(p.participant_id == target for p in participants):
            return target
    return None


async def assess_consensus_status(
    *,
    orchestrator_model_id: str,
    question: str,
    transcript: str,
    alliance_groups: list[dict[str, Any]],
    api_log: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    prompt = CONSENSUS_STATUS_PROMPT.format(
        question=question,
        transcript=transcript,
        alliance_block=_format_alliance_block(alliance_groups),
    )
    _raw, parsed = await orchestrator_call(
        orchestrator_model_id=orchestrator_model_id,
        user_prompt=prompt,
        label="consensus_status",
        api_log=api_log,
        max_tokens=256,
    )
    if isinstance(parsed, dict) and parsed.get("status") in {"majority", "productive", "unproductive"}:
        return parsed
    # Default: treat as productive so we keep iterating, but give it a
    # bounded number of attempts via the orchestrator-call cap.
    return {"status": "productive", "majority_group_index": None, "rationale": ""}


async def find_unaddressed_factor(
    *,
    orchestrator_model_id: str,
    question: str,
    credential_summary_block: str,
    transcript: str,
    api_log: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    prompt = UNADDRESSED_FACTOR_PROMPT.format(
        question=question,
        credential_summary=credential_summary_block,
        transcript=transcript,
    )
    _raw, parsed = await orchestrator_call(
        orchestrator_model_id=orchestrator_model_id,
        user_prompt=prompt,
        label="unaddressed_factor",
        api_log=api_log,
        max_tokens=512,
    )
    if isinstance(parsed, dict) and parsed.get("factor"):
        return parsed
    return None
