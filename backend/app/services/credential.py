"""Credential Summary builder + refresher.

The Credential Summary is a JSON dict (participant_id -> assessment)
threaded into every later participant turn. Each LLM participant's entry
is built concurrently during Phase 1 (as their initial opinion lands)
and is only rebuilt later if their backing model changes.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.services.json_calls import orchestrator_call
from app.services.prompts import (
    CREDENTIAL_BUILD_PROMPT,
    CREDENTIAL_REFRESH_PROMPT,
    HUMAN_CREDENTIAL_FROM_PROFILE_PROMPT,
    SINGLE_PARTICIPANT_CREDENTIAL_BUILD_PROMPT,
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
    human_credential: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Build the Credential Summary list. Returns an empty list on parse failure.

    Human participants (kind == "human") are NOT sent to the LLM -
    their credential was generated from the user's profile text in the
    HumanParticipantModal. We prepend that entry to the front of the
    returned list so the human always appears first in the modal /
    export, and we exclude them from the LLM input so the orchestrator
    isn't asked to fabricate facts about a person.
    """
    llm_participants = [p for p in participants if getattr(p, "kind", "") != "human"]

    creds: list[dict[str, Any]] = []
    if llm_participants:
        block = _format_participants_block(llm_participants, initial_opinions)
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

        if isinstance(parsed, dict) and isinstance(parsed.get("credentials"), list):
            creds = parsed["credentials"]

    creds = _normalize_creds(creds, llm_participants)
    if human_credential:
        creds = [normalize_one_credential(human_credential)] + creds
    return creds


async def build_credential_for_participant(
    *,
    orchestrator_model_id: str,
    question: str,
    participant: Any,
    initial_opinion: str,
    api_log: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build one credential entry from a role prompt + Phase-1 opinion."""
    opinion = strip_thinking(initial_opinion or "")
    prompt = SINGLE_PARTICIPANT_CREDENTIAL_BUILD_PROMPT.format(
        question=question,
        participant_id=participant.participant_id,
        name=participant.name,
        role_prompt=(participant.role_prompt or "").strip() or "(none)",
        first_opinion=opinion or "(no opinion recorded)",
    )
    _raw, parsed = await orchestrator_call(
        orchestrator_model_id=orchestrator_model_id,
        user_prompt=prompt,
        label=f"build_credential:{participant.participant_id}",
        api_log=api_log,
        max_tokens=512,
    )
    cred: dict[str, Any] = {}
    if isinstance(parsed, dict):
        if isinstance(parsed.get("credential"), dict):
            cred = parsed["credential"]
        elif isinstance(parsed.get("credentials"), list) and parsed["credentials"]:
            cred = parsed["credentials"][0]

    merged = {
        "participant_id": participant.participant_id,
        "name": participant.name,
        "expertise": cred.get("expertise", ""),
        "personality": cred.get("personality", ""),
        "credibility_for_question": cred.get("credibility_for_question", 0.5),
        "bias_to_watch": cred.get("bias_to_watch", ""),
        "is_human": False,
    }
    if not merged["expertise"]:
        merged["expertise"] = "(no credential available)"
    return normalize_one_credential(merged)


def assemble_credential_summary_list(
    *,
    participants: list[Any],
    credential_entries_by_pid: dict[str, dict[str, Any]],
    human_credential: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Merge per-participant credential rows in roster order (human first)."""
    creds: list[dict[str, Any]] = []
    if human_credential:
        creds.append(normalize_one_credential(human_credential))

    for p in participants:
        if getattr(p, "kind", "") == "human":
            continue
        row = credential_entries_by_pid.get(p.participant_id)
        if row:
            creds.append(row)
        else:
            creds.append(normalize_one_credential({
                "participant_id": p.participant_id,
                "name": p.name,
                "expertise": "(no credential available)",
                "personality": "",
                "credibility_for_question": 0.5,
                "bias_to_watch": "",
                "is_human": False,
            }))
    return creds


async def build_human_credential_from_profile(
    *,
    orchestrator_model_id: str,
    question: str,
    name: str,
    profile_text: str,
    participant_id: str = "",
    api_log: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Turn a human's freeform self-description into a structured credential.

    Uses the same assessment rubric as Phase-1 credential building for
    LLM participants (expertise, style, credibility, bias) but sources
    only the profile text — equivalent to a persona role prompt.
    """
    q = (question or "").strip()
    if q:
        question_block = f"Question:\n<<<\n{q}\n>>>\n\n"
    else:
        question_block = (
            "Discussion question: (not specified yet). Assess the "
            "participant in general terms; credibility_for_question "
            "should reflect their likely relevance once a topic is "
            "chosen.\n\n"
        )
    prompt = HUMAN_CREDENTIAL_FROM_PROFILE_PROMPT.format(
        question_block=question_block,
        name=name.strip(),
        profile_text=profile_text.strip(),
    )
    _raw, parsed = await orchestrator_call(
        orchestrator_model_id=orchestrator_model_id,
        user_prompt=prompt,
        label="human_credential_from_profile",
        api_log=api_log,
        max_tokens=768,
    )
    cred: dict[str, Any] = {}
    if isinstance(parsed, dict):
        if isinstance(parsed.get("credential"), dict):
            cred = parsed["credential"]
        elif isinstance(parsed.get("credentials"), list) and parsed["credentials"]:
            cred = parsed["credentials"][0]

    merged = {
        "participant_id": participant_id,
        "name": name.strip(),
        "expertise": cred.get("expertise", ""),
        "personality": cred.get("personality", ""),
        "credibility_for_question": cred.get("credibility_for_question", 0.55),
        "bias_to_watch": cred.get("bias_to_watch", ""),
        "is_human": True,
    }
    if not merged["expertise"] and profile_text.strip():
        merged["expertise"] = profile_text.strip()[:500]
    return normalize_one_credential(merged)


async def refresh_credential_summary(
    *,
    orchestrator_model_id: str,
    question: str,
    participants: list[Any],
    existing: list[dict[str, Any]],
    critique_transcript: str,
    api_log: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Refresh the Credential Summary after Phase 2 critique.

    Human entries (kind == "human") are passed through verbatim - we
    don't ask the LLM to second-guess the user's self-description. The
    LLM only refreshes credentials for LLM participants.
    """
    if not existing:
        return existing

    human_pids = {p.participant_id for p in participants if getattr(p, "kind", "") == "human"}
    human_entries = [c for c in existing if c.get("participant_id") in human_pids]
    llm_entries = [c for c in existing if c.get("participant_id") not in human_pids]
    llm_participants = [p for p in participants if getattr(p, "kind", "") != "human"]

    if not llm_entries:
        return existing

    prompt = CREDENTIAL_REFRESH_PROMPT.format(
        question=question,
        credential_summary_json=json.dumps({"credentials": llm_entries}, indent=2),
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
        refreshed_llm = _normalize_creds(parsed["credentials"], llm_participants)
        return human_entries + refreshed_llm
    return existing


def normalize_one_credential(c: dict[str, Any]) -> dict[str, Any]:
    """Clamp credibility to [0, 1] and ensure required keys exist on a
    single credential dict. Used for human-authored entries that bypass
    the LLM-side _normalize_creds roster pass."""
    try:
        score = float(c.get("credibility_for_question", 0.5))
    except Exception:
        score = 0.5
    return {
        "participant_id": c.get("participant_id") or c.get("id") or "",
        "name": c.get("name", ""),
        "expertise": c.get("expertise", ""),
        "personality": c.get("personality", ""),
        "credibility_for_question": max(0.0, min(1.0, score)),
        "bias_to_watch": c.get("bias_to_watch", ""),
        "is_human": bool(c.get("is_human", False)),
    }


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
