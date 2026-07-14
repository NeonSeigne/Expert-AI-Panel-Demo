"""Model availability smoke tests.

Unit tests run in CI with no network. Live smoke tests hit real APIs and
require credentials in shared.env / .env:

    cd backend
    RUN_LIVE_MODEL_TESTS=1 python -m pytest tests/test_model_health.py -m live -v -s

Optional filters:
    MODEL_TEST_FILTER=gemini   # substring match on id/name/provider
    MODEL_TEST_KINDS=provider  # or neon_character, or comma-separated
"""
from __future__ import annotations

import asyncio
import os

import pytest

from app.services.model_health import (
    ModelTarget,
    SmokeResult,
    failure_summary,
    filter_targets,
    format_report,
    neon_model_targets,
    provider_model_targets,
    run_smoke_tests,
)


SAMPLE_NEON_MODELS = [
    {
        "name": "BrainForge/NucleotidingsLLM",
        "version": "2026.05.23",
        "model_id": "BrainForge/NucleotidingsLLM@2026.05.23",
        "personas": [
            {"persona_name": "vanilla", "enabled": True},
            {"persona_name": "NucleotidingsAI", "enabled": True},
            {"persona_name": "rag-bot", "enabled": True},
        ],
    },
]


def test_provider_targets_match_settings_shape():
    targets = provider_model_targets()
    for t in targets:
        assert t.model_id
        assert t.kind == "provider"
        assert t.provider


def test_neon_targets_include_enabled_personas():
    targets = neon_model_targets(SAMPLE_NEON_MODELS)
    ids = {t.model_id for t in targets}
    assert len(targets) == 3
    assert "neon:BrainForge/NucleotidingsLLM@2026.05.23:vanilla" in ids
    assert "neon:BrainForge/NucleotidingsLLM@2026.05.23:NucleotidingsAI" in ids


def test_filter_targets_by_substring():
    targets = [
        ModelTarget("gpt-4o-mini", "GPT-4o Mini", "OpenAI", "provider"),
        ModelTarget("gemini-2.0-flash", "Gemini 2.0 Flash", "Google Gemini", "provider"),
    ]
    filtered = filter_targets(targets, filter_substr="gemini")
    assert len(filtered) == 1
    assert filtered[0].model_id == "gemini-2.0-flash"


def test_format_report_lists_failures():
    results = [
        SmokeResult(
            model_id="bad-model",
            display_name="Bad",
            provider="Test",
            kind="provider",
            ok=False,
            detail="api_error (permanent, HTTP 404)",
            error_status=404,
        ),
    ]
    report = format_report(results)
    assert "FAILED:" in report
    assert "bad-model" in report


live = pytest.mark.live


def _kinds_from_env() -> set[str] | None:
    raw = (os.environ.get("MODEL_TEST_KINDS") or "").strip()
    if not raw:
        return None
    return {k.strip() for k in raw.split(",") if k.strip()}


@live
@pytest.mark.skipif(
    os.environ.get("RUN_LIVE_MODEL_TESTS") != "1",
    reason="Set RUN_LIVE_MODEL_TESTS=1 to run live model smoke tests against real APIs",
)
def test_all_models_smoke():
    """Ping every model in the picker catalog; fail with a full failure list."""
    kinds = _kinds_from_env()
    results = asyncio.run(run_smoke_tests(kinds=kinds))
    print("\n" + format_report(results))
    bad = [r for r in results if not r.ok]
    assert not bad, failure_summary(results)


@live
@pytest.mark.skipif(
    os.environ.get("RUN_LIVE_MODEL_TESTS") != "1",
    reason="Set RUN_LIVE_MODEL_TESTS=1 to run live model smoke tests against real APIs",
)
def test_single_model_smoke_when_filter_set():
    """When MODEL_TEST_FILTER is set, smoke-test only matching models (quick probe)."""
    filt = os.environ.get("MODEL_TEST_FILTER")
    if not filt:
        pytest.skip("Set MODEL_TEST_FILTER to probe a single model subset")
    results = asyncio.run(run_smoke_tests(filter_substr=filt))
    print("\n" + format_report(results))
    bad = [r for r in results if not r.ok]
    assert results, f"No models matched filter {filt!r}"
    assert not bad, failure_summary(results)
