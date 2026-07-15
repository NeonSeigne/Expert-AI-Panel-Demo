"""Knowledge API: persona document CRUD + attachment extract + status."""
from __future__ import annotations

import logging
from urllib.parse import unquote

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.services.knowledge import store as rag_store
from app.services.knowledge.extract_text import (
    UnsupportedDocumentType,
    extract_text_from_bytes,
)
from app.services.knowledge.tavily import tavily_configured

router = APIRouter()
LOG = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 5_000_000


class TextDocumentBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    text: str = Field(..., min_length=1)


def _decode_pid(participant_id: str) -> str:
    return unquote(participant_id)


@router.get("/knowledge/status")
async def knowledge_status():
    return {"tavily_configured": tavily_configured()}


@router.post("/attachments/extract")
async def extract_attachment(file: UploadFile = File(...)):
    """Extract text from an uploaded file for session-scoped prompt context.

    Does not persist anything — callers include the returned text on
    ``/chat/start`` as ``attachments``.
    """
    if not file.filename:
        raise HTTPException(400, "Missing filename")
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "File too large (max 5MB)")
    try:
        text = extract_text_from_bytes(file.filename, raw)
    except UnsupportedDocumentType as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        LOG.exception("attachment extract failed: %s", exc)
        raise HTTPException(500, f"Failed to extract text: {exc}") from exc
    if not (text or "").strip():
        raise HTTPException(400, "No extractable text in upload")
    return {"name": file.filename[:200], "text": text}


@router.get("/personas/{participant_id:path}/documents")
async def list_persona_documents(participant_id: str):
    pid = _decode_pid(participant_id)
    try:
        docs = rag_store.list_documents(pid)
    except Exception as exc:  # noqa: BLE001
        LOG.exception("list documents failed: %s", exc)
        raise HTTPException(500, f"Failed to list documents: {exc}") from exc
    return {"documents": docs}


@router.post("/personas/{participant_id:path}/documents")
async def add_persona_document(
    participant_id: str,
    file: UploadFile | None = File(None),
    name: str | None = Form(None),
    text: str | None = Form(None),
):
    """Upload a file and/or paste text for a persona's RAG corpus."""
    pid = _decode_pid(participant_id)
    body_text = ""
    doc_name = (name or "").strip()

    if file is not None and file.filename:
        raw = await file.read()
        if len(raw) > MAX_UPLOAD_BYTES:
            raise HTTPException(400, "File too large (max 5MB)")
        try:
            body_text = extract_text_from_bytes(file.filename, raw)
        except UnsupportedDocumentType as exc:
            raise HTTPException(400, str(exc)) from exc
        if not doc_name:
            doc_name = file.filename
    elif text is not None:
        body_text = text
        if not doc_name:
            doc_name = "Pasted note"
    else:
        # Also accept JSON body via a duplicate route? Form covers UI;
        # JSON clients can POST multipart with text=…
        raise HTTPException(400, "Provide a file or text")

    if not body_text.strip():
        raise HTTPException(400, "No extractable text in upload")
    if not doc_name:
        doc_name = "document"

    try:
        entry = rag_store.add_document(pid, name=doc_name, text=body_text)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        LOG.exception("add document failed: %s", exc)
        raise HTTPException(500, f"Failed to store document: {exc}") from exc
    return entry


@router.post("/personas/{participant_id:path}/documents/json")
async def add_persona_document_json(participant_id: str, body: TextDocumentBody):
    pid = _decode_pid(participant_id)
    try:
        entry = rag_store.add_document(pid, name=body.name, text=body.text)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        LOG.exception("add document failed: %s", exc)
        raise HTTPException(500, f"Failed to store document: {exc}") from exc
    return entry


@router.delete("/personas/{participant_id:path}/documents/{doc_id}")
async def delete_persona_document(participant_id: str, doc_id: str):
    pid = _decode_pid(participant_id)
    try:
        ok = rag_store.delete_document(pid, doc_id)
    except Exception as exc:  # noqa: BLE001
        LOG.exception("delete document failed: %s", exc)
        raise HTTPException(500, f"Failed to delete document: {exc}") from exc
    if not ok:
        raise HTTPException(404, "Document not found")
    return {"ok": True}
