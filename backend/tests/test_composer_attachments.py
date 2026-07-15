"""Tests for composer attachment extract + prompt injection helpers."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.services.knowledge.enrich import build_attachment_context
from app.services.knowledge.extract_text import (
    UnsupportedDocumentType,
    extract_text_from_bytes,
)
from app.services.models import Session


def test_extract_text_from_plain_txt():
    text = extract_text_from_bytes("notes.txt", b"Hello panel docs")
    assert "Hello panel docs" in text


def test_extract_rejects_unsupported_type():
    try:
        extract_text_from_bytes("photo.png", b"\x89PNG")
        assert False, "expected UnsupportedDocumentType"
    except UnsupportedDocumentType:
        pass


def test_build_attachment_context_block():
    block = build_attachment_context([
        {"name": "brief.md", "text": "Launch Q3 campaign in APAC."},
    ])
    assert "User-attached documents" in block
    assert "## Attachments" in block
    assert "brief.md" in block
    assert "Launch Q3 campaign" in block


def test_build_attachment_context_empty():
    assert build_attachment_context([]) == ""
    assert build_attachment_context(None) == ""
    assert build_attachment_context([{"name": "x", "text": "   "}]) == ""


def test_session_stores_attached_documents():
    session = Session(question="What should we do?")
    session.attached_documents = [
        {"name": "brief.md", "text": "Launch Q3 campaign in APAC."},
    ]
    block = build_attachment_context(session.attached_documents)
    assert "Launch Q3 campaign" in block


def test_attachments_extract_endpoint():
    client = TestClient(app)
    resp = client.post(
        "/api/attachments/extract",
        files={"file": ("brief.txt", b"Market notes for Q3", "text/plain")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "brief.txt"
    assert "Market notes for Q3" in data["text"]


def test_attachments_extract_rejects_empty():
    client = TestClient(app)
    resp = client.post(
        "/api/attachments/extract",
        files={"file": ("empty.txt", b"   ", "text/plain")},
    )
    assert resp.status_code == 400
