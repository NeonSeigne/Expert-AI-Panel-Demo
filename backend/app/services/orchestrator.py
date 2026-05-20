from __future__ import annotations

import json
import logging
import random
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, AsyncIterator

from app.clients.openai_compat import openai_chat_completion
from app.clients.llm_router import chat_completion as unified_chat_completion
from app.config import settings

LOG = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

_BREVITY = (
    " Keep your reply short — 2-4 sentences, like a casual chat message, not an email or essay."
)

AUTO_START_PROMPT = (
    "You're starting a conversation with someone new. Here is some information about them: "
    "{other_role}\n\n"
    "Consider connections between this information and what you know about yourself, and say "
    "something that could start a conversation with that new person. Speak in the first person, "
    "as if directly to the other person." + _BREVITY
)

FIRST_REPLY_PROMPT = (
    "Someone just started a conversation with you, this is what they said: {last_message}\n\n"
    "Consider connections between this conversation starter and what you know about yourself, "
    "and say something that could continue the conversation with that new person. Speak in the "
    "first person, as if directly to the other person." + _BREVITY
)

CONTINUE_PROMPT = (
    "You are having a conversation with another person, here is the conversation so far:\n\n"
    "{history}\n\n"
    "Consider how human conversations generally progress, and provide a response. If the last "
    "reply in the conversation is one which might indicate a human is losing interest in or "
    "wrapping up the conversation, then make a response which will help wrap up and close the "
    "conversation." + _BREVITY
)

WINDING_NEXT_PROMPT = (
    "You are having a conversation with another person, here is the conversation so far:\n\n"
    "{history}\n\n"
    "Consider how human conversations generally progress, and provide a response which will "
    "wrap up and close the conversation. This is the last reply you will give in this "
    "conversation." + _BREVITY
)

WINDING_FINAL_PROMPT = (
    "You are having a conversation with another person, here is the conversation so far:\n\n"
    "{history}\n\n"
    "Consider how human conversations generally progress, and focus on the last two messages "
    "in this conversation. Provide a very short response which closes the conversation."
    + _BREVITY
)

ORCHESTRATOR_CHECK_PROMPT = (
    "You are monitoring a conversation between two people. Your job is to determine whether "
    "the latest message indicates the speaker is losing interest or wrapping up the conversation. "
    "Reply with ONLY a JSON object: {{\"winding_down\": true}} or {{\"winding_down\": false}}. "
    "No other text.\n\nLatest message:\n{message}"
)


# ---------------------------------------------------------------------------
# Session data
# ---------------------------------------------------------------------------

@dataclass
class Persona:
    name: str
    model_id: str
    role_prompt: str
    base_url: str = ""
    api_key: str = ""
    display_name: str = ""
    is_neon: bool = False
    hana_model_id: str = ""
    persona_name: str = ""
    neon_direct_vllm: bool = False
    vllm_base_url: str = ""
    vllm_api_key: str = ""


@dataclass
class Session:
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    persona_a: Persona | None = None
    persona_b: Persona | None = None
    messages: list[dict[str, str]] = field(default_factory=list)
    api_log: list[dict[str, Any]] = field(default_factory=list)
    a_count: int = 0
    b_count: int = 0
    end_mode: bool = False
    finished: bool = False


_sessions: dict[str, Session] = {}


def get_session(sid: str) -> Session | None:
    return _sessions.get(sid)


def create_session() -> Session:
    s = Session()
    _sessions[s.session_id] = s
    return s


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _format_history(messages: list[dict[str, str]]) -> str:
    lines = []
    for m in messages:
        lines.append(f"{m['speaker']}: {m['text']}")
    return "\n".join(lines)


async def _call_llm(
    persona: Persona,
    system_content: str,
    user_content: str,
    session: Session,
    label: str = "",
    max_tokens: int = 500,
    timeout: float = 20,
) -> str:
    system_with_directive = (
        system_content + "\n\nIMPORTANT: Respond ONLY with your in-character dialogue. "
        "Do NOT include your reasoning, thought process, analysis of the prompt, "
        "meta-commentary, internal monologue, or draft notes. Output ONLY the words "
        "your character would actually say aloud."
    )
    messages = [
        {"role": "system", "content": system_with_directive},
        {"role": "user", "content": user_content},
    ]
    log_entry: dict[str, Any] = {
        "timestamp": time.time(),
        "label": label,
        "model": persona.model_id,
        "request": {"messages": messages, "max_tokens": max_tokens},
    }

    resolved = {
        "model_id": persona.model_id,
        "base_url": persona.base_url,
        "api_key": persona.api_key,
        "is_neon": persona.is_neon,
        "hana_model_id": persona.hana_model_id,
        "persona_name": persona.persona_name,
        "neon_direct_vllm": persona.neon_direct_vllm,
        "vllm_base_url": persona.vllm_base_url,
        "vllm_api_key": persona.vllm_api_key,
    }
    result = await unified_chat_completion(
        resolved=resolved,
        messages=messages,
        temperature=0.7,
        max_tokens=max_tokens,
        timeout=timeout,
    )

    log_entry["response"] = result
    session.api_log.append(log_entry)

    return result.get("response", ""), result.get("elapsed_seconds", 0)


async def _call_orchestrator(
    prompt: str,
    session: Session,
    label: str = "",
) -> str:
    resolved = settings.resolve_model(settings.orchestrator_model)
    if not resolved:
        LOG.warning("Orchestrator model %s not found, using first available", settings.orchestrator_model)
        for prov in settings.providers:
            for m in prov["models"]:
                resolved = {
                    "base_url": m.get("base_url", prov["base_url"]),
                    "api_key": m.get("api_key", prov["api_key"]),
                    "model_id": m["id"],
                }
                break
            if resolved:
                break

    if not resolved:
        return '{"winding_down": false}'

    messages = [
        {"role": "system", "content": "You are a conversation monitor. Respond only with the requested JSON."},
        {"role": "user", "content": prompt},
    ]
    log_entry: dict[str, Any] = {
        "timestamp": time.time(),
        "label": f"orchestrator:{label}",
        "model": resolved["model_id"],
        "request": {"messages": messages},
    }

    result = await openai_chat_completion(
        base_url=resolved["base_url"],
        api_key=resolved["api_key"],
        model=resolved["model_id"],
        messages=messages,
        temperature=0.2,
        max_tokens=256,
        timeout=20,
    )

    log_entry["response"] = result
    session.api_log.append(log_entry)

    return result.get("response", "")


def _parse_json_bool(raw: str, key: str) -> bool:
    try:
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0]
        return json.loads(raw).get(key, False)
    except Exception:
        lower = raw.lower()
        return f'"{key}": true' in lower or f'"{key}":true' in lower


# ---------------------------------------------------------------------------
# Main conversation loop (yields SSE events)
# ---------------------------------------------------------------------------

async def run_conversation(
    session: Session,
    starter_text: str | None = None,
) -> AsyncIterator[str]:
    pa = session.persona_a
    pb = session.persona_b
    if not pa or not pb:
        yield _sse("error", {"message": "Both personas must be configured"})
        return

    participants = [pa, pb]
    starter_idx = random.randint(0, 1)
    starter = participants[starter_idx]
    responder = participants[1 - starter_idx]

    yield _sse("status", {"message": "Starting conversation..."})

    # --- First message ---
    if starter_text:
        # Show the user-provided starter as the first message from the starter LLM,
        # then send it to the responder to reply to (no LLM call for the opener).
        _add_message(session, starter, starter_text.strip(), starter_idx)
        yield _sse("message", _msg_payload(session.messages[-1], starter_idx))

        reply_prompt = FIRST_REPLY_PROMPT.format(last_message=starter_text.strip())
        second_msg, second_elapsed = await _call_llm(
            responder, responder.role_prompt, reply_prompt, session,
            label=f"first_reply:{responder.name}",
        )
        _add_message(session, responder, second_msg, 1 - starter_idx, second_elapsed)
        yield _sse("message", _msg_payload(session.messages[-1], 1 - starter_idx))
    else:
        user_prompt = AUTO_START_PROMPT.format(other_role=responder.role_prompt)
        first_msg, first_elapsed = await _call_llm(
            starter, starter.role_prompt, user_prompt, session,
            label=f"start:{starter.name}",
        )
        _add_message(session, starter, first_msg, starter_idx, first_elapsed)
        yield _sse("message", _msg_payload(session.messages[-1], starter_idx))

        reply_prompt = FIRST_REPLY_PROMPT.format(last_message=first_msg)
        second_msg, second_elapsed = await _call_llm(
            responder, responder.role_prompt, reply_prompt, session,
            label=f"first_reply:{responder.name}",
        )
        _add_message(session, responder, second_msg, 1 - starter_idx, second_elapsed)
        yield _sse("message", _msg_payload(session.messages[-1], 1 - starter_idx))

    # --- Continue loop ---
    current_idx = starter_idx
    while not session.finished:
        current = participants[current_idx]
        history_text = _format_history(session.messages)

        # Check orchestrator on the last message
        last_msg_text = session.messages[-1]["text"]

        if not session.end_mode:
            orch_raw = await _call_orchestrator(
                ORCHESTRATOR_CHECK_PROMPT.format(message=last_msg_text),
                session,
                label="winding_check",
            )
            winding = _parse_json_bool(orch_raw, "winding_down")

            if winding:
                session.end_mode = True

        # Force wrap-up at 8 messages each
        if not session.end_mode:
            if session.a_count >= 8 and session.b_count >= 8:
                session.end_mode = True

        if session.end_mode:
            # Penultimate message: current speaker wraps up
            history_text = _format_history(session.messages)
            wrap_msg, wrap_elapsed = await _call_llm(
                current, current.role_prompt,
                WINDING_NEXT_PROMPT.format(history=history_text),
                session, label=f"winding_next:{current.name}",
            )
            _add_message(session, current, wrap_msg, current_idx, wrap_elapsed)
            yield _sse("message", _msg_payload(session.messages[-1], current_idx))

            # Final message: other speaker closes
            other_idx = 1 - current_idx
            other = participants[other_idx]
            history_text = _format_history(session.messages)
            final_msg, final_elapsed = await _call_llm(
                other, other.role_prompt,
                WINDING_FINAL_PROMPT.format(history=history_text),
                session, label=f"winding_final:{other.name}",
            )
            _add_message(session, other, final_msg, other_idx, final_elapsed)
            yield _sse("message", _msg_payload(session.messages[-1], other_idx))

            session.finished = True
            yield _sse("system", {"text": "End of Chat"})
            break

        # Normal continue
        prompt = CONTINUE_PROMPT.format(history=history_text)
        response, resp_elapsed = await _call_llm(
            current, current.role_prompt, prompt, session,
            label=f"continue:{current.name}",
        )
        _add_message(session, current, response, current_idx, resp_elapsed)
        yield _sse("message", _msg_payload(session.messages[-1], current_idx))

        current_idx = 1 - current_idx

    yield _sse("done", {})


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------

def _add_message(session: Session, persona: Persona, text: str, speaker_idx: int, elapsed: float = 0) -> None:
    session.messages.append({
        "speaker": persona.name,
        "speaker_idx": speaker_idx,
        "model_id": persona.model_id,
        "model_display": persona.display_name,
        "text": text,
        "timestamp": time.time(),
        "elapsed_seconds": round(elapsed, 2),
    })
    if speaker_idx == 0:
        session.a_count += 1
    else:
        session.b_count += 1


def _msg_payload(msg: dict, speaker_idx: int) -> dict:
    return {
        "speaker": msg["speaker"],
        "speaker_idx": speaker_idx,
        "model_display": msg["model_display"],
        "text": msg["text"],
        "timestamp": msg["timestamp"],
        "elapsed_seconds": msg.get("elapsed_seconds", 0),
    }


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"
