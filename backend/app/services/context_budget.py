"""Per-participant context budgeting with on-demand summarization.

Ported from the Ask-A-Neon-LLM-Demos AskJerry pattern: estimate input
tokens with chars/4, trigger a background summarize at 55% of the model's
input budget, and once a summary exists trim history aggressively at
70%. The summarizer model defaults to whichever model is selected as the
Orchestrator (so changing one auto-changes the other) and is overridable
in the settings menu.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from app.clients.llm_router import chat_completion
from app.config import settings
from app.utils.sanitize import strip_thinking

LOG = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Per-model context windows (input + output tokens)
# ---------------------------------------------------------------------------
#
# Lookup precedence: exact model_id match -> prefix match -> fallback.
# Numbers are deliberately conservative (real windows often advertise a
# bigger absolute max but degrade well before that).
DEFAULT_CONTEXT = 8_192

EXACT_CONTEXT: dict[str, int] = {
    "gpt-5.4": 200_000,
    "gpt-4.1": 128_000,
    "gpt-4.1-mini": 128_000,
    "gpt-4o": 128_000,
    "gpt-4o-mini": 128_000,
    "o4-mini": 128_000,
    "gemini-2.0-flash": 1_000_000,
    "gemini-2.5-flash": 1_000_000,
    "gemini-2.5-pro": 1_000_000,
    "mistral-small-2506": 131_000,
    "mistral-small-2603": 131_000,
    "devstral-2512": 131_000,
    "meta-llama/Llama-3.3-70B-Instruct-Turbo": 128_000,
    "meta-llama/Meta-Llama-3-8B-Instruct-Lite": 8_192,
    "Qwen/Qwen3-VL-8B-Instruct": 32_000,
}

PREFIX_CONTEXT: list[tuple[str, int]] = [
    ("accounts/fireworks/models/kimi-", 256_000),
    ("accounts/fireworks/models/deepseek-", 128_000),
    ("accounts/fireworks/models/gpt-oss-", 128_000),
    ("openai/gpt-oss-", 128_000),
]


def context_window_for(model_id: str) -> int:
    """Return the configured input+output token window for a model.

    BrainForge / unknown Neon models fall back to DEFAULT_CONTEXT (8K).
    """
    if model_id in EXACT_CONTEXT:
        return EXACT_CONTEXT[model_id]
    for prefix, window in PREFIX_CONTEXT:
        if model_id.startswith(prefix):
            return window
    if model_id.startswith("neon:"):
        return DEFAULT_CONTEXT
    return DEFAULT_CONTEXT


# Reserve at least this many tokens for the model's reply.
DEFAULT_REPLY_BUDGET = 2_048

# Trigger a summarize when input estimate >= SUMMARIZE_THRESHOLD * input_budget.
SUMMARIZE_THRESHOLD = 0.55
# When a summary exists and history still over-fills, trim to last K rounds.
TRIM_THRESHOLD = 0.70
# How many of the most recent messages to keep when trimming.
KEEP_RECENT_MESSAGES = 6


# ---------------------------------------------------------------------------
# Per-participant summary state
# ---------------------------------------------------------------------------

@dataclass
class ContextSummary:
    """Running summary for a single participant.

    `summary_text` is the latest condensed summary; `summarized_through_idx`
    is the index of the last message included in that summary so we don't
    re-summarize old history every turn.
    """

    summary_text: str = ""
    summarized_through_idx: int = -1
    last_estimate: int = 0

    def is_active(self) -> bool:
        return bool(self.summary_text.strip())


# ---------------------------------------------------------------------------
# Token estimator (chars/4, no real tokenizer)
# ---------------------------------------------------------------------------

def _estimate_str_tokens(text: str | None) -> int:
    if not text:
        return 1
    return max(1, len(text) // 4)


def estimate_messages_tokens(messages: list[dict[str, Any]]) -> int:
    total = 0
    for m in messages:
        total += _estimate_str_tokens(m.get("content"))
        total += 4  # per-message framing overhead
    return total


# ---------------------------------------------------------------------------
# Decision: does this participant need a summarize/trim?
# ---------------------------------------------------------------------------

def should_summarize(
    model_id: str,
    api_messages: list[dict[str, Any]],
    summary: ContextSummary,
) -> tuple[bool, bool, int]:
    """Return (should_summarize, should_trim, input_budget).

    `should_summarize` is True when raw input tokens >= 55% of the input
    budget. `should_trim` is True when the budget is so tight (>= 70%)
    that we should drop older messages and rely on the running summary.
    """
    window = context_window_for(model_id)
    input_budget = max(2_048, window - DEFAULT_REPLY_BUDGET)
    est = estimate_messages_tokens(api_messages)
    summary.last_estimate = est
    return (
        est >= input_budget * SUMMARIZE_THRESHOLD,
        est >= input_budget * TRIM_THRESHOLD and summary.is_active(),
        input_budget,
    )


# ---------------------------------------------------------------------------
# Build the actual outbound message list for a participant turn
# ---------------------------------------------------------------------------

def build_compressed_messages(
    api_messages: list[dict[str, Any]],
    summary: ContextSummary,
    needs_trim: bool,
) -> list[dict[str, Any]]:
    """If we need to trim, replace older messages with a system-summary message.

    The first message is assumed to be the system prompt for the participant
    and is always preserved. Every other message older than the last
    KEEP_RECENT_MESSAGES is dropped in favor of the running summary.
    """
    if not needs_trim or not api_messages:
        return api_messages

    head = api_messages[:1]  # original system prompt
    tail = api_messages[-KEEP_RECENT_MESSAGES:]
    summary_msg = {
        "role": "system",
        "content": (
            "Summary of earlier discussion (auto-condensed for context):\n"
            + summary.summary_text
        ),
    }
    return head + [summary_msg] + tail


# ---------------------------------------------------------------------------
# Compress transcript embedded inside a single user prompt (CCAI pattern)
# ---------------------------------------------------------------------------
#
# Phase prompts bake the full transcript into one user message, e.g.
# "Conversation so far:\n{transcript}\n\nIn 4-8 sentences:…". The AskJerry
# multi-message trim path never fires because api_messages only has
# [system, user]. These helpers swap the transcript body for summary+tail.

_TRANSCRIPT_HEADERS: tuple[str, ...] = (
    "Conversation so far:\n",
    "Full conversation so far:\n",
    "Full transcript:\n",
    "Full conversation:\n",
)

# Section headers that typically follow the transcript block in phase prompts.
_TRANSCRIPT_FOOTERS: tuple[str, ...] = (
    "\n\nOpen threads",
    "\n\nIn ",
    "\n\nFIRST",
    "\n\nThe orchestrator",
    "\n\nRight now",
    "\n\nPhase ",
    "\n\nQuestion:\n",
    "\n\nCredential Summary:\n",
    "\n\nBelow is",
    "\n\nTargeted question:\n",
)


def replace_embedded_transcript(user_prompt: str, new_transcript: str) -> str:
    """Replace the transcript body inside a phase prompt, if a known header exists."""
    for header in _TRANSCRIPT_HEADERS:
        idx = user_prompt.find(header)
        if idx < 0:
            continue
        start = idx + len(header)
        rest = user_prompt[start:]
        end = len(rest)
        for footer in _TRANSCRIPT_FOOTERS:
            pos = rest.find(footer)
            if pos >= 0:
                end = min(end, pos)
        return user_prompt[:start] + new_transcript + rest[end:]
    return user_prompt


def build_compressed_transcript_block(
    summary: ContextSummary,
    recent_transcript: str,
) -> str:
    """AskJerry-style block: running summary + recent tail."""
    recent = (recent_transcript or "").strip()
    if summary.is_active():
        body = (
            "[Earlier discussion summary]\n"
            + summary.summary_text.strip()
        )
        if recent:
            body += "\n\n[Recent messages]\n" + recent
        return body
    if recent:
        return "[Recent messages — auto-trimmed for context]\n" + recent
    return ""


def cap_max_tokens_for_window(
    model_id: str,
    api_messages: list[dict[str, Any]],
    requested_max_tokens: int,
) -> int:
    """Shrink reply budget so input + output fits the model window (AskJerry)."""
    window = context_window_for(model_id)
    est = estimate_messages_tokens(api_messages)
    headroom = window - est - 64
    if headroom < 256:
        return max(64, min(requested_max_tokens, headroom))
    return min(requested_max_tokens, headroom)


# ---------------------------------------------------------------------------
# Run a summarize call against the configured summarizer model
# ---------------------------------------------------------------------------

SUMMARIZER_SYSTEM_PROMPT = (
    "You are a concise discussion summarizer. Condense the following multi-"
    "participant conversation into a tight summary that preserves: who said "
    "what (by name), the key positions taken, agreements and disagreements, "
    "any open questions, and the overall direction. Keep the summary under "
    "300 words. Write in third-person narrative. Do not editorialize, vote, "
    "or take a side. Output only the summary text — no preamble, no "
    "reasoning, no meta-commentary."
)


async def run_summarize(
    summarizer_model_id: str,
    transcript_text: str,
    timeout: float = 30.0,
) -> str:
    """Call the summarizer model on a plain-text transcript and return the summary.

    Empty / failed summaries return an empty string so callers can fall back
    gracefully.
    """
    if not transcript_text.strip():
        return ""

    resolved = settings.resolve_model(summarizer_model_id)
    if not resolved:
        LOG.warning("Summarizer model %s not resolvable, skipping summarize", summarizer_model_id)
        return ""

    messages = [
        {"role": "system", "content": SUMMARIZER_SYSTEM_PROMPT},
        {"role": "user", "content": transcript_text},
    ]
    result = await chat_completion(
        resolved=resolved,
        messages=messages,
        temperature=0.2,
        max_tokens=512,
        timeout=timeout,
    )
    if result.get("error"):
        LOG.warning("Summarizer call failed: %s", result.get("response"))
        return ""
    # Defense-in-depth: even if a summarizer model emitted reasoning,
    # never let it leak into participant context.
    return strip_thinking(result.get("response", ""))


def select_summarizer_model_id(
    summarizer_override: str | None,
    orchestrator_model_id: str | None,
) -> str:
    """Resolve the summarizer model id to use, with the rule from the plan:

    - explicit override wins
    - else fall back to whatever model is selected as the Orchestrator
    - else fall back to the global settings default
    """
    if summarizer_override:
        return summarizer_override
    if orchestrator_model_id:
        return orchestrator_model_id
    return settings.orchestrator_model
