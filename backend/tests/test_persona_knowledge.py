"""Tests for persona_config.yaml loader, RAG chunking/store, and Tavily helpers."""
from __future__ import annotations

import asyncio
from unittest.mock import patch

from app.services.extra_personas import (
    get_extra_persona,
    list_extra_personas,
    list_tags,
    reload_persona_config,
)
from app.services.knowledge.chunking import chunk_text
from app.services.knowledge.embeddings import embed_texts
from app.services.knowledge.enrich import build_retrieval_query, build_retrieved_context
from app.services.knowledge import store as rag_store
from app.services.knowledge import tavily as tavily_mod


def test_persona_config_loads_tagged_extras():
    reload_persona_config()
    extras = list_extra_personas()
    assert len(extras) >= 7
    ids = {e["participant_id"] for e in extras}
    assert "extra_elena_financial_strategist" in ids
    elena = get_extra_persona("extra_elena_financial_strategist")
    assert elena is not None
    assert elena.tag == "Finance"
    assert elena.role_prompt
    tags = list_tags()
    assert "Finance" in tags
    assert "Technology" in tags
    assert "Security" in tags


def test_chunk_text_splits_long_content():
    text = ("Paragraph one about budgets.\n\n" * 40) + ("Sentence. " * 80)
    chunks = chunk_text(text, chunk_size=200, overlap=40)
    assert len(chunks) > 1
    assert all(c.strip() for c in chunks)


def test_hash_embeddings_are_normalized():
    vecs = embed_texts(["hello finance", "hello finance", "geology rocks"])
    assert len(vecs) == 3
    assert len(vecs[0]) == 384
    assert vecs[0] == vecs[1]
    norm = sum(v * v for v in vecs[0]) ** 0.5
    assert abs(norm - 1.0) < 1e-5


def test_persona_rag_store_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(rag_store.settings, "persona_rag_dir", str(tmp_path / "rag"))
    pid = "extra_test_persona"
    entry = rag_store.add_document(
        pid,
        name="memo.txt",
        text=(
            "The marketing budget for Q3 is two million dollars. "
            "Engineering should prefer buy over build for commodity auth."
        ),
    )
    assert entry["id"]
    assert entry["chunk_count"] >= 1
    listed = rag_store.list_documents(pid)
    assert len(listed) == 1
    assert listed[0]["name"] == "memo.txt"

    hits = rag_store.query_documents(pid, "marketing budget Q3")
    assert hits
    blob = hits[0]["text"].lower()
    assert "budget" in blob or "million" in blob

    assert rag_store.delete_document(pid, entry["id"]) is True
    assert rag_store.list_documents(pid) == []


def test_build_retrieval_query_includes_question():
    q = build_retrieval_query(
        "Should we acquire Acme?",
        [{"speaker_name": "Elena", "text": "Look at unit economics first."}],
    )
    assert "acquire Acme" in q
    assert "Elena" in q


def test_build_retrieved_context_docs_and_web(tmp_path, monkeypatch):
    monkeypatch.setattr(rag_store.settings, "persona_rag_dir", str(tmp_path / "rag"))
    monkeypatch.setattr(rag_store.settings, "rag_max_chars", 4000)
    pid = "extra_ctx"
    rag_store.add_document(
        pid, name="policy.md", text="Remote work is allowed three days per week.",
    )

    async def fake_search(query, max_results=None):
        return [{
            "title": "News",
            "url": "https://example.com",
            "content": "Acme raised Series B.",
        }]

    with patch("app.services.knowledge.enrich.search_web", fake_search):
        block = asyncio.run(
            build_retrieved_context(
                participant_id=pid,
                query="remote work policy",
                documents_enabled=True,
                web_search_enabled=True,
            ),
        )
    assert "Retrieved context" in block
    assert "Documents" in block
    assert "Web" in block
    assert "example.com" in block


def test_tavily_configured_false_without_key(monkeypatch):
    monkeypatch.setattr(tavily_mod.settings, "tavily_api_key", "")
    assert tavily_mod.tavily_configured() is False


def test_tavily_search_returns_empty_without_key(monkeypatch):
    monkeypatch.setattr(tavily_mod.settings, "tavily_api_key", "")
    result = asyncio.run(tavily_mod.search_web("anything"))
    assert result == []
