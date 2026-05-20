"""Phase 1: each participant offers an *independent* first opinion.

The orchestrator hides every other participant's response until the round
is finished, so first opinions are genuinely independent. That is what
makes the Credential Summary in the next step meaningful.
"""

INITIAL_OPINION_PROMPT = (
    "Phase 1 of the discussion: First Opinions.\n\n"
    "The group has been asked the following question:\n\n"
    "<<<\n{question}\n>>>\n\n"
    "You are speaking before any other participant has shared their view. "
    "Read the question carefully, consider it through the lens of who you "
    "are (your background, expertise, values, and personality), and offer "
    "your initial opinion.\n\n"
    "Your first opinion should:\n"
    "  1. Take a clear, specific position on the question.\n"
    "  2. Explain the 1-3 most important reasons behind your position, "
    "drawing on your particular background or expertise.\n"
    "  3. Acknowledge any uncertainty or trade-offs you see.\n\n"
    "Speak in the first person. Keep it focused: 4-8 sentences. Do not "
    "address other participants by name yet - you have not heard them "
    "speak."
)
