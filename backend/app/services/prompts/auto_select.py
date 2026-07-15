"""Prompt for the optional "Select N Automatically" mode.

The user can enable an auto-select toggle in the participants dropdown;
when they start a chat, the orchestrator LLM ranks every available
candidate persona for relevance to the question and returns the top N.
"""

AUTO_SELECT_PARTICIPANTS_PROMPT = (
    "You are helping pick the most relevant participants for a Co-Panel "
    "group discussion. The user has asked the following question:\n\n"
    "<<<\n{question}\n>>>\n\n"
    "Here are the candidate participants. Each has a `participant_id`, "
    "a display `name`, and a role description (`role_prompt`).\n\n"
    "{candidates_block}\n\n"
    "Pick the {count} participants whose expertise and perspective are "
    "MOST relevant and complementary for this question. Aim for "
    "diversity of viewpoint as well as topical fit - a group of five "
    "experts who all think the same way is less useful than five who "
    "will productively disagree.\n\n"
    "Reply with ONLY a JSON object of the exact shape:\n"
    "{{\n"
    "  \"selected\": [\"participant_id_1\", \"participant_id_2\", ...],\n"
    "  \"rationale\": \"one short sentence explaining the mix\"\n"
    "}}\n\n"
    "`selected` MUST contain exactly {count} ids drawn ONLY from the "
    "candidate list above, in order of relevance (most relevant first). "
    "Do not invent ids."
)
