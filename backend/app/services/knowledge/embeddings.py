"""Deterministic hash embeddings so Chroma needs no model download."""
from __future__ import annotations

import hashlib
import re
from typing import Sequence


_DIM = 384
_TOKEN_RE = re.compile(r"[a-z0-9]{2,}", re.I)


def embed_texts(texts: Sequence[str]) -> list[list[float]]:
    return [_embed_one(t) for t in texts]


def _embed_one(text: str) -> list[float]:
    vec = [0.0] * _DIM
    tokens = _TOKEN_RE.findall((text or "").lower())
    if not tokens:
        tokens = ["empty"]
    for tok in tokens:
        digest = hashlib.sha256(tok.encode("utf-8")).digest()
        # Use successive bytes to pick several buckets per token.
        for i in range(0, min(16, len(digest) - 1), 2):
            idx = int.from_bytes(digest[i : i + 2], "big") % _DIM
            sign = 1.0 if digest[(i + 2) % len(digest)] & 1 else -1.0
            vec[idx] += sign
    # L2 normalize
    norm = sum(v * v for v in vec) ** 0.5
    if norm > 0:
        vec = [v / norm for v in vec]
    return vec
