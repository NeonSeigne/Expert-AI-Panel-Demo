"""Phase 4: each participant either states a revised post-discussion
opinion or endorses another participant's revised opinion (with optional
added comment).
"""

FINALIZATION_PROMPT = (
    "Phase 4 of the discussion: Opinion Finalization.\n\n"
    "The question:\n<<<\n{question}\n>>>\n\n"
    "Credential Summary:\n{credential_summary}\n\n"
    "Full conversation so far:\n{transcript}\n\n"
    "Now, considering everything that has been said, state your post-"
    "discussion opinion. You have two options:\n\n"
    "  Option A - State your own revised opinion. If you have moved at all "
    "from your first opinion, say what changed and why.\n\n"
    "  Option B - Endorse another participant's revised opinion. Name the "
    "participant. Optionally add a sentence or two of your own (a caveat, "
    "an additional argument, a slight tweak).\n\n"
    "Begin your response with one of:\n"
    "  - \"My revised opinion:\" (if Option A)\n"
    "  - \"I agree with <participant name>:\" (if Option B)\n\n"
    "Keep the whole response under 10 sentences."
)
