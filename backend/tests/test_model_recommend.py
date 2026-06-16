"""Tests for model recommendation validation helpers."""

from app.services.model_recommend import (
    _deprioritize_neon_mismatch,
    _models_block,
    _parse_suggest_response,
    _validate_model_id,
)
from app.services.prompts.model_recommend import SUGGEST_MODEL_PROMPT

MODELS = [
    {
        "id": "neon:BrainForge/NucleotidingsLLM@2026.05.23:vanilla",
        "name": "vanilla",
        "provider": "Neon / NucleotidingsLLM",
        "kind": "neon_character",
    },
    {
        "id": "neon:BrainForge/NucleotidingsLLM@2026.05.23:NucleotidingsAI",
        "name": "NucleotidingsAI",
        "provider": "Neon / NucleotidingsLLM",
        "kind": "neon_character",
    },
    {
        "id": "neon:BrainForge/LogisticsLLM@2026.01.20:vanilla",
        "name": "vanilla",
        "provider": "Neon / LogisticsLLM",
        "kind": "neon_character",
    },
]


def test_validate_model_id_accepts_known_id():
    models = [
        {"id": "gpt-4o", "name": "GPT-4o", "provider": "OpenAI"},
        {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "provider": "Google Gemini"},
    ]
    assert _validate_model_id("gpt-4o", models) == "gpt-4o"


def test_validate_model_id_rejects_unknown():
    models = [{"id": "gpt-4o", "name": "GPT-4o", "provider": "OpenAI"}]
    assert _validate_model_id("made-up", models) is None
    assert _validate_model_id(None, models) is None


def test_validate_model_id_strips_whitespace():
    models = [{"id": "gpt-4o", "name": "GPT-4o", "provider": "OpenAI"}]
    assert _validate_model_id("  gpt-4o  ", models) == "gpt-4o"


def test_models_block_includes_kind():
    block = _models_block(MODELS[:1])
    assert "kind=neon_character" in block
    assert "id=neon:BrainForge/NucleotidingsLLM@2026.05.23:vanilla" in block


def test_suggest_prompt_includes_source_and_role():
    formatted = SUGGEST_MODEL_PROMPT.format(
        persona_name="Marketer",
        source_text="B2B demand generation specialist",
        role_prompt="You are a lifecycle marketer...",
        models_block="1. id=gpt-4o | name=GPT-4o | family=OpenAI | kind=provider",
        panel_block="",
    )
    assert "User's original description (authoritative" in formatted
    assert "B2B demand generation specialist" in formatted
    assert "Generated role prompt (secondary" in formatted
    assert "kind=provider" in formatted


def test_parse_line_format():
    raw = (
        "recommended_model_id: neon:BrainForge/LogisticsLLM@2026.01.20:vanilla\n"
        "rationale: Good fit for structured reasoning."
    )
    rid, rat = _parse_suggest_response(raw, MODELS)
    assert rid == "neon:BrainForge/LogisticsLLM@2026.01.20:vanilla"
    assert "reasoning" in rat


def test_parse_prose_mentions_provider_token():
    raw = (
        "The Neon NucleotidingsLLM is designed for handling nuclear and "
        "complex scientific information, which suits this persona well."
    )
    rid, _rat = _parse_suggest_response(raw, MODELS)
    assert rid == "neon:BrainForge/NucleotidingsLLM@2026.05.23:vanilla"


def test_deprioritize_neon_mismatch_swaps_named_character():
    b2b_source = (
        "Senior B2B demand generation marketer focused on lifecycle campaigns "
        "and pipeline analytics."
    )
    bad_pick = "neon:BrainForge/NucleotidingsLLM@2026.05.23:NucleotidingsAI"
    adjusted = _deprioritize_neon_mismatch(bad_pick, b2b_source, MODELS)
    assert adjusted != bad_pick
    assert adjusted.endswith(":vanilla")


def test_deprioritize_neon_keeps_vanilla():
    b2b_source = "B2B marketer"
    vanilla = "neon:BrainForge/NucleotidingsLLM@2026.05.23:vanilla"
    assert _deprioritize_neon_mismatch(vanilla, b2b_source, MODELS) == vanilla


def test_deprioritize_neon_keeps_when_source_matches_domain():
    nuclear_source = "Nuclear energy policy analyst using NucleotidingsLLM data."
    named = "neon:BrainForge/NucleotidingsLLM@2026.05.23:NucleotidingsAI"
    assert _deprioritize_neon_mismatch(named, nuclear_source, MODELS) == named


def test_suggest_requires_source_or_role():
    import asyncio

    from app.services.model_recommend import suggest_model_for_persona

    result = asyncio.run(
        suggest_model_for_persona(
            orchestrator_model_id="gpt-4o",
            persona_name="Test",
            source_text="",
            role_prompt="",
            available_models=MODELS,
        )
    )
    assert "error" in result
    assert "description or role prompt" in result["error"]
