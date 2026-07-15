"""Build retrieved-context blocks for participant turns."""
from __future__ import annotations

import logging
from typing import Any

from app.config import settings
from app.services.knowledge import store as rag_store
from app.services.knowledge.tavily import search_web

LOG = logging.getLogger(__name__)


def _truncate_block(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max(0, max_chars - 20)].rstrip() + "\n…[truncated]"


async def build_retrieved_context(
    *,
    participant_id: str,
    query: str,
    documents_enabled: bool,
    web_search_enabled: bool,
) -> str:
    """Return a labeled markdown block, or empty string if nothing retrieved."""
    sections: list[str] = []
    budget = settings.rag_max_chars

    if documents_enabled:
        hits = rag_store.query_documents(participant_id, query)
        if hits:
            lines = ["## Documents"]
            used = 0
            for h in hits:
                piece = f"- ({h.get('name') or 'document'}) {h.get('text') or ''}".strip()
                if used + len(piece) > budget // 2 and lines:
                    break
                lines.append(piece)
                used += len(piece)
            sections.append("\n".join(lines))

    if web_search_enabled:
        web_hits = await search_web(query)
        if web_hits:
            lines = ["## Web"]
            used = 0
            for h in web_hits:
                title = h.get("title") or "Result"
                url = h.get("url") or ""
                content = h.get("content") or ""
                if url:
                    piece = f"- [{title}]({url}): {content}"
                else:
                    piece = f"- {title}: {content}"
                if used + len(piece) > budget // 2 and len(lines) > 1:
                    break
                lines.append(piece)
                used += len(piece)
            sections.append("\n".join(lines))

    if not sections:
        return ""

    body = "\n\n".join(sections)
    body = _truncate_block(body, budget)
    return (
        "[Retrieved context — cite these sources when you use them]\n"
        f"{body}"
    )


def build_retrieval_query(question: str, recent_messages: list[dict[str, Any]] | None = None) -> str:
    parts = [(question or "").strip()]
    for m in (recent_messages or [])[-4:]:
        text = (m.get("text") or "").strip()
        if text:
            speaker = m.get("speaker_name") or m.get("role") or ""
            parts.append(f"{speaker}: {text[:240]}")
    return "\n".join(p for p in parts if p)[:1200]


def build_attachment_context(
    attachments: list[dict[str, Any]] | None,
    *,
    max_chars: int | None = None,
) -> str:
    """Labeled block for session-scoped composer attachments, or empty string."""
    docs = [
        d for d in (attachments or [])
        if (d.get("text") or "").strip()
    ]
    if not docs:
        return ""
    budget = max_chars if max_chars is not None else settings.rag_max_chars
    lines = ["## Attachments"]
    used = 0
    for d in docs:
        name = (d.get("name") or "document").strip() or "document"
        text = (d.get("text") or "").strip()
        piece = f"### {name}\n{text}"
        if used + len(piece) > budget and len(lines) > 1:
            break
        lines.append(piece)
        used += len(piece)
    body = _truncate_block("\n\n".join(lines), budget)
    return (
        "[User-attached documents — cite these sources when you use them]\n"
        f"{body}"
    )
