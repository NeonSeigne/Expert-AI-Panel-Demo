"""Tests for the user-tunable repetition / failsafe limits exposed via
`ConversationLimits` and the `/api/chat/limits/defaults` endpoint.

These guard:
- defaults match the historical hard-coded values (no behavior change
  for anyone who doesn't touch the new settings);
- clamping silently coerces missing / out-of-range / non-int values
  back to the per-field defaults rather than raising;
- the defaults endpoint returns parallel `defaults` / `bounds` /
  `descriptions` maps with the same field names so the frontend can
  zip them into UI rows.
"""
from fastapi.testclient import TestClient

from app.main import app
from app.services.models import (
    CONVERSATION_LIMIT_BOUNDS,
    CONVERSATION_LIMIT_DESCRIPTIONS,
    ConversationLimits,
    clamp_conversation_limits,
)


# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

def test_defaults_match_historical_hardcoded_values():
    """If anyone changes a default by accident, this test makes them
    think twice. The values here are the ones the orchestrator used
    before this knobs-as-settings refactor."""
    limits = ConversationLimits()
    assert limits.critique_rounds == 2
    assert limits.status_assessment_max == 3
    assert limits.consensus_turns_per_participant == 6
    assert limits.dyad_cap == 2
    assert limits.stall_recovery_attempts == 1
    assert limits.auto_disable_failures == 3
    assert limits.participant_message_pause_at == 60
    assert limits.participant_message_pause_inc == 20
    assert limits.orchestrator_call_pause_at == 100
    assert limits.orchestrator_call_pause_inc == 50


def test_bounds_cover_every_dataclass_field():
    """Every tunable field needs a (min, max) bound; otherwise the
    clamp helper would silently leave it unprotected."""
    field_names = set(ConversationLimits().__dict__.keys())
    bound_names = set(CONVERSATION_LIMIT_BOUNDS.keys())
    assert field_names == bound_names


def test_descriptions_cover_every_dataclass_field():
    """The settings UI is server-driven; if a field has no description
    block, the modal would render an empty row for it."""
    field_names = set(ConversationLimits().__dict__.keys())
    described = set(CONVERSATION_LIMIT_DESCRIPTIONS.keys())
    assert field_names == described
    for entry in CONVERSATION_LIMIT_DESCRIPTIONS.values():
        assert "group" in entry
        assert "label" in entry
        assert "help" in entry


# ---------------------------------------------------------------------------
# clamp_conversation_limits
# ---------------------------------------------------------------------------

def test_clamp_returns_defaults_for_none_or_empty():
    assert clamp_conversation_limits(None) == ConversationLimits()
    assert clamp_conversation_limits({}) == ConversationLimits()


def test_clamp_clamps_too_large_values():
    """A value above the field's upper bound is coerced to the upper
    bound, not rejected. This keeps the API permissive."""
    out = clamp_conversation_limits({"critique_rounds": 99})
    assert out.critique_rounds == CONVERSATION_LIMIT_BOUNDS["critique_rounds"][1]


def test_clamp_clamps_too_small_values():
    out = clamp_conversation_limits({"critique_rounds": -10})
    assert out.critique_rounds == CONVERSATION_LIMIT_BOUNDS["critique_rounds"][0]


def test_clamp_ignores_unknown_fields():
    out = clamp_conversation_limits({"there_is_no_such_field": 7})
    assert out == ConversationLimits()


def test_clamp_silently_drops_non_int_values():
    """Stringy garbage that can't be coerced should fall back to the
    default for that one field, not raise."""
    out = clamp_conversation_limits({"critique_rounds": "not-a-number"})
    assert out.critique_rounds == ConversationLimits().critique_rounds


def test_clamp_preserves_partial_overrides():
    """Only-some-fields-supplied is the common case (UI sends just
    the overridden ones)."""
    out = clamp_conversation_limits({"dyad_cap": 4})
    assert out.dyad_cap == 4
    # All other fields untouched.
    base = ConversationLimits()
    for field_name in CONVERSATION_LIMIT_BOUNDS.keys():
        if field_name == "dyad_cap":
            continue
        assert getattr(out, field_name) == getattr(base, field_name)


def test_clamp_accepts_string_ints():
    """JSON sometimes serializes numbers as strings - we should not
    refuse a perfectly valid int just because it arrived as '4'."""
    out = clamp_conversation_limits({"dyad_cap": "4"})
    assert out.dyad_cap == 4


# ---------------------------------------------------------------------------
# /api/chat/limits/defaults endpoint
# ---------------------------------------------------------------------------

def test_limits_defaults_endpoint_returns_parallel_maps():
    client = TestClient(app)
    resp = client.get("/api/chat/limits/defaults")
    assert resp.status_code == 200
    body = resp.json()

    assert set(body.keys()) == {"defaults", "bounds", "descriptions"}

    # All three maps should agree on the same field set so the
    # frontend can zip them per row.
    field_names = set(ConversationLimits().__dict__.keys())
    assert set(body["defaults"].keys()) == field_names
    assert set(body["bounds"].keys()) == field_names
    assert set(body["descriptions"].keys()) == field_names

    # Bounds shape sanity-check.
    for field_name, bound in body["bounds"].items():
        assert "min" in bound and "max" in bound
        assert bound["min"] < bound["max"]
        assert bound["min"] <= body["defaults"][field_name] <= bound["max"]
