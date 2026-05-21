"""Auto-select N participants for a question.

Backs the optional "Select N Automatically" toggle in the participants
dropdown. The orchestrator LLM ranks the full candidate pool for
relevance to the question and returns the top N. The service:

- formats a compact candidates block (id + name + role role-prompt
  snippet) so the LLM can pick deliberately;
- runs the call through `orchestrator_call` (which strips think
  traces and is JSON-tolerant);
- validates every returned id against the candidate pool, drops
  invented ones, and pads with the next-best unused candidates if the
  LLM under-delivered.

If the orchestrator call fails entirely, we fall back to the first N
candidates in the order received, so the user still gets a working
chat instead of a hard error.
"""
from __future__ import annotations

import logging
from typing import Any

from app.services.json_calls import orchestrator_call
from app.services.prompts import AUTO_SELECT_PARTICIPANTS_PROMPT

LOG = logging.getLogger(__name__)

_ROLE_SNIPPET_CHARS = 320


def _candidate_block(candidates: list[dict[str, Any]]) -> str:
    """Render one line per candidate: id, name, kind, model, role snippet.

    Role prompts are truncated so a roster of ~30 candidates fits in
    a single orchestrator call without crowding out the question.
    """
    lines: list[str] = []
    for i, c in enumerate(candidates, start=1):
        role = (c.get("role_prompt") or "").strip()
        if len(role) > _ROLE_SNIPPET_CHARS:
            role = role[:_ROLE_SNIPPET_CHARS].rstrip() + "..."
        lines.append(
            f"{i}. id={c.get('participant_id')} | name={c.get('name')} "
            f"| kind={c.get('kind')} | model={c.get('model_id')}\n"
            f"   role: {role or '(no role description)'}"
        )
    return "\n".join(lines)


def _validate_and_pad(
    selected_raw: list[str] | None,
    candidates: list[dict[str, Any]],
    count: int,
) -> list[str]:
    """Keep only LLM-returned ids that exist in the candidate pool,
    de-dupe while preserving the LLM's ranking, and pad with the next
    unused candidates (in input order) up to `count`.
    """
    valid_ids = {c.get("participant_id") for c in candidates if c.get("participant_id")}
    chosen: list[str] = []
    seen: set[str] = set()
    for sid in selected_raw or []:
        if not isinstance(sid, str):
            continue
        if sid in valid_ids and sid not in seen:
            chosen.append(sid)
            seen.add(sid)
        if len(chosen) == count:
            break

    if len(chosen) < count:
        # Pad with the first unused candidates in the order received.
        for c in candidates:
            pid = c.get("participant_id")
            if not pid or pid in seen:
                continue
            chosen.append(pid)
            seen.add(pid)
            if len(chosen) == count:
                break

    return chosen[:count]


async def auto_select_participants(
    *,
    orchestrator_model_id: str,
    question: str,
    candidates: list[dict[str, Any]],
    count: int,
    api_log: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Return {"selected": [participant_id, ...], "rationale": str}.

    `selected` is always exactly `count` long (padded from the
    candidate pool if the LLM under-delivers). Never raises on LLM
    errors - those degrade to a first-N fallback so the caller can
    proceed to /chat/start.
    """
    n_target = max(1, min(count, len(candidates)))

    if not candidates:
        return {"selected": [], "rationale": "No candidates provided."}

    # Single-candidate / under-supplied pools have nothing to pick from.
    if len(candidates) <= n_target:
        return {
            "selected": [c["participant_id"] for c in candidates if c.get("participant_id")],
            "rationale": "Candidate pool was at or below the requested count; using all.",
        }

    prompt = AUTO_SELECT_PARTICIPANTS_PROMPT.format(
        question=question.strip(),
        candidates_block=_candidate_block(candidates),
        count=n_target,
    )
    _raw, parsed = await orchestrator_call(
        orchestrator_model_id=orchestrator_model_id,
        user_prompt=prompt,
        label="auto_select_participants",
        api_log=api_log,
        max_tokens=512,
        temperature=0.2,
    )

    selected_raw: list[str] | None = None
    rationale = ""
    if isinstance(parsed, dict):
        if isinstance(parsed.get("selected"), list):
            selected_raw = [str(x) for x in parsed["selected"]]
        if isinstance(parsed.get("rationale"), str):
            rationale = parsed["rationale"].strip()

    selected = _validate_and_pad(selected_raw, candidates, n_target)

    if not rationale:
        rationale = "Selected by relevance to the question."
    if not selected_raw:
        rationale = "Auto-select fell back to the first candidates (LLM unavailable)."

    return {"selected": selected, "rationale": rationale}
