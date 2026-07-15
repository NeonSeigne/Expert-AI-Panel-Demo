"""Tavily web search client."""
from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings

LOG = logging.getLogger(__name__)

TAVILY_URL = "https://api.tavily.com/search"


def tavily_configured() -> bool:
    return bool((settings.tavily_api_key or "").strip())


async def search_web(query: str, *, max_results: int | None = None) -> list[dict[str, Any]]:
    """Return [{title, url, content}] or [] if unconfigured / failed."""
    key = (settings.tavily_api_key or "").strip()
    if not key:
        return []
    q = (query or "").strip()
    if not q:
        return []
    n = max_results if max_results is not None else settings.web_search_max_results
    payload = {
        "api_key": key,
        "query": q[:400],
        "max_results": max(1, min(10, n)),
        "include_answer": False,
        "search_depth": "basic",
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(TAVILY_URL, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:  # noqa: BLE001
        LOG.warning("Tavily search failed: %s", exc)
        return []

    results = []
    for item in data.get("results") or []:
        results.append({
            "title": item.get("title") or "Result",
            "url": item.get("url") or "",
            "content": (item.get("content") or item.get("snippet") or "").strip(),
        })
    return results
