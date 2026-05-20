"""Phase 3: orchestrator decides whether the conversation needs more
targeted follow-ups before moving to finalization.

Hybrid behavior: prefer to surface UNANSWERED participant-to-participant
questions verbatim, attributed to whoever asked them. Only synthesize a
new question if no real open thread exists.
"""

STATUS_ASSESSMENT_PROMPT = (
    "Below is the question being discussed, the current Credential Summary, "
    "and the conversation transcript through the critique rounds. Your job, "
    "as the orchestrator, is to decide whether the participants have "
    "solidified their opinions or whether there are still important open "
    "questions that warrant a targeted follow-up to specific participants "
    "before we move on to opinion finalization.\n\n"
    "Question:\n<<<\n{question}\n>>>\n\n"
    "Credential Summary (each participant's id is shown):\n"
    "{credential_summary}\n\n"
    "Conversation so far:\n{transcript}\n\n"
    "PREFERENCE ORDER:\n"
    "1. PREFER surfacing UNANSWERED participant-to-participant questions "
    "verbatim. Scan the transcript for any question that one participant "
    "directed at another that the addressee never answered (or where the "
    "addressee replied but did not address that specific question). When "
    "you find one, surface it verbatim with verbatim=true and "
    "asker_participant_id set to whoever originally asked it.\n"
    "2. ONLY if no unanswered participant question exists, you may "
    "synthesize one targeted question yourself, with verbatim=false and "
    "asker_participant_id=null. Synthesized questions must target a real "
    "ambiguity or unresolved disagreement in the transcript - never "
    "invent topics that haven't come up.\n\n"
    "Return JSON ONLY in this exact shape:\n"
    "{{\n"
    '  "opinions_solidified": <true|false>,\n'
    '  "open_questions": [\n'
    "    {{\n"
    '      "participant_id": "<addressee participant_id>",\n'
    '      "question": "<the question text, verbatim if surfacing>",\n'
    '      "verbatim": <true|false>,\n'
    '      "asker_participant_id": "<asker participant_id, or null>"\n'
    "    }}\n"
    "  ],\n"
    '  "notes": "<one short sentence on the discussion state>"\n'
    "}}\n\n"
    "If opinions are clearly solidified, return an empty open_questions "
    "list and opinions_solidified=true. Otherwise list 1-3 high-leverage "
    "questions. Output JSON only."
)


# Used when the orchestrator is asking on its own initiative.
TARGETED_FOLLOWUP_PROMPT = (
    "The orchestrator has a follow-up question for you specifically.\n\n"
    "Conversation so far:\n{transcript}\n\n"
    "Credential Summary of the group:\n{credential_summary}\n\n"
    "Follow-up question for you: {targeted_question}\n\n"
    "Answer the question directly, in 3-6 sentences. You may reference "
    "other participants' statements by name. Stay in character."
)


# Used when the orchestrator is relaying a verbatim, previously-unanswered
# question from another participant. The participant is told who asked it
# so they can address that participant directly in their reply.
TARGETED_FOLLOWUP_FROM_PARTICIPANT_PROMPT = (
    "{asker_name} asked you a question earlier in the discussion that "
    "did not get answered. The orchestrator is surfacing it now so you "
    "can address it.\n\n"
    "Conversation so far:\n{transcript}\n\n"
    "Credential Summary of the group:\n{credential_summary}\n\n"
    "{asker_name}'s question to you: {targeted_question}\n\n"
    "Answer the question directly, in 3-6 sentences, addressing "
    "{asker_name} where appropriate. You may reference other participants "
    "by name. Stay in character."
)
