from __future__ import annotations

import json
import logging
import time

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

from app.config import settings
from app.services.persona import generate_role_prompt, generate_role_prompt_freeform
from app.services.orchestrator import (
    Session, Persona, create_session, get_session, run_conversation,
)

router = APIRouter()
LOG = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class GenerateRoleRequest(BaseModel):
    model_id: str
    name: str = ""
    profile: str = ""
    identity: str = ""
    samples: str = ""
    role_style: str = "exact"


class GenerateRoleFreeformRequest(BaseModel):
    model_id: str
    name: str = ""
    text: str = ""
    role_style: str = "ai_completed"


class SetOrchestratorRequest(BaseModel):
    model_id: str


class SetSpeedPriorityRequest(BaseModel):
    enabled: bool


class StartChatRequest(BaseModel):
    persona_a_model_id: str
    persona_a_name: str
    persona_a_role: str

    persona_b_model_id: str
    persona_b_name: str
    persona_b_role: str

    starter_text: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/chat/orchestrator")
async def api_get_orchestrator():
    return {"model_id": settings.orchestrator_model}


@router.put("/chat/orchestrator")
async def api_set_orchestrator(req: SetOrchestratorRequest):
    settings.orchestrator_model = req.model_id
    return {"model_id": settings.orchestrator_model}


@router.get("/chat/speed-priority")
async def api_get_speed_priority():
    return {"enabled": settings.speed_priority}


@router.put("/chat/speed-priority")
async def api_set_speed_priority(req: SetSpeedPriorityRequest):
    settings.speed_priority = req.enabled
    return {"enabled": settings.speed_priority}


@router.post("/chat/generate-role")
async def api_generate_role(req: GenerateRoleRequest):
    result = await generate_role_prompt(
        model_id=req.model_id,
        name=req.name,
        profile=req.profile,
        identity=req.identity,
        samples=req.samples,
        role_style=req.role_style,
    )
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/chat/generate-role-freeform")
async def api_generate_role_freeform(req: GenerateRoleFreeformRequest):
    result = await generate_role_prompt_freeform(
        model_id=req.model_id,
        name=req.name,
        text=req.text,
        role_style=req.role_style,
    )
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/chat/start")
async def api_start_chat(req: StartChatRequest, request: Request):
    """Create a session and return a streaming SSE response for the conversation."""
    from app.middleware.rate_limit import check_rate_limit, record_conversation

    allowed, remaining = check_rate_limit(request)
    if not allowed:
        return JSONResponse(
            status_code=429,
            content={
                "detail": "Daily conversation limit reached (20/day). Sign in with HuggingFace as a neongeckocom org member for unlimited access.",
                "remaining": 0,
            },
        )
    record_conversation(request)

    ra = settings.resolve_model(req.persona_a_model_id)
    rb = settings.resolve_model(req.persona_b_model_id)

    if not ra:
        raise HTTPException(400, f"Unknown model: {req.persona_a_model_id}")
    if not rb:
        raise HTTPException(400, f"Unknown model: {req.persona_b_model_id}")

    session = create_session()
    session.persona_a = Persona(
        name=req.persona_a_name or "Persona A",
        model_id=ra["model_id"],
        role_prompt=req.persona_a_role,
        base_url=ra.get("base_url", ""),
        api_key=ra.get("api_key", ""),
        display_name=ra["display_name"],
        is_neon=ra.get("is_neon", False),
        hana_model_id=ra.get("hana_model_id", ""),
        persona_name=ra.get("persona_name", ""),
        neon_direct_vllm=ra.get("neon_direct_vllm", False),
        vllm_base_url=ra.get("vllm_base_url", ""),
        vllm_api_key=ra.get("vllm_api_key", ""),
    )
    session.persona_b = Persona(
        name=req.persona_b_name or "Persona B",
        model_id=rb["model_id"],
        role_prompt=req.persona_b_role,
        base_url=rb.get("base_url", ""),
        api_key=rb.get("api_key", ""),
        display_name=rb["display_name"],
        is_neon=rb.get("is_neon", False),
        hana_model_id=rb.get("hana_model_id", ""),
        persona_name=rb.get("persona_name", ""),
        neon_direct_vllm=rb.get("neon_direct_vllm", False),
        vllm_base_url=rb.get("vllm_base_url", ""),
        vllm_api_key=rb.get("vllm_api_key", ""),
    )

    async def event_stream():
        yield f"event: session\ndata: {json.dumps({'session_id': session.session_id})}\n\n"
        async for chunk in run_conversation(session, req.starter_text):
            yield chunk

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/chat/{session_id}/export")
async def api_export_chat(session_id: str, fmt: str = "txt"):
    session = get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    if fmt == "md":
        return _export_md(session)
    return _export_txt(session)


@router.get("/chat/{session_id}/api-log")
async def api_export_log(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    return {
        "session_id": session_id,
        "log": session.api_log,
    }


# ---------------------------------------------------------------------------
# Export helpers
# ---------------------------------------------------------------------------

def _export_txt(session: Session) -> dict:
    lines = [f"LLMChats3 Conversation Log", "=" * 40, ""]
    if session.persona_a:
        lines.append(f"Participant 1: {session.persona_a.name} ({session.persona_a.display_name})")
    if session.persona_b:
        lines.append(f"Participant 2: {session.persona_b.name} ({session.persona_b.display_name})")
    lines.append("")
    for m in session.messages:
        lines.append(f"{m['speaker']}: {m['text']}")
        lines.append("")
    return {"filename": "chat_export.txt", "content": "\n".join(lines)}


def _export_md(session: Session) -> dict:
    lines = ["# LLMChats3 Conversation Log", ""]
    if session.persona_a:
        lines.append(f"**Participant 1:** {session.persona_a.name} (*{session.persona_a.display_name}*)")
    if session.persona_b:
        lines.append(f"**Participant 2:** {session.persona_b.name} (*{session.persona_b.display_name}*)")
    lines.append("\n---\n")
    for m in session.messages:
        lines.append(f"**{m['speaker']}:** {m['text']}")
        lines.append("")
    return {"filename": "chat_export.md", "content": "\n".join(lines)}
