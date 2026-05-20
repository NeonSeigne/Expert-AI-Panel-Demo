"""Credential Summary builder + refresher.

The Credential Summary is a JSON dict (participant_id -> assessment)
threaded into every later participant turn. It is built once after Phase
1 and refreshed once after Phase 2 critique.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.services.json_calls import orchestrator_call
from app.services.prompts import (
    CREDENTIAL_BUILD_PROMPT,
    CREDENTIAL_REFRESH_PROMPT,
)
from app.utils.sanitize import strip_thinking

LOG = logging.getLogger(__name__)


def _format_participants_block(
    participants: list[Any],
    initial_opinions: dict[str, str],
) -> str:
    """Render one block per participant containing role prompt + first opinion."""
    lines: list[str] = []
    for p in participants:
        opinion = strip_thinking(initial_opinions.get(p.participant_id, ""))
        lines.append(f"--- Participant id: {p.participant_id} ---")
        lines.append(f"Name: {p.name}")
        lines.append(f"Role prompt: {p.role_prompt}")
        lines.append(f"First opinion: {opinion}")
        lines.append("")
    return "\n".join(lines).strip()


def credentials_to_block(credentials: list[dict[str, Any]]) -> str:
    """Render the credentials list back into a string for use inside
    participant prompts (so we can keep them readable rather than
    embedding raw JSON in role prompts)."""
    if not credentials:
        return "(no credential summary available yet)"
    lines: list[str] = []
    for c in credentials:
        lines.append(f"- {c.get('name', c.get('participant_id', '?'))} "
                     f"(id={c.get('participant_id', '?')})")
        if c.get("expertise"):
            lines.append(f"    Expertise: {c['expertise']}")
        if c.get("personality"):
            lines.append(f"    Style: {c['personality']}")
        if c.get("credibility_for_question") is not None:
            lines.append(f"    Credibility on this question: {c['credibility_for_question']:.2f}")
        if c.get("bias_to_watch"):
            lines.append(f"    Bias to watch: {c['bias_to_watch']}")
    return "\n".join(lines)


async def build_credential_summary(
    *,
    orchestrator_model_id: str,
    question: str,
    participants: list[Any],
    initial_opinions: dict[str, str],
    api_log: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Build the Credential Summary list. Returns an empty list on parse failure."""
    block = _format_participants_block(participants, initial_opinions)
    prompt = CREDENTIAL_BUILD_PROMPT.format(
        question=question,
        participants_block=block,
    )
    _raw, parsed = await orchestrator_call(
        orchestrator_model_id=orchestrator_model_id,
        user_prompt=prompt,
        label="build_credentials",
        api_log=api_log,
        max_tokens=2048,
    )

    creds: list[dict[str, Any]] = []
    if isinstance(parsed, dict) and isinstance(parsed.get("credentials"), list):
        creds = parsed["credentials"]

    creds = _normalize_creds(creds, participants)
    return creds


async def refresh_credential_summary(
    *,
    orchestrator_model_id: str,
    question: str,
    participants: list[Any],
    existing: list[dict[str, Any]],
    critique_transcript: str,
    api_log: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Refresh the Credential Summary after Phase 2 critique."""
    if not existing:
        return existing
    prompt = CREDENTIAL_REFRESH_PROMPT.format(
        question=question,
        credential_summary_json=json.dumps({"credentials": existing}, indent=2),
        critique_transcript=critique_transcript,
    )
    _raw, parsed = await orchestrator_call(
        orchestrator_model_id=orchestrator_model_id,
        user_prompt=prompt,
        label="refresh_credentials",
        api_log=api_log,
        max_tokens=2048,
    )
    if isinstance(parsed, dict) and isinstance(parsed.get("credentials"), list):
        return _normalize_creds(parsed["credentials"], participants)
    return existing


def _normalize_creds(
    creds: list[dict[str, Any]],
    participants: list[Any],
) -> list[dict[str, Any]]:
    """Defensive cleanup: ensure credibility is a float in [0, 1] and that
    every participant has a row (fill in placeholders if the model dropped
    one)."""
    by_id: dict[str, dict[str, Any]] = {}
    for c in creds:
        pid = c.get("participant_id") or c.get("id") or ""
        if not pid:
            continue
        try:
            score = float(c.get("credibility_for_question", 0.5))
        except Exception:
            score = 0.5
        c["credibility_for_question"] = max(0.0, min(1.0, score))
        by_id[pid] = c

    out: list[dict[str, Any]] = []
    for p in participants:
        if p.participant_id in by_id:
            row = by_id[p.participant_id]
            row.setdefault("name", p.name)
            out.append(row)
        else:
            out.append({
                "participant_id": p.participant_id,
                "name": p.name,
                "expertise": "(no credential available)",
                "personality": "",
                "credibility_for_question": 0.5,
                "bias_to_watch": "",
            })
    return out
