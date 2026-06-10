"""Credential Summary: the orchestrator's neutral assessment of each
participant's expertise, personality, and credibility on the question.

Each LLM participant's entry is built concurrently during Phase 1 (as
their initial opinion lands). Entries are only rebuilt if the backing
LLM model behind that participant changes.
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

HUMAN_CREDENTIAL_FROM_PROFILE_PROMPT = (
    "A human participant is joining a group discussion. Their "
    "self-description below is equivalent to an LLM participant's role "
    "prompt — use it as the sole source of background (they have not "
    "spoken in the discussion yet). Build a Credential Summary entry: "
    "a neutral, third-person assessment that any other participant could "
    "use to weight their statements.\n\n"
    "{question_block}"
    "Name: {name}\n"
    "Self-description:\n<<<\n{profile_text}\n>>>\n\n"
    "Return JSON ONLY in this exact shape:\n"
    "{{\n"
    '  "credential": {{\n'
    '    "name": "{name}",\n'
    '    "expertise": "<1-2 sentences on what they know about and don\'t know about>",\n'
    '    "personality": "<1 sentence on debating style / temperament>",\n'
    '    "credibility_for_question": <number 0.0 to 1.0>,\n'
    '    "bias_to_watch": "<1 sentence on biases or blind spots>"\n'
    "  }}\n"
    "}}\n\n"
    "credibility_for_question is YOUR neutral estimate of how much weight "
    "their voice should carry on THIS specific question, given their "
    "self-description and the question topic. Use the full 0-1 scale. "
    "Output JSON only — no commentary, no markdown."
)

SINGLE_PARTICIPANT_CREDENTIAL_BUILD_PROMPT = (
    "Below is the question being discussed and, for one participant, "
    "their role prompt and their first opinion (Phase 1). Build ONE "
    "Credential Summary entry: a neutral, third-person assessment that "
    "any other participant could use to weight their statements.\n\n"
    "Question:\n<<<\n{question}\n>>>\n\n"
    "Participant id: {participant_id}\n"
    "Name: {name}\n"
    "Role prompt:\n<<<\n{role_prompt}\n>>>\n"
    "First opinion:\n<<<\n{first_opinion}\n>>>\n\n"
    "Return JSON ONLY in this exact shape:\n"
    "{{\n"
    '  "credential": {{\n'
    '    "participant_id": "{participant_id}",\n'
    '    "name": "{name}",\n'
    '    "expertise": "<1-2 sentences on what they know about and don\'t know about>",\n'
    '    "personality": "<1 sentence on debating style / temperament>",\n'
    '    "credibility_for_question": <number 0.0 to 1.0>,\n'
    '    "bias_to_watch": "<1 sentence on biases or blind spots>"\n'
    "  }}\n"
    "}}\n\n"
    "credibility_for_question is YOUR neutral estimate of how much weight "
    "their voice should carry on THIS specific question, given their stated "
    "background and how they framed their first opinion. Use the full 0-1 "
    "scale. Output JSON only — no commentary, no markdown."
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
