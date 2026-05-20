"""Phase 3: orchestrator decides whether the conversation needs more
targeted follow-ups before moving to finalization.
"""

STATUS_ASSESSMENT_PROMPT = (
    "Below is the question being discussed, the current Credential Summary, "
    "and the conversation transcript through the critique rounds. Your job, "
    "as the orchestrator, is to decide whether the participants have "
    "solidified their opinions or whether there are still important open "
    "questions that warrant a targeted follow-up to specific participants "
    "before we move on to opinion finalization.\n\n"
    "Question:\n<<<\n{question}\n>>>\n\n"
    "Credential Summary:\n{credential_summary}\n\n"
    "Conversation so far:\n{transcript}\n\n"
    "Return JSON ONLY in this exact shape:\n"
    "{{\n"
    '  "opinions_solidified": <true|false>,\n'
    '  "open_questions": [\n'
    '    {{ "participant_id": "<participant_id>", "question": "<one direct question>" }}\n'
    "  ],\n"
    '  "notes": "<one short sentence on the discussion state>"\n'
    "}}\n\n"
    "If opinions are clearly solidified, return an empty open_questions list "
    "and opinions_solidified=true. Otherwise list 1-3 high-leverage "
    "questions, each aimed at one specific participant by participant_id. "
    "Each follow-up should target a real ambiguity or unresolved disagreement "
    "in the transcript - never invent topics that haven't come up. Output "
    "JSON only."
)

TARGETED_FOLLOWUP_PROMPT = (
    "The orchestrator has a follow-up question for you specifically.\n\n"
    "Conversation so far:\n{transcript}\n\n"
    "Credential Summary of the group:\n{credential_summary}\n\n"
    "Follow-up question for you: {targeted_question}\n\n"
    "Answer the question directly, in 3-6 sentences. You may reference "
    "other participants' statements by name. Stay in character."
)
