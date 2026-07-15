"""Smoke tests for Marketing document pipeline registration."""
from app.services.conversation import (
    DECISION_REGISTRY,
    STRUCTURE_REGISTRY,
    get_decision,
    get_structure,
)
from app.services.conversation.structures.document_pipeline import (
    _format_sections_block,
    _truncate_section,
)
from app.services.extra_personas import get_extra_persona, list_extra_personas, reload_persona_config


def test_marketing_personas_registered():
    reload_persona_config()
    expected = [
        "extra_marketing_project_manager",
        "extra_marketing_newsletter_writer",
        "extra_marketing_social_media_expert",
        "extra_marketing_website_expert",
        "extra_marketing_linkedin_expert",
        "extra_marketing_creative_director",
    ]
    for pid in expected:
        ep = get_extra_persona(pid)
        assert ep is not None, pid
        assert ep.tag == "Marketing"
    marketing = [
        e for e in list_extra_personas()
        if e["participant_id"].startswith("extra_marketing_")
    ]
    assert len(marketing) == 6


def test_document_pipeline_plugins_registered():
    assert "document_pipeline" in STRUCTURE_REGISTRY
    assert "document_publish" in DECISION_REGISTRY
    assert get_structure("document_pipeline").NAME == "Document Pipeline"
    assert get_decision("document_publish").NAME == "Document Publish"


def test_section_truncate_and_format():
    long = "a" * 6000
    trunc = _truncate_section(long, 100)
    assert len(trunc) < 200
    assert "truncated" in trunc
    block = _format_sections_block(
        {"a": "Alpha draft", "b": "Beta draft"},
        {"a": "Writer", "b": "Designer"},
    )
    assert "Writer" in block and "Alpha draft" in block
