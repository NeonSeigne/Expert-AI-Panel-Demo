from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

import httpx

from app.utils.sanitize import strip_thinking, response_has_thinking

LOG = logging.getLogger(__name__)

_shared_client: httpx.AsyncClient | None = None

_MAX_COMPLETION_TOKEN_MODELS = {
    "o1", "o1-mini", "o1-preview", "o3", "o3-mini", "o4-mini",
    "gpt-5", "gpt-oss",
}
_NO_TEMPERATURE_MODELS = {"o1", "o1-mini", "o1-preview", "o3", "o3-mini", "o4-mini"}

# Models that emit long internal reasoning traces; allow a higher completion
# cap. Flash/mini/instruct models use the requested max_tokens as-is.
_THINKING_MULTIPLIER_MODEL_PREFIXES = _MAX_COMPLETION_TOKEN_MODELS
_THINKING_NAME_HINTS = ("thinking", "reasoning", "-think", "/think")

# Reserve a few tokens for chat-template framing the server tacks on (the
# vLLM server and OpenAI both add a small overhead per request that our
# input estimate doesn't account for).
_INPUT_SAFETY_MARGIN = 128
# Floor: never request fewer than this many output tokens, even if input
# is huge - we'd rather get a truncated reply than no reply at all.
_MIN_OUTPUT_TOKENS = 64

# HTTP status codes that map to "transient" — worth retrying the same
# model. 429 is rate-limit; 408/425 are timeout/too-early; 5xx are
# server-side. Everything else 4xx is treated as "permanent" (auth,
# invalid request, content filter, model gone) where retrying the same
# model won't help, so the orchestrator's resilience layer should jump
# straight to substituting the LLM backing the persona.
_TRANSIENT_HTTP_STATUSES = {408, 409, 425, 429, 500, 502, 503, 504}


def _classify_http_status(status_code: int) -> str:
    if status_code in _TRANSIENT_HTTP_STATUSES:
        return "transient"
    return "permanent"


def _classify_exception(exc: BaseException) -> str:
    """Map a raw httpx/asyncio exception to transient vs permanent.

    Network blips, read timeouts, and connection resets are transient
    (the model itself is probably still healthy). Anything else falls
    through to "permanent" to avoid retry loops on misconfiguration.
    """
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError,
                        httpx.ReadError, httpx.WriteError, httpx.PoolTimeout,
                        httpx.RemoteProtocolError)):
        return "transient"
    if isinstance(exc, asyncio.TimeoutError):
        return "transient"
    return "permanent"


def _estimate_input_tokens(messages: list[dict[str, str]]) -> int:
    """Crude chars/4 token estimate matching context_budget's heuristic."""
    total = 0
    for m in messages:
        content = m.get("content") or ""
        total += max(1, len(content) // 4)
        total += 4  # per-message framing overhead
    return total


def _model_wants_thinking_multiplier(model: str) -> bool:
    mid = (model or "").lower()
    if any(mid.startswith(prefix) for prefix in _THINKING_MULTIPLIER_MODEL_PREFIXES):
        return True
    return any(hint in mid for hint in _THINKING_NAME_HINTS)


def _resolve_effective_max(
    model: str, requested: int, messages: list[dict[str, str]],
) -> tuple[int, int, int]:
    """Compute the actual max_tokens to send.

    The ×4 multiplier exists so thinking models can spend tokens on
    reasoning before producing the visible answer. On wide-window models
    (128K+) it costs nothing. On narrow-window models (e.g. Neon 8K) it
    can ask for more output tokens than the server will allow given the
    input. Cap it to the actual headroom.

    Returns (effective_max, input_estimate, window).
    """
    from app.services.context_budget import context_window_for

    window = context_window_for(model)
    input_estimate = _estimate_input_tokens(messages)
    headroom = max(_MIN_OUTPUT_TOKENS, window - input_estimate - _INPUT_SAFETY_MARGIN)
    multiplier = 4 if _model_wants_thinking_multiplier(model) else 1
    effective_max = max(_MIN_OUTPUT_TOKENS, min(requested * multiplier, headroom))
    return effective_max, input_estimate, window


def _get_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(timeout=45.0)
    return _shared_client


# Thinking-trace detection and stripping live in app.utils.sanitize so every
# code path (HANA, vLLM-direct, OpenAI-compat, summarizer inputs, credential
# inputs) uses the same logic. See backend/app/utils/sanitize.py.


async def openai_chat_completion(
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, str]],
    temperature: float = 0.7,
    max_tokens: int = 1024,
    timeout: float | None = None,
    on_text_delta: Any | None = None,
) -> dict[str, Any]:
    """Send a chat completion request to any OpenAI-compatible endpoint."""
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    needs_mct = any(model.startswith(prefix) for prefix in _MAX_COMPLETION_TOKEN_MODELS)
    skip_temp = any(model.startswith(prefix) for prefix in _NO_TEMPERATURE_MODELS)

    effective_max, input_estimate, window = _resolve_effective_max(
        model, max_tokens, messages,
    )
    mult = 4 if _model_wants_thinking_multiplier(model) else 1
    if effective_max < max_tokens * mult:
        LOG.info(
            "Capped max_tokens for %s: requested %d (x%d=%d), input ~=%d, "
            "window=%d, sending %d",
            model, max_tokens, mult, max_tokens * mult, input_estimate, window,
            effective_max,
        )
        # #region agent log
        try:
            import json as _json, time as _time
            with open(
                "/Users/pierceseigne/Desktop/10 Projects/CCAI-Demo-Pierce/.cursor/debug-62da73.log",
                "a", encoding="utf-8",
            ) as _f:
                _f.write(_json.dumps({
                    "sessionId": "62da73",
                    "runId": "pre-fix",
                    "hypothesisId": "C",
                    "location": "openai_compat.py:_resolve_effective_max",
                    "message": "max_tokens_capped",
                    "data": {
                        "model": model,
                        "requested": max_tokens,
                        "multiplier": mult,
                        "input_estimate": input_estimate,
                        "window": window,
                        "effective_max": effective_max,
                        "tight": effective_max <= 128,
                    },
                    "timestamp": int(_time.time() * 1000),
                }) + "\n")
        except Exception:
            pass
        # #endregion
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

    if on_text_delta is not None:
        body["stream"] = True
        try:
            parts: list[str] = []
            async with client.stream(
                "POST", url, json=body, headers=headers, timeout=req_timeout,
            ) as resp:
                if resp.status_code >= 400:
                    detail = (await resp.aread()).decode("utf-8", errors="replace")[:300]
                    return {
                        "response": f"[Error {resp.status_code}]: {detail}",
                        "elapsed_seconds": round(time.time() - t0, 2),
                        "model": model,
                        "error": True,
                        "error_kind": _classify_http_status(resp.status_code),
                        "error_status": resp.status_code,
                    }
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if payload == "[DONE]":
                        break
                    try:
                        chunk = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    choices = chunk.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta") or {}
                    piece = delta.get("content") or ""
                    if piece:
                        parts.append(piece)
                        on_text_delta(piece)
            text = strip_thinking("".join(parts))
            return {
                "response": text.strip(),
                "elapsed_seconds": round(time.time() - t0, 2),
                "model": model,
                "finish_reason": "stop",
            }
        except Exception as exc:
            LOG.exception("OpenAI-compat stream failed: %s", exc)
            return {
                "response": f"[Error]: {exc}",
                "elapsed_seconds": round(time.time() - t0, 2),
                "model": model,
                "error": True,
                "error_kind": _classify_exception(exc),
            }

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
                had_thinking = response_has_thinking(text, msg)
                text = strip_thinking(text)

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
            status = exc.response.status_code if exc.response is not None else 0
            LOG.error("OpenAI-compat %s error %s: %s", base_url, status, detail)
            return {
                "response": f"[Error {status}]: {detail}",
                "elapsed_seconds": round(elapsed, 2),
                "model": model,
                "error": True,
                "error_kind": _classify_http_status(status),
                "error_status": status,
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
                "error_kind": _classify_exception(exc),
            }


async def close_shared_client() -> None:
    global _shared_client
    if _shared_client and not _shared_client.is_closed:
        await _shared_client.aclose()
    _shared_client = None
