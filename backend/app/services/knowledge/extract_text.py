"""Extract plain text from uploaded document bytes."""
from __future__ import annotations

import io


class UnsupportedDocumentType(ValueError):
    """Raised when the filename extension is not supported."""


def extract_text_from_bytes(filename: str, data: bytes) -> str:
    """Return UTF-8 text extracted from .txt / .md / .pdf / .docx bytes."""
    name = (filename or "upload").lower()
    if name.endswith(".txt") or name.endswith(".md") or name.endswith(".markdown"):
        return data.decode("utf-8", errors="replace")
    if name.endswith(".pdf"):
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        parts = []
        for page in reader.pages:
            parts.append(page.extract_text() or "")
        return "\n".join(parts).strip()
    if name.endswith(".docx"):
        from docx import Document

        doc = Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs if p.text).strip()
    raise UnsupportedDocumentType(
        "Unsupported file type. Upload .txt, .md, .pdf, or .docx",
    )
