from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.clients.openai_compat import openai_chat_completion
from app.clients.hana_client import hana_client
from app.utils.sanitize import strip_thinking, response_has_thinking

LOG = logging.getLogger(__name__)

RACE_DELAY_SECONDS = 5.0

_FALLBACK_CHAIN = [
    "gemini-2.5-flash",
    "gpt-4.1-mini",
]


def _pick_fallback(exclude_model_id: str) -> dict | None:
    """Return the first usable fallback model that isn't the one we're already calling."""
    from app.config import settings

    for candidate_id in _FALLBACK_CHAIN:
        if candidate_id == exclude_model_id:
            continue
        resolved = settings.resolve_model(candidate_id)
        if resolved and not resolved.get("is_neon"):
            return resolved

    for prov in settings.providers:
        for m in prov["models"]:
            if m["id"] == exclude_model_id:
                continue
            resolved = settings.resolve_model(m["id"])
            if resolved and not resolved.get("is_neon"):
                return resolved
    return None


async def chat_completion(
    resolved: dict,
    messages: list[dict[str, str]],
    temperature: float = 0.7,
    max_tokens: int = 1024,
    timeout: float | None = None,
    on_text_delta: Any | None = None,
) -> dict[str, Any]:
    """Unified LLM call that routes Neon models through HANA and others through OpenAI-compat."""
    if resolved.get("is_neon"):
        return await _call_hana(resolved, messages, temperature, max_tokens)

    # Streaming uses a single request path (no model racing).
    if on_text_delta is not None:
        return await _plain_openai(
            resolved, messages, temperature, max_tokens, timeout,
            on_text_delta=on_text_delta,
        )

    from app.config import settings
    if settings.speed_priority:
        return await _racing_openai(resolved, messages, temperature, max_tokens, timeout)

    return await _plain_openai(resolved, messages, temperature, max_tokens, timeout)


async def _plain_openai(
    resolved: dict,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
    timeout: float | None,
    on_text_delta: Any | None = None,
) -> dict[str, Any]:
    return await openai_chat_completion(
        base_url=resolved["base_url"],
        api_key=resolved["api_key"],
        model=resolved["model_id"],
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=timeout,
        on_text_delta=on_text_delta,
    )


async def _racing_openai(
    resolved: dict,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
    timeout: float | None,
) -> dict[str, Any]:
    """Start the primary request; after RACE_DELAY_SECONDS fire a fallback and race them."""
    primary_task = asyncio.create_task(
        _plain_openai(resolved, messages, temperature, max_tokens, timeout),
        name=f"primary:{resolved['model_id']}",
    )

    done, _ = await asyncio.wait({primary_task}, timeout=RACE_DELAY_SECONDS)
    if done:
        return primary_task.result()

    fallback_resolved = _pick_fallback(resolved["model_id"])
    if not fallback_resolved:
        LOG.info("Speed-priority: no fallback available, waiting for primary %s", resolved["model_id"])
        return await primary_task

    LOG.info(
        "Speed-priority: %s still pending after %.1fs — racing with fallback %s",
        resolved["model_id"], RACE_DELAY_SECONDS, fallback_resolved["model_id"],
    )
    fallback_task = asyncio.create_task(
        _plain_openai(fallback_resolved, messages, temperature, max_tokens, timeout),
        name=f"fallback:{fallback_resolved['model_id']}",
    )

    done, pending = await asyncio.wait(
        {primary_task, fallback_task}, return_when=asyncio.FIRST_COMPLETED,
    )
    winner = done.pop()
    result = winner.result()

    if result.get("error"):
        if pending:
            other = pending.pop()
            try:
                other_result = await other
                if not other_result.get("error"):
                    LOG.info("Speed-priority: winner had error, using other result")
                    return other_result
            except Exception:
                pass
        return result

    for task in pending:
        task.cancel()

    used_model = result.get("model", "")
    if winner is fallback_task:
        LOG.info("Speed-priority: fallback %s won the race", used_model)
        result["used_fallback"] = True
        result["original_model"] = resolved["model_id"]
    else:
        LOG.info("Speed-priority: primary %s won the race", used_model)

    return result


async def _call_neon_direct_vllm(
    resolved: dict,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
) -> dict[str, Any]:
    """BrainForge/Security on 4090-x1-3: OpenAI-compatible vLLM; still use HANA persona base when cached."""
    builtin_sp = hana_client.get_persona_system_prompt(
        resolved["hana_model_id"], resolved["persona_name"]
    )
    msgs = [dict(m) for m in messages]
    if builtin_sp:
        # #region agent log
        try:
            import json as _json, time as _time
            from app.services.context_budget import estimate_messages_tokens, context_window_for
            _est_pre = estimate_messages_tokens(msgs)
            with open(
                "/Users/pierceseigne/Desktop/10 Projects/CCAI-Demo-Pierce/.cursor/debug-62da73.log",
                "a", encoding="utf-8",
            ) as _f:
                _f.write(_json.dumps({
                    "sessionId": "62da73",
                    "runId": "pre-fix",
                    "hypothesisId": "B",
                    "location": "llm_router.py:_call_neon_direct_vllm",
                    "message": "hana_persona_base_prepend",
                    "data": {
                        "model_id": resolved.get("model_id"),
                        "persona_name": resolved.get("persona_name"),
                        "builtin_sp_chars": len(builtin_sp),
                        "est_before_prepend": _est_pre,
                        "window": context_window_for(resolved.get("model_id") or ""),
                    },
                    "timestamp": int(_time.time() * 1000),
                }) + "\n")
        except Exception:
            pass
        # #endregion
        if msgs and msgs[0].get("role") == "system":
            msgs[0] = {
                "role": "system",
                "content": msgs[0]["content"] + "\n\n[Neon persona base from HANA]\n" + builtin_sp,
            }
        else:
            msgs.insert(0, {"role": "system", "content": "[Neon persona base from HANA]\n" + builtin_sp})

    result = await openai_chat_completion(
        base_url=resolved["vllm_base_url"],
        api_key=resolved["vllm_api_key"],
        model=resolved["hana_model_id"],
        messages=msgs,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return {
        "response": strip_thinking(result.get("response", "")),
        "elapsed_seconds": result.get("elapsed_seconds", 0),
        "model": resolved["model_id"],
        "error": result.get("error", False),
        "error_kind": result.get("error_kind", ""),
        "error_status": result.get("error_status"),
    }


async def _call_hana(
    resolved: dict,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
) -> dict[str, Any]:
    if resolved.get("neon_direct_vllm"):
        return await _call_neon_direct_vllm(resolved, messages, temperature, max_tokens)

    system_context = ""
    query = ""
    history: list[tuple[str, str]] = []

    for msg in messages:
        if msg["role"] == "system":
            system_context = msg["content"]
        elif msg["role"] == "user":
            query = msg["content"]
        elif msg["role"] == "assistant":
            history.append(("assistant", msg["content"]))

    if system_context:
        query = f"[Context: {system_context}]\n\n{query}"

    builtin_sp = hana_client.get_persona_system_prompt(
        resolved["hana_model_id"], resolved["persona_name"]
    )

    try:
        result = await hana_client.get_inference(
            query=query,
            model_id=resolved["hana_model_id"],
            persona_name=resolved["persona_name"],
            system_prompt=builtin_sp,
            history=history if history else None,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        raw = result.get("response", "")
        cleaned = strip_thinking(raw)
        if response_has_thinking(raw):
            LOG.info("Stripped thinking content from HANA %s response", resolved["model_id"])
        return {
            "response": cleaned,
            "elapsed_seconds": result.get("elapsed_seconds", 0),
            "model": resolved["model_id"],
        }
    except Exception as exc:
        LOG.exception("HANA inference failed for %s: %s", resolved["model_id"], exc)
        # HANA failures are conservatively classified as "transient"
        # because HANA itself doesn't surface a stable error taxonomy
        # and most observed failures here have been timeouts or
        # backend-unavailable, both of which are worth a same-model
        # retry before the orchestrator decides to substitute.
        return {
            "response": f"[Error]: {exc}",
            "elapsed_seconds": 0,
            "model": resolved["model_id"],
            "error": True,
            "error_kind": "transient",
        }
