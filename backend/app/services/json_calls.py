"""Helpers for orchestrator-side LLM calls that need JSON-shaped output."""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

from app.clients.openai_compat import openai_chat_completion
from app.config import settings
from app.services.prompts import ORCHESTRATOR_BASE_DIRECTIVE
from app.utils.sanitize import strip_thinking

LOG = logging.getLogger(__name__)


def _strip_json_fences(raw: str) -> str:
    """Some models wrap JSON in ```json ... ``` fences. Peel them off."""
    raw = raw.strip()
    if raw.startswith("```"):
        # drop the first fence line
        first_nl = raw.find("\n")
        if first_nl != -1:
            raw = raw[first_nl + 1:]
        raw = raw.rstrip()
        if raw.endswith("```"):
            raw = raw[:-3].rstrip()
    return raw


def _extract_json_blob(raw: str) -> str:
    """Best-effort: pull out the first balanced { ... } or [ ... ] block."""
    raw = _strip_json_fences(raw)
    for opener, closer in [("{", "}"), ("[", "]")]:
        start = raw.find(opener)
        if start == -1:
            continue
        depth = 0
        in_str = False
        esc = False
        for i in range(start, len(raw)):
            ch = raw[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
                continue
            if ch == opener:
                depth += 1
            elif ch == closer:
                depth -= 1
                if depth == 0:
                    return raw[start:i + 1]
    return raw


def parse_json_response(raw: str) -> dict | list | None:
    """Tolerant JSON parser for orchestrator outputs.

    Handles markdown fences, leading/trailing prose, and falls back to
    extracting the first balanced bracket block. Returns None if nothing
    parseable is found.
    """
    if not raw:
        return None
    candidates = [raw, _strip_json_fences(raw), _extract_json_blob(raw)]
    seen: set[str] = set()
    for c in candidates:
        c = c.strip()
        if not c or c in seen:
            continue
        seen.add(c)
        try:
            return json.loads(c)
        except Exception:
            continue
    LOG.warning("parse_json_response failed; raw=%r", raw[:200])
    return None


async def orchestrator_call(
    *,
    orchestrator_model_id: str,
    user_prompt: str,
    label: str,
    api_log: list[dict[str, Any]] | None = None,
    expect_json: bool = True,
    temperature: float = 0.2,
    max_tokens: int = 1024,
    timeout: float = 45.0,
) -> tuple[str, dict | list | None]:
    """Run an orchestrator-side LLM call.

    Returns (raw_text_after_strip, parsed_json_or_None). When `expect_json`
    is False the parsed value will always be None and the caller should use
    the raw text. Any exception is converted into a ("", None) result so
    the orchestrator state machine can degrade gracefully.
    """
    resolved = settings.resolve_model(orchestrator_model_id)
    if not resolved:
        LOG.warning("Orchestrator model %s not resolvable", orchestrator_model_id)
        return "", None

    messages = [
        {"role": "system", "content": ORCHESTRATOR_BASE_DIRECTIVE},
        {"role": "user", "content": user_prompt},
    ]

    log_entry: dict[str, Any] = {
        "timestamp": time.time(),
        "label": f"orchestrator:{label}",
        "model": resolved["model_id"],
        "request": {"messages": messages, "max_tokens": max_tokens},
    }
    try:
        result = await openai_chat_completion(
            base_url=resolved["base_url"],
            api_key=resolved["api_key"],
            model=resolved["model_id"],
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
        )
    except Exception as exc:
        LOG.exception("orchestrator_call %s failed: %s", label, exc)
        log_entry["response"] = {"error": str(exc)}
        if api_log is not None:
            api_log.append(log_entry)
        return "", None

    log_entry["response"] = result
    if api_log is not None:
        api_log.append(log_entry)

    raw = strip_thinking(result.get("response", ""))
    parsed = parse_json_response(raw) if expect_json else None
    return raw, parsed
