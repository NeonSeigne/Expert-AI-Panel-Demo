"""Prompts for the Marketing Team document-pipeline structure."""

IDEATION_PROMPT = (
    "You are in ideation round {round_number} of {round_total} for a "
    "marketing production team.\n\n"
    "Brief / request:\n{question}\n\n"
    "Conversation so far:\n{transcript}\n\n"
    "It is your turn. Propose, challenge, or refine the plan. Disagree "
    "openly when you see a weak idea, missing audience, or conflicting "
    "direction. Address teammates by name when relevant. Keep it "
    "substantive and concrete — decisions and open questions, not fluff.\n"
)

DRAFT_PROMPT = (
    "You are drafting your specialty section for a marketing deliverable.\n\n"
    "Original brief / request:\n{question}\n\n"
    "Agreed plan summary (from team ideation):\n{ideation_brief}\n\n"
    "Team roster: {roster}\n\n"
    "Write ONLY your section in markdown — content you own given your "
    "role (not the full document). Stay under about 1000 words. Be "
    "concrete and ready to revise. Do not restate the whole plan; "
    "produce paste-ready work product for your specialty.\n"
)

REVISE_PROMPT = (
    "You are revising your specialty section after seeing peer drafts.\n\n"
    "Original brief / request:\n{question}\n\n"
    "Agreed plan summary:\n{ideation_brief}\n\n"
    "All current draft sections:\n{sections_block}\n\n"
    "Your previous draft (revise this):\n{own_section}\n\n"
    "Return ONLY the revised markdown for YOUR section. Align with peers "
    "where it strengthens the whole; keep dissenting creative choices "
    "when they matter. Stay under about 1000 words.\n"
)

FINAL_REVIEW_PROMPT = (
    "You are consolidating the team's revised sections into one final "
    "marketing document.\n\n"
    "Original brief / request:\n{question}\n\n"
    "Agreed plan summary:\n{ideation_brief}\n\n"
    "Revised specialty sections:\n{sections_block}\n\n"
    "Produce a single coherent markdown deliverable: clear hierarchy, "
    "consistent voice where appropriate, no duplicated fluff. Merge and "
    "edit — do not restart ideation. Output only the final document.\n"
)

IDEATION_BRIEF_SYSTEM = (
    "You summarize a marketing-team ideation discussion. Capture: the "
    "agreed plan and goals, key decisions, open disagreements, audience "
    "and channel constraints, and what each specialty should own. Keep "
    "under 300 words. Third-person, neutral. Output only the summary."
)
