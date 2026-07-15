"""Per-persona persistent RAG store backed by Chroma."""
from __future__ import annotations

import logging
import re
import time
from pathlib import Path
from typing import Any

from app.config import settings
from app.services.knowledge.chunking import chunk_text, new_doc_id
from app.services.knowledge.embeddings import embed_texts

LOG = logging.getLogger(__name__)

_SAFE_RE = re.compile(r"[^a-zA-Z0-9._-]+")


def sanitize_participant_id(participant_id: str) -> str:
    raw = (participant_id or "").strip() or "unknown"
    return _SAFE_RE.sub("__", raw)[:180]


def persona_rag_root() -> Path:
    root = Path(settings.persona_rag_dir).expanduser()
    if not root.is_absolute():
        # Resolve relative to backend package parent (backend/)
        backend_root = Path(__file__).resolve().parents[3]
        root = backend_root / root
    root.mkdir(parents=True, exist_ok=True)
    return root


def _collection_for(participant_id: str):
    import chromadb
    from chromadb.api.types import Documents, EmbeddingFunction, Embeddings

    class _HashEF(EmbeddingFunction[Documents]):
        def __init__(self) -> None:
            pass

        @staticmethod
        def name() -> str:
            return "hash_bag"

        def __call__(self, input: Documents) -> Embeddings:
            return embed_texts(list(input))

    path = persona_rag_root() / sanitize_participant_id(participant_id)
    path.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(path))
    return client.get_or_create_collection(
        name="documents",
        embedding_function=_HashEF(),
        metadata={"hnsw:space": "cosine"},
    )


def list_documents(participant_id: str) -> list[dict[str, Any]]:
    col = _collection_for(participant_id)
    if col.count() == 0:
        return []
    result = col.get(include=["metadatas"])
    docs: dict[str, dict[str, Any]] = {}
    ids = result.get("ids") or []
    metas = result.get("metadatas") or []
    for i, chunk_id in enumerate(ids):
        meta = metas[i] or {}
        doc_id = str(meta.get("doc_id") or chunk_id)
        entry = docs.setdefault(
            doc_id,
            {
                "id": doc_id,
                "name": meta.get("name") or "document",
                "chunk_count": 0,
                "added_at": meta.get("added_at"),
            },
        )
        entry["chunk_count"] = int(entry["chunk_count"]) + 1
        if meta.get("added_at") and (
            not entry.get("added_at") or meta["added_at"] < entry["added_at"]
        ):
            entry["added_at"] = meta["added_at"]
    return sorted(docs.values(), key=lambda d: d.get("added_at") or 0, reverse=True)


def add_document(
    participant_id: str,
    *,
    name: str,
    text: str,
) -> dict[str, Any]:
    chunks = chunk_text(text)
    if not chunks:
        raise ValueError("Document produced no text chunks")
    doc_id = new_doc_id()
    added_at = time.time()
    col = _collection_for(participant_id)
    ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
    metadatas = [
        {
            "doc_id": doc_id,
            "name": name[:200],
            "chunk_index": i,
            "added_at": added_at,
        }
        for i in range(len(chunks))
    ]
    col.add(ids=ids, documents=chunks, metadatas=metadatas)
    LOG.info(
        "Added doc %s (%d chunks) for persona %s",
        doc_id, len(chunks), participant_id,
    )
    return {
        "id": doc_id,
        "name": name[:200],
        "chunk_count": len(chunks),
        "added_at": added_at,
    }


def delete_document(participant_id: str, doc_id: str) -> bool:
    col = _collection_for(participant_id)
    if col.count() == 0:
        return False
    result = col.get(include=["metadatas"])
    to_delete = []
    for i, chunk_id in enumerate(result.get("ids") or []):
        meta = (result.get("metadatas") or [])[i] or {}
        if str(meta.get("doc_id")) == doc_id:
            to_delete.append(chunk_id)
    if not to_delete:
        return False
    col.delete(ids=to_delete)
    return True


def query_documents(
    participant_id: str,
    query: str,
    *,
    top_k: int | None = None,
) -> list[dict[str, Any]]:
    k = top_k if top_k is not None else settings.rag_top_k
    col = _collection_for(participant_id)
    if col.count() == 0 or not (query or "").strip():
        return []
    n = min(k, col.count())
    try:
        result = col.query(
            query_texts=[query.strip()],
            n_results=n,
            include=["documents", "metadatas", "distances"],
        )
    except Exception as exc:  # noqa: BLE001
        LOG.warning("Chroma query failed for %s: %s", participant_id, exc)
        return []
    docs = (result.get("documents") or [[]])[0]
    metas = (result.get("metadatas") or [[]])[0]
    dists = (result.get("distances") or [[]])[0]
    out: list[dict[str, Any]] = []
    for i, text in enumerate(docs):
        meta = metas[i] if i < len(metas) else {}
        dist = dists[i] if i < len(dists) else None
        out.append({
            "text": text or "",
            "name": (meta or {}).get("name") or "document",
            "doc_id": (meta or {}).get("doc_id"),
            "distance": dist,
        })
    return out
