"""Per-phase prompt templates for the CCAI orchestrator.

Each phase's templates live in their own file so prompt iteration doesn't
churn the state machine in `orchestrator.py`. All templates here are pure
strings; they're formatted and combined in `orchestrator.py`.
"""

from app.services.prompts.directives import (
    PARTICIPANT_BASE_DIRECTIVE,
    NO_REASONING_DIRECTIVE,
    ORCHESTRATOR_BASE_DIRECTIVE,
)
from app.services.prompts.initial_opinions import INITIAL_OPINION_PROMPT
from app.services.prompts.credential_summary import (
    CREDENTIAL_BUILD_PROMPT,
    CREDENTIAL_REFRESH_PROMPT,
)
from app.services.prompts.critique import CRITIQUE_PROMPT
from app.services.prompts.status_assessment import (
    STATUS_ASSESSMENT_PROMPT,
    TARGETED_FOLLOWUP_PROMPT,
    TARGETED_FOLLOWUP_FROM_PARTICIPANT_PROMPT,
)
from app.services.prompts.finalization import FINALIZATION_PROMPT
from app.services.prompts.consensus import (
    ALLIANCE_DETECTION_PROMPT,
    ADDRESSED_TO_PROMPT,
    CONSENSUS_ALLIED_PROMPT,
    CONSENSUS_SOLO_PROMPT,
    CONSENSUS_STATUS_PROMPT,
)
from app.services.prompts.closure import (
    UNADDRESSED_FACTOR_PROMPT,
    MAJORITY_REPORT_PROMPT,
    NO_CONSENSUS_REPORT_PROMPT,
    CONTRIBUTION_SUMMARY_PROMPT,
)

__all__ = [
    "PARTICIPANT_BASE_DIRECTIVE",
    "NO_REASONING_DIRECTIVE",
    "ORCHESTRATOR_BASE_DIRECTIVE",
    "INITIAL_OPINION_PROMPT",
    "CREDENTIAL_BUILD_PROMPT",
    "CREDENTIAL_REFRESH_PROMPT",
    "CRITIQUE_PROMPT",
    "STATUS_ASSESSMENT_PROMPT",
    "TARGETED_FOLLOWUP_PROMPT",
    "TARGETED_FOLLOWUP_FROM_PARTICIPANT_PROMPT",
    "FINALIZATION_PROMPT",
    "ALLIANCE_DETECTION_PROMPT",
    "ADDRESSED_TO_PROMPT",
    "CONSENSUS_ALLIED_PROMPT",
    "CONSENSUS_SOLO_PROMPT",
    "CONSENSUS_STATUS_PROMPT",
    "UNADDRESSED_FACTOR_PROMPT",
    "MAJORITY_REPORT_PROMPT",
    "NO_CONSENSUS_REPORT_PROMPT",
    "CONTRIBUTION_SUMMARY_PROMPT",
]
