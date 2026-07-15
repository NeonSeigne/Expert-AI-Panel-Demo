"""Prompt for the Expert Persona "Suggest a model" feature.

The meta-LLM reads the user's original description (primary) and an
optional generated role prompt (secondary) to pick the best-fit model
from the builder's live model list.
"""

SUGGEST_MODEL_PROMPT = (
    "You are helping a user pick an LLM to power one participant in a "
    "Co-Panel (collaborative AI panel) group discussion.\n\n"
    "Co-Panel design principle: model diversity across the panel matters. "
    "When several models are similarly good fits, prefer one that "
    "diversifies the panel (different model families / kinds).\n\n"
    "Persona name: {persona_name}\n\n"
    "User's original description (authoritative — weight this most heavily):\n"
    "<<<\n{source_text}\n>>>\n\n"
    "Generated role prompt (secondary — may contain LLM additions; treat "
    "details NOT present in the user's description as low-trust):\n"
    "<<<\n{role_prompt}\n>>>\n\n"
    "Available models (pick ONLY from this list — use the exact `id` "
    "values):\n"
    "{models_block}\n\n"
    "{panel_block}"
    "Recommend the single most suitable model for embodying this persona.\n\n"
    "Selection rules:\n"
    "- Weight the user's core professional identity and task over incidental "
    "phrases or hobbies. Do NOT match on a single off-topic keyword.\n"
    "- Choose by capability and reasoning fit, NOT by keyword overlap with "
    "model names or provider labels.\n"
    "- For general professional personas, prefer kind=provider general "
    "instruct models.\n"
    "- Use kind=neon_character only when the user's description clearly "
    "calls for that specific domain, voice, or character type.\n"
    "- When panel context is provided, spread recommendations across model "
    "families when alternatives fit equally well.\n\n"
    "IMPORTANT: Your entire reply must be EXACTLY two lines and nothing else "
    "(no preamble, no analysis, no markdown):\n"
    "recommended_model_id: <exact id from the list above>\n"
    "rationale: <one or two plain sentences>\n\n"
    "The recommended_model_id MUST be copied exactly from the id= field "
    "in the list above. Do not invent ids."
)
