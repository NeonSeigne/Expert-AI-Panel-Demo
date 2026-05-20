from app.services.context_budget import (
    ContextSummary,
    DEFAULT_CONTEXT,
    DEFAULT_REPLY_BUDGET,
    SUMMARIZE_THRESHOLD,
    TRIM_THRESHOLD,
    build_compressed_messages,
    context_window_for,
    estimate_messages_tokens,
    select_summarizer_model_id,
    should_summarize,
)


def test_context_window_known_model():
    assert context_window_for("gpt-4.1-mini") == 128_000


def test_context_window_unknown_falls_back():
    assert context_window_for("totally-unknown") == DEFAULT_CONTEXT


def test_context_window_neon_falls_back():
    assert context_window_for("neon:Foo/Bar@2025.10.01:Researcher") == DEFAULT_CONTEXT


def test_estimate_tokens_grows_with_text():
    a = estimate_messages_tokens([{"role": "user", "content": "hi"}])
    b = estimate_messages_tokens([{"role": "user", "content": "hi" * 1000}])
    assert b > a


def test_should_summarize_below_threshold():
    """A small ~10-token prompt against a 1M-token gemini window: never
    should we trigger summarize.
    """
    summary = ContextSummary()
    api = [{"role": "user", "content": "hello"}]
    needs_sum, needs_trim, _ = should_summarize("gemini-2.5-flash", api, summary)
    assert needs_sum is False
    assert needs_trim is False


def test_should_summarize_above_threshold_triggers_summarize():
    summary = ContextSummary()
    big = "x" * 10_000  # ~2500 estimated tokens
    api = [
        {"role": "system", "content": big},
        {"role": "user", "content": big},
    ]
    # Small 8K-window model -> 6K input budget -> 55% = 3300; we're way over.
    needs_sum, _, budget = should_summarize("totally-unknown", api, summary)
    assert needs_sum is True
    assert budget >= 2_048


def test_should_trim_only_when_summary_exists():
    """Even at 70%, trim should only happen once we already have a
    running summary - otherwise we'd drop history with no replacement.
    """
    summary = ContextSummary()
    big = "x" * 30_000
    api = [
        {"role": "system", "content": big},
        {"role": "user", "content": big},
    ]
    _, needs_trim_no_sum, _ = should_summarize("totally-unknown", api, summary)
    assert needs_trim_no_sum is False

    summary.summary_text = "Previously, the group discussed X."
    _, needs_trim_yes_sum, _ = should_summarize("totally-unknown", api, summary)
    assert needs_trim_yes_sum is True


def test_build_compressed_keeps_system_and_recent():
    summary = ContextSummary(summary_text="condensed history")
    msgs = [
        {"role": "system", "content": "you are X"},
        {"role": "user", "content": "old1"},
        {"role": "assistant", "content": "oldA"},
        {"role": "user", "content": "old2"},
        {"role": "assistant", "content": "oldB"},
        {"role": "user", "content": "recent"},
    ]
    out = build_compressed_messages(msgs, summary, needs_trim=True)
    # head + summary + last KEEP_RECENT_MESSAGES (=6) <= len(msgs) so we
    # might end up with everything; the contract is just that the
    # original system and the running summary are preserved.
    assert out[0] == msgs[0]
    assert any("Summary of earlier" in m["content"] for m in out)


def test_select_summarizer_falls_back():
    # Override wins
    assert select_summarizer_model_id("custom", "orch") == "custom"
    # Falls back to orchestrator if no override
    assert select_summarizer_model_id(None, "orch") == "orch"
