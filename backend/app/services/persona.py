from __future__ import annotations

import logging

from app.clients.llm_router import chat_completion
from app.config import settings
from app.services.model_picker import pick_general_purpose_model

LOG = logging.getLogger(__name__)

_ROLE_WRITER_SYSTEM = (
    "You are a helpful assistant that creates role prompts for LLM participants. "
    "Respond ONLY with the finished role prompt text — no reasoning, analysis, "
    "draft notes, questions to the user, or meta-commentary.\n\n"
    "STRICT RULES:\n"
    "- Do NOT invent a personal name unless one is explicitly provided in the name field.\n"
    "- Do NOT invent hobbies, side interests, employers, blogs, websites, or domains "
    "not stated in the user's input.\n"
    "- Do NOT add conversational filler or questions (e.g. 'What do you think?').\n"
    "- Write in second person ('You are…') so another LLM can embody the persona."
)

_ANTI_INVENTION_AI = (
    "\n\nIMPORTANT: You may elaborate on tone, speech patterns, and professional style "
    "implied by the stated identity, but stay strictly within the user's described domain. "
    "Do NOT add unrelated interests, fictional backstory, or new subject areas."
)

_ANTI_INVENTION_EXACT = (
    "\n\nIMPORTANT: Use ONLY the information explicitly provided. Do not invent names "
    "(unless given in the name field), hobbies, employers, blogs, or other facts."
)

# ---------------------------------------------------------------------------
# Structured input prompts
# ---------------------------------------------------------------------------

STRUCTURED_AI_COMPLETED_PROMPT = (
    "You will receive structured information about a character or persona: a name, an identity "
    "statement, a profile, and optionally writing/speech samples. Some fields may be sparse or "
    "missing. Write a complete, vivid 3-5 sentence role prompt that an LLM can use to "
    "convincingly embody this persona in a conversation.\n\n"
    "If any fields are sparse, infer plausible personality traits, speech patterns, and "
    "conversational style from whatever clues are available — but only within the professional "
    "or personal domain the user described. Fill in realistic detail so the role prompt is "
    "rich and actionable — never produce a vague or skeletal prompt.\n\n"
    "Cover: personality, tone and speech patterns, background/expertise, and how they would "
    "naturally interact in a group discussion.\n\n"
    "The name is: {name}\n"
    "The identity statement is: {identity}\n"
    "The profile is: {profile}\n"
    "Here are the writing and/or speech samples: {samples}"
    + _ANTI_INVENTION_AI
)

STRUCTURED_EXACT_PROMPT = (
    "You will receive structured information about a character or persona: a name, an identity "
    "statement, a profile, and optionally writing/speech samples. Combine this information into "
    "a coherent 3-5 sentence role prompt that an LLM can use to embody this persona in a "
    "conversation.\n\n"
    "IMPORTANT: Use ONLY the information explicitly provided. Do not invent, assume, or infer "
    "any traits, background, opinions, or speech patterns beyond what is stated. Your job is "
    "purely to organize and lightly rephrase the provided facts into a smooth, usable role "
    "prompt — add linking words and natural sentence flow, but no new content. If a field is "
    "empty or says '(not provided)', simply omit it.\n\n"
    "The name is: {name}\n"
    "The identity statement is: {identity}\n"
    "The profile is: {profile}\n"
    "Here are the writing and/or speech samples: {samples}"
    + _ANTI_INVENTION_EXACT
)

# ---------------------------------------------------------------------------
# Freeform input prompts
# ---------------------------------------------------------------------------

FREEFORM_AI_COMPLETED_PROMPT = (
    "You will receive freeform information about a character or persona. The input may be "
    "detailed (with writing samples, background, etc.) or very brief (just a name or a short "
    "description). Regardless of how much is provided, write a complete, vivid 3-5 sentence "
    "role prompt that an LLM can use to convincingly embody this persona in a conversation.\n\n"
    "If the input is sparse, infer plausible personality traits, speech patterns, and "
    "conversational style from whatever clues are available (the name, any title or "
    "occupation, context, etc.) — but only within the domain the user described. Fill in "
    "realistic detail so the role prompt is rich and actionable — never produce a vague or "
    "skeletal prompt.\n\n"
    "Cover: personality, tone and speech patterns, background/expertise, and how they would "
    "naturally interact in a group discussion.\n\n"
    "The persona's name is: {name}\n\n"
    "Here is everything provided about this persona:\n"
    "---\n{text}\n---"
    + _ANTI_INVENTION_AI
)

FREEFORM_EXACT_PROMPT = (
    "You will receive freeform information about a character or persona. Combine this "
    "information into a coherent 3-5 sentence role prompt that an LLM can use to embody "
    "this persona in a conversation.\n\n"
    "IMPORTANT: Use ONLY the information explicitly provided. Do not invent, assume, or infer "
    "any traits, background, opinions, or speech patterns beyond what is stated. Your job is "
    "purely to organize and lightly rephrase the user's text into a smooth, usable role "
    "prompt — add linking words and natural sentence flow, but no new content. If very little "
    "was provided, the role prompt should be correspondingly brief.\n\n"
    "The persona's name is: {name}\n\n"
    "Here is everything provided about this persona:\n"
    "---\n{text}\n---"
    + _ANTI_INVENTION_EXACT
)


async def _call_llm(model_id: str, prompt_text: str) -> dict:
    resolved = settings.resolve_model(model_id)
    if not resolved:
        return {
            "role_prompt": "",
            "error": f"No neutral model available to generate the role prompt.",
        }

    messages = [
        {"role": "system", "content": _ROLE_WRITER_SYSTEM},
        {"role": "user", "content": prompt_text},
    ]

    result = await chat_completion(
        resolved=resolved,
        messages=messages,
        temperature=0.7,
        max_tokens=512,
        timeout=45,
    )

    if result.get("error"):
        return {"role_prompt": "", "error": result["response"]}

    return {
        "role_prompt": result["response"],
        "elapsed_seconds": result["elapsed_seconds"],
        "writer_model_id": model_id,
    }


async def _resolve_writer_model(
    orchestrator_model_id: str | None,
    extra_model_ids: list[str] | None,
) -> str | None:
    return pick_general_purpose_model(
        orchestrator_model_id,
        extra_model_ids=extra_model_ids,
    )


async def generate_role_prompt(
    name: str,
    profile: str,
    identity: str,
    samples: str,
    role_style: str = "exact",
    orchestrator_model_id: str | None = None,
    extra_model_ids: list[str] | None = None,
) -> dict:
    """Distill structured persona inputs into a role prompt via a neutral writer model."""
    writer_id = await _resolve_writer_model(orchestrator_model_id, extra_model_ids)
    if not writer_id:
        return {"role_prompt": "", "error": "No model available to generate the role prompt."}

    template = STRUCTURED_AI_COMPLETED_PROMPT if role_style == "ai_completed" else STRUCTURED_EXACT_PROMPT
    prompt_text = template.format(
        name=name or "(not provided)",
        identity=identity or "(not provided)",
        profile=profile or "(not provided)",
        samples=samples or "(not provided)",
    )
    return await _call_llm(writer_id, prompt_text)


async def generate_role_prompt_freeform(
    name: str,
    text: str,
    role_style: str = "ai_completed",
    orchestrator_model_id: str | None = None,
    extra_model_ids: list[str] | None = None,
) -> dict:
    """Distill a freeform text block into a role prompt via a neutral writer model."""
    writer_id = await _resolve_writer_model(orchestrator_model_id, extra_model_ids)
    if not writer_id:
        return {"role_prompt": "", "error": "No model available to generate the role prompt."}

    template = FREEFORM_AI_COMPLETED_PROMPT if role_style == "ai_completed" else FREEFORM_EXACT_PROMPT
    prompt_text = template.format(
        name=name or "(not provided)",
        text=text or "(not provided)",
    )
    return await _call_llm(writer_id, prompt_text)
