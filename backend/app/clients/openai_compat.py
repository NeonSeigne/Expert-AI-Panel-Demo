from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any

import httpx

LOG = logging.getLogger(__name__)

_shared_client: httpx.AsyncClient | None = None

_THINK_TAG_RE = re.compile(r"<think>.*?</think>", re.DOTALL)
_REASONING_BLOCK_RE = re.compile(
    r"<(reasoning|reflection|inner_thoughts|scratchpad)>.*?</\1>",
    re.DOTALL,
)

_MAX_COMPLETION_TOKEN_MODELS = {
    "o1", "o1-mini", "o1-preview", "o3", "o3-mini", "o4-mini",
    "gpt-5", "gpt-oss",
}
_NO_TEMPERATURE_MODELS = {"o1", "o1-mini", "o1-preview", "o3", "o3-mini", "o4-mini"}


def _get_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(timeout=45.0)
    return _shared_client


def _strip_thinking(text: str) -> str:
    """Remove chain-of-thought artifacts from any model's response."""
    text = _THINK_TAG_RE.sub("", text)
    text = _REASONING_BLOCK_RE.sub("", text)
    return text.strip()


def _detect_thinking_model(model: str, msg: dict) -> bool:
    """Detect thinking models from the response itself, not just the model name."""
    if msg.get("reasoning_content") or msg.get("reasoning"):
        return True
    content = msg.get("content") or ""
    if _THINK_TAG_RE.search(content):
        return True
    return False


async def openai_chat_completion(
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, str]],
    temperature: float = 0.7,
    max_tokens: int = 1024,
    timeout: float | None = None,
) -> dict[str, Any]:
    """Send a chat completion request to any OpenAI-compatible endpoint."""
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    needs_mct = any(model.startswith(prefix) for prefix in _MAX_COMPLETION_TOKEN_MODELS)
    skip_temp = any(model.startswith(prefix) for prefix in _NO_TEMPERATURE_MODELS)

    effective_max = max_tokens * 4
    effective_timeout = max(timeout * 2, 120) if timeout else timeout

    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
    }
    if needs_mct:
        body["max_completion_tokens"] = effective_max
    else:
        body["max_tokens"] = effective_max
    if not skip_temp:
        body["temperature"] = temperature

    req_timeout = httpx.Timeout(effective_timeout) if effective_timeout else None
    client = _get_client()
    t0 = time.time()
    for attempt in range(2):
        try:
            resp = await client.post(url, json=body, headers=headers, timeout=req_timeout)
            if resp.status_code >= 400 and attempt == 0:
                LOG.warning("Error %d on %s (attempt 1), retrying in 1.1s", resp.status_code, model)
                await asyncio.sleep(1.1)
                continue
            elapsed = time.time() - t0
            resp.raise_for_status()
            data = resp.json()
            choices = data.get("choices", [])
            text = ""
            finish_reason = ""
            had_thinking = False
            if choices:
                msg = choices[0].get("message") or {}
                text = msg.get("content") or ""
                finish_reason = choices[0].get("finish_reason") or ""
                had_thinking = _detect_thinking_model(model, msg)
                text = _strip_thinking(text)

            if had_thinking:
                LOG.info("Stripped thinking content from %s response", model)

            return {
                "response": text.strip(),
                "elapsed_seconds": round(elapsed, 2),
                "model": data.get("model", model),
                "finish_reason": finish_reason,
            }
        except httpx.HTTPStatusError as exc:
            if attempt == 0:
                LOG.warning("HTTPStatusError on %s (attempt 1), retrying", model)
                await asyncio.sleep(1.1)
                continue
            elapsed = time.time() - t0
            detail = exc.response.text[:300] if exc.response else str(exc)
            LOG.error("OpenAI-compat %s error %s: %s", base_url, exc.response.status_code, detail)
            return {
                "response": f"[Error {exc.response.status_code}]: {detail}",
                "elapsed_seconds": round(elapsed, 2),
                "model": model,
                "error": True,
            }
        except Exception as exc:
            if attempt == 0:
                LOG.warning("Exception on %s (attempt 1), retrying: %s", model, exc)
                await asyncio.sleep(1.1)
                continue
            elapsed = time.time() - t0
            LOG.exception("OpenAI-compat request failed: %s", exc)
            return {
                "response": f"[Error]: {exc}",
                "elapsed_seconds": round(elapsed, 2),
                "model": model,
                "error": True,
            }


async def close_shared_client() -> None:
    global _shared_client
    if _shared_client and not _shared_client.is_closed:
        await _shared_client.aclose()
    _shared_client = None
