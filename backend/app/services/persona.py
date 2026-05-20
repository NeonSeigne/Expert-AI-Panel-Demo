from __future__ import annotations

import logging

from app.clients.llm_router import chat_completion
from app.config import settings

LOG = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Structured input prompts
# ---------------------------------------------------------------------------

STRUCTURED_AI_COMPLETED_PROMPT = (
    "You will receive structured information about a character or persona: a name, an identity "
    "statement, a profile, and optionally writing/speech samples. Some fields may be sparse or "
    "missing. Write a complete, vivid 3-5 sentence role prompt that an LLM can use to "
    "convincingly embody this persona in a conversation.\n\n"
    "If any fields are sparse, infer plausible personality traits, speech patterns, interests, "
    "and conversational style from whatever clues are available. Fill in realistic detail so "
    "the role prompt is rich and actionable — never produce a vague or skeletal prompt.\n\n"
    "Cover: personality, tone and speech patterns, background/expertise, interests and "
    "motivations, and how they would naturally interact in a casual conversation.\n\n"
    "The name is: {name}\n"
    "The identity statement is: {identity}\n"
    "The profile is: {profile}\n"
    "Here are the writing and/or speech samples: {samples}"
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
)

# ---------------------------------------------------------------------------
# Freeform input prompts
# ---------------------------------------------------------------------------

FREEFORM_AI_COMPLETED_PROMPT = (
    "You will receive freeform information about a character or persona. The input may be "
    "detailed (with writing samples, background, etc.) or very brief (just a name or a short "
    "description). Regardless of how much is provided, write a complete, vivid 3-5 sentence "
    "role prompt that an LLM can use to convincingly embody this persona in a conversation.\n\n"
    "If the input is sparse, infer plausible personality traits, speech patterns, interests, "
    "and conversational style from whatever clues are available (the name, any title or "
    "occupation, context, etc.). Fill in realistic detail so the role prompt is rich and "
    "actionable — never produce a vague or skeletal prompt.\n\n"
    "Cover: personality, tone and speech patterns, background/expertise, interests and "
    "motivations, and how they would naturally interact in a casual conversation.\n\n"
    "The persona's name is: {name}\n\n"
    "Here is everything provided about this persona:\n"
    "---\n{text}\n---"
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
)


async def _call_llm(model_id: str, prompt_text: str) -> dict:
    resolved = settings.resolve_model(model_id)
    if not resolved:
        return {"role_prompt": "", "error": f"Unknown model: {model_id}"}

    messages = [
        {"role": "system", "content": (
            "You are a helpful assistant that creates character prompts. "
            "Respond ONLY with the finished role prompt text. Do NOT include your reasoning, "
            "thought process, analysis, draft notes, or any meta-commentary."
        )},
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
    }


async def generate_role_prompt(
    model_id: str,
    name: str,
    profile: str,
    identity: str,
    samples: str,
    role_style: str = "exact",
) -> dict:
    """Use the selected LLM to distill structured persona inputs into a role prompt."""
    template = STRUCTURED_AI_COMPLETED_PROMPT if role_style == "ai_completed" else STRUCTURED_EXACT_PROMPT
    prompt_text = template.format(
        name=name or "(not provided)",
        identity=identity or "(not provided)",
        profile=profile or "(not provided)",
        samples=samples or "(not provided)",
    )
    return await _call_llm(model_id, prompt_text)


async def generate_role_prompt_freeform(
    model_id: str,
    name: str,
    text: str,
    role_style: str = "ai_completed",
) -> dict:
    """Use the selected LLM to distill a single freeform text block into a role prompt."""
    template = FREEFORM_AI_COMPLETED_PROMPT if role_style == "ai_completed" else FREEFORM_EXACT_PROMPT
    prompt_text = template.format(
        name=name or "(not provided)",
        text=text or "(not provided)",
    )
    return await _call_llm(model_id, prompt_text)
