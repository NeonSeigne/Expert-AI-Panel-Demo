"""Centralized sanitizer for LLM responses.

CCAI conversations don't work well when thinking traces leak into chat or
into orchestrator/summarizer/Credential-Summary inputs, so every LLM
response funnels through `strip_thinking` before being stored, displayed,
or forwarded to another LLM.
"""
from __future__ import annotations

import re

# Top-level reasoning blocks emitted as XML-ish tags. DOTALL so we catch
# multi-line reasoning blocks; non-greedy so adjacent blocks don't merge.
_THINK_TAG_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_REASONING_BLOCK_RE = re.compile(
    r"<(reasoning|reflection|inner_thoughts|scratchpad|analysis|plan)>.*?</\1>",
    re.DOTALL | re.IGNORECASE,
)

# Bare "thought:" / "reasoning:" prologues some models emit before content
# (only at the very start of the response, otherwise we'd nuke the body).
_PROLOGUE_RE = re.compile(
    r"^\s*(thought|thinking|reasoning|analysis|scratchpad)\s*:\s*"
    r".*?(?=\n\n|\Z)",
    re.DOTALL | re.IGNORECASE,
)

# Some providers wrap thinking in special framing tokens. We try to strip
# the *paired* form (open ... close) first so the body in between is
# removed, and fall back to stripping any leftover bare markers.
_PAIRED_FRAMING_RES = [
    re.compile(r"<\|reasoning\|>.*?<\|/reasoning\|>", re.DOTALL | re.IGNORECASE),
    re.compile(r"<\|think\|>.*?<\|/think\|>", re.DOTALL | re.IGNORECASE),
]
_FRAMING_TOKENS = ["<|reasoning|>", "<|/reasoning|>", "<|think|>", "<|/think|>"]


def strip_thinking(text: str | None) -> str:
    """Return `text` with all reasoning artifacts removed.

    Safe to call on empty, whitespace-only, or None inputs (returns empty
    string in those cases). Idempotent: calling twice yields the same result.
    """
    if not text:
        return ""

    out = _THINK_TAG_RE.sub("", text)
    out = _REASONING_BLOCK_RE.sub("", out)

    for paired in _PAIRED_FRAMING_RES:
        out = paired.sub("", out)
    for tok in _FRAMING_TOKENS:
        out = out.replace(tok, "")

    out = _PROLOGUE_RE.sub("", out)

    return out.strip()


def response_has_thinking(text: str | None, msg: dict | None = None) -> bool:
    """Return True if the raw response had any thinking artifact.

    Checks both the textual content and any `reasoning_content` /
    `reasoning` fields the OpenAI-compat client may have surfaced.
    """
    if msg is not None:
        if msg.get("reasoning_content") or msg.get("reasoning"):
            return True

    if not text:
        return False

    if _THINK_TAG_RE.search(text):
        return True
    if _REASONING_BLOCK_RE.search(text):
        return True
    if any(tok in text for tok in _FRAMING_TOKENS):
        return True
    if _PROLOGUE_RE.match(text):
        return True
    return False
