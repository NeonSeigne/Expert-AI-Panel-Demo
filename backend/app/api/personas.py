"""Participant catalog API.

`GET /api/personas` returns three sections - Neon HANA personas (with
vanilla/RAG personas filtered out), the four bundled extra personas, and
the user-supplied expert personas (which are local-only on the frontend
but echoed here for completeness so the API can act as the source of
truth for participant choices when needed).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.clients.hana_client import hana_client
from app.services.extra_personas import list_extra_personas

router = APIRouter()
LOG = logging.getLogger(__name__)


def _is_vanilla_or_rag(persona_name: str) -> bool:
    pn = (persona_name or "").lower()
    return "vanilla" in pn or "rag" in pn


@router.get("/personas")
async def get_personas():
    """Return the participant catalog the frontend dropdown shows."""
    try:
        neon_models = await hana_client.get_models()
    except Exception as exc:
        LOG.warning("HANA models unavailable: %s", exc)
        neon_models = []

    neon_personas = []
    for nm in neon_models or []:
        for p in nm.get("personas", []) or []:
            if p.get("enabled") is False:
                continue
            persona_name = p.get("persona_name") or ""
            if _is_vanilla_or_rag(persona_name):
                continue
            participant_id = f"neon:{nm['model_id']}:{persona_name}"
            neon_personas.append({
                "participant_id": participant_id,
                "kind": "neon",
                "name": persona_name,
                "model_display": f"Neon / {nm['name'].split('/')[-1]}",
                "default_model_id": participant_id,
                "description": p.get("description") or "",
            })

    extras = list_extra_personas()
    for e in extras:
        e["model_display"] = e["default_model_id"]

    return JSONResponse(
        content={
            "neon": neon_personas,
            "extra": extras,
        },
        headers={"Cache-Control": "no-store"},
    )
