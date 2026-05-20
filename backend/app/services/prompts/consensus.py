"""Phase 5: consensus-gathering prompts.

The orchestrator detects "alliance groups" of participants with similar
revised opinions, then nudges them toward a group decision. Allied
participants are prompted to argue and recruit; solo participants are
prompted to seek allies, switch, or propose compromises.
"""

ALLIANCE_DETECTION_PROMPT = (
    "Below are each participant's revised opinions from the finalization "
    "phase. Your job, as the orchestrator, is to cluster them into "
    "alliance groups: sets of participants whose opinions are similar "
    "enough that they would naturally team up in a real meeting.\n\n"
    "Question:\n<<<\n{question}\n>>>\n\n"
    "Revised opinions:\n{finalization_block}\n\n"
    "Return JSON ONLY in this exact shape:\n"
    "{{\n"
    '  "groups": [\n'
    "    {{\n"
    '      "stance": "<one short sentence describing the shared position>",\n'
    '      "members": ["<participant_id>", "..."]\n'
    "    }}\n"
    "  ]\n"
    "}}\n\n"
    "Every participant must appear in exactly one group. Solo participants "
    "(no allies) get their own single-member group. Output JSON only."
)

ADDRESSED_TO_PROMPT = (
    "Below is the most recent message in a multi-participant discussion. "
    "Decide whether it is primarily aimed at one specific other participant "
    "(e.g. challenging them, asking them a question, calling on them to "
    "respond), or whether it is a broadcast to the whole group.\n\n"
    "Available participants and their ids:\n{roster_block}\n\n"
    "Speaker: {speaker}\n"
    "Message: {message}\n\n"
    "Return JSON ONLY: {{\"addressed_to\": \"<participant_id or null>\"}}. "
    "Use the literal JSON null (no quotes) when no specific addressee is "
    "obvious. Output JSON only."
)

CONSENSUS_ALLIED_PROMPT = (
    "Phase 5 of the discussion: Consensus Gathering.\n\n"
    "The orchestrator has clustered the group into alliances based on the "
    "revised opinions. You are part of an alliance with: {alliance_members}. "
    "Your shared stance: \"{alliance_stance}\".\n\n"
    "Other groups currently disagree. Your job, in 4-8 sentences, is to "
    "advocate for your alliance's position and try to win over participants "
    "from other groups. Strategies that work in real human meetings:\n"
    "  - Counter the main points of contrasting opinions with concrete facts "
    "or arguments (cite specific things others said).\n"
    "  - Reinforce your own side's main points with additional supporting "
    "facts or by emphasizing the credibility of an ally on this topic.\n"
    "  - Address specific participants by name when challenging or inviting "
    "them.\n\n"
    "Question:\n<<<\n{question}\n>>>\n\n"
    "Credential Summary:\n{credential_summary}\n\n"
    "Conversation so far:\n{transcript}"
)

CONSENSUS_SOLO_PROMPT = (
    "Phase 5 of the discussion: Consensus Gathering.\n\n"
    "Right now you are the sole holder of your stance: \"{your_stance}\". "
    "The other groups are: {other_groups_block}. In a real human meeting, "
    "someone in your position has three good options - pick whichever fits "
    "your character and what's been said:\n"
    "  1. Pick the existing group whose stance is closest to yours and try "
    "to get them to shift toward your view.\n"
    "  2. Switch your support to whichever group's stance you can honestly "
    "live with, naming them and explaining why.\n"
    "  3. Propose a compromise position that both you and at least one "
    "other group might find acceptable.\n\n"
    "Respond in 4-8 sentences. Address other participants by name when "
    "doing so makes sense. Stay in character.\n\n"
    "Question:\n<<<\n{question}\n>>>\n\n"
    "Credential Summary:\n{credential_summary}\n\n"
    "Conversation so far:\n{transcript}"
)

CONSENSUS_TARGETED_RESPONSE_PROMPT = (
    "Phase 5 of the discussion: Consensus Gathering.\n\n"
    "{addressed_by_name} just spoke and aimed their message at you "
    "specifically. The orchestrator is giving you the floor to respond.\n\n"
    "Their message: \"{addressed_message}\"\n\n"
    "Question:\n<<<\n{question}\n>>>\n\n"
    "Credential Summary:\n{credential_summary}\n\n"
    "Conversation so far:\n{transcript}\n\n"
    "Respond directly to {addressed_by_name} in 3-7 sentences. You may "
    "concede a point, push back with a counter-argument, ask a clarifying "
    "question, or propose a compromise. Stay in character."
)

CONSENSUS_STATUS_PROMPT = (
    "Below is the discussion through the consensus-gathering phase so far. "
    "As the orchestrator, decide whether (a) a majority has reached "
    "agreement, (b) opinions are still actively shifting in a productive "
    "direction, or (c) opinions have stopped shifting and the conversation "
    "is no longer productive.\n\n"
    "Question:\n<<<\n{question}\n>>>\n\n"
    "Latest alliance groups:\n{alliance_block}\n\n"
    "Conversation so far:\n{transcript}\n\n"
    "Return JSON ONLY in this exact shape:\n"
    "{{\n"
    '  "status": "<majority|productive|unproductive>",\n'
    '  "majority_group_index": <integer index into alliance_groups, or null>,\n'
    '  "rationale": "<one short sentence>"\n'
    "}}\n\n"
    "Use \"majority\" only if more than half of all participants now share a "
    "single stance. Use \"unproductive\" only if the last few exchanges "
    "have been repetitive or the participants are clearly entrenched. Output "
    "JSON only."
)
