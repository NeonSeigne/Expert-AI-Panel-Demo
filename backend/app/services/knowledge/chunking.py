"""Chunking helpers for persona RAG corpora."""
from __future__ import annotations

import re
import uuid


def chunk_text(
    text: str,
    *,
    chunk_size: int = 1000,
    overlap: int = 120,
) -> list[str]:
    """Split text into overlapping character chunks on paragraph/sentence boundaries when possible."""
    cleaned = (text or "").strip()
    if not cleaned:
        return []
    if len(cleaned) <= chunk_size:
        return [cleaned]

    # Prefer splitting on blank lines, then sentences, else hard cut.
    paragraphs = re.split(r"\n\s*\n+", cleaned)
    chunks: list[str] = []
    buf = ""
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if not buf:
            buf = para
            continue
        if len(buf) + 2 + len(para) <= chunk_size:
            buf = f"{buf}\n\n{para}"
        else:
            chunks.extend(_flush_buffer(buf, chunk_size, overlap))
            buf = para
    if buf:
        chunks.extend(_flush_buffer(buf, chunk_size, overlap))
    return [c for c in chunks if c.strip()]


def _flush_buffer(buf: str, chunk_size: int, overlap: int) -> list[str]:
    if len(buf) <= chunk_size:
        return [buf]
    out: list[str] = []
    start = 0
    while start < len(buf):
        end = min(len(buf), start + chunk_size)
        out.append(buf[start:end].strip())
        if end >= len(buf):
            break
        start = max(0, end - overlap)
    return [c for c in out if c]


def new_doc_id() -> str:
    return uuid.uuid4().hex
