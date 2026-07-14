"""LLM-based reformatter for Neon (model, persona) name pairs.

The raw Neon catalog uses identifiers like model="Shakespeare",
persona="Historian" or model="Security", persona="CybersecurityExpert".
For the participant dropdown, sidebar, and chat bubbles we want clean,
human-friendly display names. This module sends one batched LLM call
that combines, dedupes, splits CamelCase, and strips technical suffixes.

Examples:
  ("Shakespeare", "Historian")        -> "Shakespeare Historian"
  ("Shakespeare", "Shakespeare")      -> "Shakespeare"
  ("Security",    "CybersecurityExpert") -> "Cybersecurity Expert"
  ("LogisticsLLM", "Logistics-Expert-LLM") -> "Logistics Expert"

Names are cached in-memory (keyed by the raw pair) so we make at most
one LLM call per unique pair across the lifetime of the process. The
deterministic fallback (`_fallback_name`) handles every malformed,
empty, or unreachable LLM response gracefully so callers always get a
usable string.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Iterable

from app.config import settings
from app.services.json_calls import orchestrator_call

LOG = logging.getLogger(__name__)

# Cache: (model_short, persona_name) -> display_name
_NAME_CACHE: dict[tuple[str, str], str] = {}


_NAMING_PROMPT = (
    "You reformat AI persona display names. Each input is a (model, "
    "persona) pair drawn from a multi-LLM forum. Produce ONE short, "
    "natural display name per pair (1-3 words, properly capitalized).\n\n"
    "Rules:\n"
    "1. If the model and persona names duplicate each other (e.g. both "
    "'Shakespeare'), use just one of them.\n"
    "2. If the persona is a single concatenated word (e.g. "
    "'CybersecurityExpert'), split it into natural words "
    "('Cybersecurity Expert').\n"
    "3. If the persona is a role and the model is a topic, combine "
    "them naturally with the topic first (e.g. model='Shakespeare', "
    "persona='Historian' -> 'Shakespeare Historian').\n"
    "4. Strip technical suffixes ('LLM', 'AI', '_LLM', '_AI', "
    "'-Expert-LLM') if they don't add information. Keep them only if "
    "they are the only meaningful part.\n"
    "5. Replace underscores and dashes with spaces; convert CamelCase "
    "to spaced words.\n"
    "6. If only one input is meaningful, use that one cleaned up.\n\n"
    "Input is a JSON list of objects. Reply with ONLY a JSON object "
    "of the shape {{\"names\": [\"...\", \"...\", ...]}} in the same "
    "order as the input.\n\n"
    "Input:\n{input_json}"
)


def _split_words(s: str) -> list[str]:
    s = (s or "").replace("_", " ").replace("-", " ")
    s = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", s)
    s = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", " ", s)
    return [t for t in s.split() if t]


def _strip_jargon(words: list[str]) -> list[str]:
    drop = {"LLM", "AI", "Bot"}
    return [w for w in words if w not in drop]


def _fallback_name(model_short: str, persona_name: str) -> str:
    """Deterministic backup used if the LLM call fails or returns garbage."""
    m_words = _strip_jargon(_split_words(model_short))
    p_words = _strip_jargon(_split_words(persona_name))

    if not p_words and not m_words:
        return persona_name or model_short or "Persona"
    if not p_words:
        return " ".join(m_words)
    if not m_words:
        return " ".join(p_words)

    m_norm = " ".join(m_words).lower()
    p_norm = " ".join(p_words).lower()
    if m_norm == p_norm:
        return " ".join(p_words)
    if m_norm in p_norm:
        return " ".join(p_words)
    if p_norm in m_norm:
        return " ".join(m_words)
    return " ".join(m_words + p_words)


async def reformat_neon_names(
    pairs: Iterable[tuple[str, str]],
) -> dict[tuple[str, str], str]:
    """Return a {(model_short, persona_name): display_name} mapping.

    Cached pairs are reused. Uncached pairs are batched into a single
    orchestrator LLM call. Any pair the LLM doesn't successfully name
    falls back to a deterministic rule.
    """
    pair_list = list(pairs)
    out: dict[tuple[str, str], str] = {}
    uncached: list[tuple[str, str]] = []
    for k in pair_list:
        if k in _NAME_CACHE:
            out[k] = _NAME_CACHE[k]
        else:
            uncached.append(k)

    if not uncached:
        return out

    input_objs = [{"model": k[0], "persona": k[1]} for k in uncached]
    prompt = _NAMING_PROMPT.format(input_json=json.dumps(input_objs, indent=2))

    raw, parsed = await orchestrator_call(
        orchestrator_model_id=settings.orchestrator_model,
        user_prompt=prompt,
        label="persona_naming",
        api_log=None,
        expect_json=True,
        max_tokens=512,
        temperature=0.0,
    )

    names: list[str] = []
    if isinstance(parsed, dict) and isinstance(parsed.get("names"), list):
        names = [str(n).strip() for n in parsed["names"]]

    for i, k in enumerate(uncached):
        if i < len(names) and names[i]:
            display = names[i]
        else:
            display = _fallback_name(*k)
            LOG.info(
                "persona_naming fallback used for %s/%s -> %s",
                k[0], k[1], display,
            )
        _NAME_CACHE[k] = display
        out[k] = display

    return out


async def reformat_neon_names_bounded(
    pairs: Iterable[tuple[str, str]],
    *,
    timeout: float = 8.0,
) -> dict[tuple[str, str], str]:
    """Like reformat_neon_names but never blocks the personas API indefinitely."""
    pair_list = list(pairs)
    if not pair_list:
        return {}
    try:
        return await asyncio.wait_for(reformat_neon_names(pair_list), timeout=timeout)
    except asyncio.TimeoutError:
        LOG.warning(
            "persona_naming timed out after %.1fs for %d pairs; using fallbacks",
            timeout,
            len(pair_list),
        )
        return {k: _fallback_name(*k) for k in pair_list}


def cache_size() -> int:
    return len(_NAME_CACHE)
