from __future__ import annotations

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.clients.hana_client import hana_client
from app.config import settings

router = APIRouter()
LOG = logging.getLogger(__name__)


@router.get("/models")
async def get_models():
    """Return all available LLMs: Neon models from HANA + comparison providers."""
    neon_models = []
    try:
        neon_models = await hana_client.get_models()
    except Exception as exc:
        LOG.warning("HANA models unavailable: %s", exc)

    providers = []
    for p in settings.providers:
        providers.append({
            "id": p["id"],
            "name": p["name"],
            "models": [
                {"id": m["id"], "name": m["name"], "params": m.get("params", "")}
                for m in p["models"]
            ],
        })

    return JSONResponse(
        content={
            "neon_models": neon_models,
            "providers": providers,
        },
        headers={"Cache-Control": "no-store"},
    )
