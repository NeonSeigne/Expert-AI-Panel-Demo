"""Phase 6: closure prompts (majority report, unaddressed-factor probe,
no-consensus failure report, and per-participant contribution summaries
used by the table view).
"""

UNADDRESSED_FACTOR_PROMPT = (
    "The discussion has stalled in the consensus-gathering phase. As the "
    "neutral orchestrator, review the conversation and the Credential "
    "Summary. Identify ONE important factor that has not been adequately "
    "discussed and that is likely to shift the opinion of at least one "
    "current participant if surfaced.\n\n"
    "Question:\n<<<\n{question}\n>>>\n\n"
    "Credential Summary:\n{credential_summary}\n\n"
    "Conversation so far:\n{transcript}\n\n"
    "Return JSON ONLY in this exact shape:\n"
    "{{\n"
    '  "factor": "<one short paragraph framing the factor as a question or consideration the group should now address>",\n'
    '  "expected_to_shift": ["<participant_id>", "..."]\n'
    "}}\n\n"
    "The factor must be a real consideration that genuinely hasn't been "
    "raised - not a rephrasing of what was already said. Output JSON only."
)

MAJORITY_REPORT_PROMPT = (
    "The group has reached majority agreement in the discussion. As the "
    "neutral orchestrator, produce a clear final report for the user who "
    "asked the original question.\n\n"
    "Question:\n<<<\n{question}\n>>>\n\n"
    "Credential Summary (with credibility_for_question scores):\n{credential_summary}\n\n"
    "Majority alliance: members={majority_members}, stance=\"{majority_stance}\".\n\n"
    "Full conversation:\n{transcript}\n\n"
    "Write the report as plain prose (no markdown headers required) covering:\n"
    "  1. The decision the group reached, in one or two clear sentences.\n"
    "  2. The strongest reasons the majority gave.\n"
    "  3. Important dissenting points raised by participants whose "
    "credibility_for_question >= 0.6 - quote or paraphrase them by name. "
    "Skip dissent from participants with credibility below 0.6.\n"
    "  4. Caveats or open questions worth flagging for the user.\n\n"
    "Stay neutral. Do not editorialize beyond what the participants said. "
    "Keep the whole report under ~250 words."
)

NO_CONSENSUS_REPORT_PROMPT = (
    "The group has tried twice to reach consensus and has not succeeded. "
    "As the neutral orchestrator, produce a final report for the user who "
    "asked the original question.\n\n"
    "Question:\n<<<\n{question}\n>>>\n\n"
    "Credential Summary:\n{credential_summary}\n\n"
    "Final alliance groups:\n{alliance_block}\n\n"
    "Full conversation:\n{transcript}\n\n"
    "Write the report as plain prose covering:\n"
    "  1. A short statement that the group did not reach consensus.\n"
    "  2. Each major opinion that emerged, who supported it (by name), "
    "and the strongest reason given for it.\n"
    "  3. Your own neutral recommendation for the most defensible position, "
    "based purely on the strength of the arguments and the credibility_for_"
    "question scores - not your own opinion. Make clear this is a "
    "recommendation, not a decision.\n"
    "  4. A brief suggestion that the user weigh these and make their own "
    "decision.\n\n"
    "Stay neutral. Keep the report under ~300 words."
)

CONTRIBUTION_SUMMARY_PROMPT = (
    "Below is the full transcript of a multi-participant discussion. For "
    "each listed participant, write a 2-3 sentence neutral summary of "
    "their overall contribution: the position they took, how it evolved, "
    "and the strongest argument they made. Do not editorialize. Do not "
    "rank or grade them.\n\n"
    "Participants:\n{roster_block}\n\n"
    "Transcript:\n{transcript}\n\n"
    "Return JSON ONLY in this exact shape:\n"
    "{{\n"
    '  "contributions": [\n'
    '    {{ "participant_id": "<id>", "summary": "<2-3 sentences>" }}\n'
    "  ]\n"
    "}}\n\n"
    "Output JSON only."
)
