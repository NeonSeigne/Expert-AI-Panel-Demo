"""Tests for neutral general-purpose model selection."""
from unittest.mock import patch

from app.services.model_picker import (
    is_neon_character_model_id,
    is_vanilla_neon_model_id,
    pick_general_purpose_model,
)


def test_is_neon_character_model_id():
    assert is_neon_character_model_id("neon:BrainForge/X@1:vanilla")
    assert not is_neon_character_model_id("gpt-4o-mini")


def test_is_vanilla_neon_model_id():
    assert is_vanilla_neon_model_id("neon:BrainForge/X@1:vanilla")
    assert not is_vanilla_neon_model_id("neon:BrainForge/X@1:NucleotidingsAI")


def test_pick_prefers_non_neon_orchestrator():
    with patch("app.services.model_picker.settings") as mock_settings:
        mock_settings.orchestrator_model = "gpt-4o-mini"
        mock_settings.providers = []
        mock_settings.resolve_model.side_effect = lambda mid: (
            {"model_id": mid} if mid == "gpt-4o-mini" else None
        )
        assert pick_general_purpose_model() == "gpt-4o-mini"


def test_pick_provider_when_orchestrator_unresolvable():
    with patch("app.services.model_picker.settings") as mock_settings:
        mock_settings.orchestrator_model = "gpt-4o-mini"
        mock_settings.providers = [{
            "models": [{"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash"}],
        }]
        mock_settings.resolve_model.side_effect = lambda mid: (
            {"model_id": mid} if mid == "gemini-2.0-flash" else None
        )
        assert pick_general_purpose_model() == "gemini-2.0-flash"


def test_pick_vanilla_before_named_neon_character():
    vanilla = "neon:BrainForge/NucleotidingsLLM@2026.05.23:vanilla"
    named = "neon:BrainForge/NucleotidingsLLM@2026.05.23:NucleotidingsAI"
    with patch("app.services.model_picker.settings") as mock_settings:
        mock_settings.orchestrator_model = "gpt-4o-mini"
        mock_settings.providers = []
        mock_settings.resolve_model.side_effect = lambda mid: (
            {"model_id": mid, "is_neon": mid.startswith("neon:")}
            if mid in {vanilla, named}
            else None
        )
        assert pick_general_purpose_model(extra_model_ids=[named, vanilla]) == vanilla
