"""Verify the openai_compat client caps max_tokens to fit the model's
context window. Regression test for the BadRequestError observed when
Neon Security (8K window) was sent input ~6.5K + max_tokens 2400.
"""
from app.clients.openai_compat import _resolve_effective_max


def _msg(content: str) -> dict:
    return {"role": "user", "content": content}


def test_wide_window_keeps_x4_multiplier():
    # 128K-window model with tiny input: ×4 multiplier should pass
    # through untouched.
    effective, _input_est, window = _resolve_effective_max(
        "gpt-4o-mini", 600, [_msg("hello")],
    )
    assert window == 128_000
    assert effective == 600 * 4


def test_neon_security_8k_window_caps_to_headroom():
    # Reproduce the real failure: ~6500 input tokens, requested 600.
    # ×4 = 2400 would fail (8192 - 6500 - 128 = 1564 headroom).
    big_payload = "x" * (6500 * 4)  # ~6500 tokens via chars/4
    effective, input_est, window = _resolve_effective_max(
        "BrainForge/Security@2026.03.18", 600, [_msg(big_payload)],
    )
    assert window == 8_192
    assert input_est >= 6_400
    # Should be at most window - input - margin, never the raw 600 * 4.
    assert effective < 600 * 4
    assert effective + input_est + 128 <= window


def test_floor_when_input_swallows_window():
    # If input alone fills the window, we still send a minimum of 64
    # output tokens rather than 0 or negative.
    huge = "x" * (10_000 * 4)
    effective, _input, _window = _resolve_effective_max(
        "BrainForge/Security@2026.03.18", 600, [_msg(huge)],
    )
    assert effective >= 64


def test_unknown_neon_model_uses_default_window():
    effective, _input, window = _resolve_effective_max(
        "neon:BrainForge/Unknown@2026.01.01:Persona",
        100,
        [_msg("short input")],
    )
    assert window == 8_192
    assert effective == 100 * 4
