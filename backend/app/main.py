from __future__ import annotations

import logging
import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.clients.hana_client import hana_client
from app.clients.openai_compat import close_shared_client
from app.api import models, chat
from app.middleware.rate_limit import (
    get_oauth_username, is_org_member, get_remaining, check_rate_limit,
    record_conversation,
)

logging.basicConfig(level=logging.INFO)
LOG = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    LOG.info("Starting up — authenticating with HANA...")
    try:
        await hana_client.authenticate()
        await hana_client.get_models()
        LOG.info("HANA auth complete, persona cache populated.")
    except Exception as exc:
        LOG.warning("HANA auth failed (Neon models will be unavailable): %s", exc)
    yield
    LOG.info("Shutting down — closing HTTP clients...")
    await hana_client.close()
    await close_shared_client()


app = FastAPI(title="AI Conversations", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET", secrets.token_hex(32)),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    from huggingface_hub import attach_huggingface_oauth
    attach_huggingface_oauth(app)
    LOG.info("HuggingFace OAuth endpoints registered.")
except Exception as exc:
    LOG.warning("HF OAuth not available (local dev mode): %s", exc)


app.include_router(models.router, prefix="/api")
app.include_router(chat.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/auth/status")
async def auth_status(request: Request):
    username = get_oauth_username(request)
    if username is None:
        remaining = get_remaining(request)
        return {
            "logged_in": False,
            "username": None,
            "is_org_member": False,
            "remaining_conversations": remaining,
        }
    member = is_org_member(request)
    remaining = -1 if member else get_remaining(request)
    return {
        "logged_in": True,
        "username": username,
        "is_org_member": member,
        "remaining_conversations": remaining,
    }


@app.get("/api/rate-limit/status")
async def rate_limit_status(request: Request):
    remaining = get_remaining(request)
    return {"remaining": remaining, "daily_limit": 20}


if STATIC_DIR.is_dir():
    from starlette.staticfiles import StaticFiles
    from starlette.responses import FileResponse

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")

    LOG.info("Serving frontend from %s", STATIC_DIR)
else:
    LOG.info("No static directory found at %s — frontend not served.", STATIC_DIR)
