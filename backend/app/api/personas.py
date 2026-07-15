"""Participant catalog API.

`GET /api/personas` returns Neon HANA personas (vanilla/RAG filtered,
tagged Neon), YAML-configured extra personas (with tags), and a
deduped `tags` list for selector tabs.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.clients.hana_client import hana_client
from app.services.extra_personas import list_extra_personas, list_tags
from app.services.persona_naming import reformat_neon_names_bounded

router = APIRouter()
LOG = logging.getLogger(__name__)

NEON_TAG = "Neon"


def _is_vanilla_or_rag(persona_name: str) -> bool:
    pn = (persona_name or "").lower()
    return "vanilla" in pn or "rag" in pn


@router.get("/personas")
async def get_personas():
    """Return the participant catalog the frontend directory shows."""
    try:
        neon_models = await hana_client.get_models()
    except Exception as exc:
        LOG.warning("HANA models unavailable: %s", exc)
        neon_models = []

    # Pass 1: collect raw (model_short, persona_name) pairs.
    raw_neon: list[dict] = []
    for nm in neon_models or []:
        model_short = nm["name"].split("/")[-1]
        for p in nm.get("personas", []) or []:
            if p.get("enabled") is False:
                continue
            persona_name = p.get("persona_name") or ""
            if _is_vanilla_or_rag(persona_name):
                continue
            system_prompt = (p.get("system_prompt") or "").strip()
            raw_neon.append({
                "model_id": nm["model_id"],
                "model_short": model_short,
                "persona_name": persona_name,
                "description": p.get("description") or "",
                "role_prompt": system_prompt,
            })

    # Pass 2: batch-reformat display names via the orchestrator LLM
    # (cached). One call covers every uncached pair.
    pairs = [(r["model_short"], r["persona_name"]) for r in raw_neon]
    name_map = await reformat_neon_names_bounded(pairs)

    neon_personas = []
    for r in raw_neon:
        display = name_map.get(
            (r["model_short"], r["persona_name"]),
            r["persona_name"],
        )
        participant_id = f"neon:{r['model_id']}:{r['persona_name']}"
        neon_personas.append({
            "participant_id": participant_id,
            "kind": "neon",
            "tag": NEON_TAG,
            "name": display,
            "model_display": r["model_short"],
            "default_model_id": participant_id,
            "description": r["description"],
            "role_prompt": r.get("role_prompt") or "",
        })

    extras = list_extra_personas()
    for e in extras:
        e["model_display"] = e["default_model_id"]
        e.setdefault("tag", "General")

    tags = sorted(set(list_tags()) | ({NEON_TAG} if neon_personas else set()))

    return JSONResponse(
        content={
            "neon": neon_personas,
            "extra": extras,
            "tags": tags,
        },
        headers={"Cache-Control": "no-store"},
    )
