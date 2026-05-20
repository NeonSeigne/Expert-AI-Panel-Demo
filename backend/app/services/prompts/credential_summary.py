"""Credential Summary: the orchestrator's neutral assessment of each
participant's expertise, personality, and credibility on the question.

Built once after Phase 1 from each participant's role prompt + first
opinion. Refreshed once after Phase 2 critique because participants
reveal a lot more about themselves through critique than through their
opening pitch.
"""

CREDENTIAL_BUILD_PROMPT = (
    "Below is the question being discussed and, for each participant, "
    "their role prompt and their first opinion (Phase 1). Build a Credential "
    "Summary: a neutral, third-person assessment of each participant that "
    "any other participant could use to weight their statements.\n\n"
    "Question:\n<<<\n{question}\n>>>\n\n"
    "Participants:\n{participants_block}\n\n"
    "Return JSON ONLY in this exact shape:\n"
    "{{\n"
    '  "credentials": [\n'
    "    {{\n"
    '      "participant_id": "<participant_id>",\n'
    '      "name": "<participant_name>",\n'
    '      "expertise": "<1-2 sentences on what they know about and don\'t know about>",\n'
    '      "personality": "<1 sentence on debating style / temperament>",\n'
    '      "credibility_for_question": <number 0.0 to 1.0>,\n'
    '      "bias_to_watch": "<1 sentence on biases or blind spots>"\n'
    "    }}\n"
    "  ]\n"
    "}}\n\n"
    "credibility_for_question is YOUR neutral estimate of how much weight "
    "their voice should carry on THIS specific question, given their stated "
    "background and how they framed their first opinion. Use the full 0-1 "
    "scale; do not bunch everyone near the top. Do NOT favor or disfavor "
    "any participant. Output JSON only - no commentary, no markdown."
)

CREDENTIAL_REFRESH_PROMPT = (
    "Below is the original Credential Summary you produced after Phase 1. "
    "After two rounds of critique, the participants have revealed more "
    "about themselves. Update the Credential Summary if anything material "
    "changed: shifts in apparent expertise, observed reasoning quality, "
    "newly visible biases, or revised credibility for THIS question. Keep "
    "anything that's still accurate. Return JSON in the same shape as the "
    "input. JSON only.\n\n"
    "Question:\n<<<\n{question}\n>>>\n\n"
    "Original Credential Summary:\n{credential_summary_json}\n\n"
    "Critique-round transcript:\n{critique_transcript}"
)
