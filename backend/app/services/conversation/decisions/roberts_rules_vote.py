"""Robert's Rules vote — aye/nay/abstain on the main motion.

Functionally identical to MajorityRulesDecision's motion-vote path,
but presented with Robert's Rules phrasing ("The chair calls for the
vote on the main motion...") so the conversation reads cleanly when
the user pairs it with RobertsRulesDiscussion. It's still a separate
plugin so the registry can list it as a first-class choice and the
frontend picker can label it accordingly.

If invoked WITHOUT a `main_motion` (e.g. the user paired this
decision method with the Collaborative structure), we synthesize a
motion from the finalized positions and put that on the floor —
giving sensible behavior across all structure / decision pairings.
"""
from __future__ import annotations

from typing import Any, AsyncIterator

from app.services.conversation.decisions.base import DecisionMethod
from app.services.conversation.voting import (
    cast_vote_yesno,
    tally_yesno_votes,
)
from app.services.json_calls import orchestrator_call
from app.services.models import Phase


SYNTHESIZE_MOTION_PROMPT = """You are acting as the chair of a meeting.

The body has been discussing the following question:
  {question}

The participants' final positions are:
{positions_block}

As chair, propose a single concrete motion that captures the most \
widely-supported position. Phrase it as a complete sentence starting \
with "Resolved, that" or "I move that".

Return ONLY this JSON (no prose, no fences):
{{
  "motion": "..."
}}
"""


class RobertsRulesVote(DecisionMethod):
    NAME = "Robert's Rules Vote"
    DESCRIPTION = (
        "The chair puts the main motion to the assembly. Each "
        "member casts aye, nay, or abstain. Motion passes on simple "
        "majority of those voting."
    )

    async def run(self) -> AsyncIterator[str]:
        from app.services.orchestrator import (
            _sse,
            _add_orchestrator_message,
            _msg_payload,
            _orchestrator_model_id,
            _bump_orchestrator_count,
            _format_history,
        )

        session = self.session
        di = self.decision_input
        session.phase = Phase.VOTING
        yield _sse("status", {"message": "Phase 5: Robert's Rules vote..."})

        voters = [p for p in di.participants if p.kind != "human"]
        if not voters:
            yield _sse("error", {"message": "No AI members present to vote."})
            return

        motion = (di.main_motion or "").strip()
        if not motion:
            # Synthesize a motion from finalized positions.
            from app.services.conversation.voting import _format_positions_block
            yield _sse("status", {"message": "Chair: drafting a motion..."})
            prompt = SYNTHESIZE_MOTION_PROMPT.format(
                question=di.question,
                positions_block=_format_positions_block(
                    di.finalized_positions, di.participants,
                ),
            )
            _, parsed = await orchestrator_call(
                orchestrator_model_id=_orchestrator_model_id(session),
                user_prompt=prompt,
                label="rr_synthesize_motion",
                api_log=session.api_log,
                expect_json=True,
                max_tokens=400,
                temperature=0.3,
            )
            _bump_orchestrator_count(session)
            if isinstance(parsed, dict):
                motion = str(parsed.get("motion") or "").strip()
            if not motion:
                motion = (
                    "Resolved, that the assembly accepts the consensus "
                    "view reflected by the majority of stated positions."
                )
            session.main_motion = motion

        announce = (
            "The chair puts the following motion before the assembly:\n\n"
            f"\"{motion}\"\n\n"
            "The chair calls for the vote. Members will say aye, nay, "
            "or abstain."
        )
        msg = _add_orchestrator_message(
            session, announce, kind="motion", extra={"motion": motion},
        )
        yield _sse("orchestrator", _msg_payload(msg))

        ballots: list[dict[str, Any]] = []
        for p in voters:
            result = await cast_vote_yesno(
                session=session, participant=p, motion=motion,
            )
            ballot = {
                "voter_id": p.participant_id,
                "voter_name": p.name,
                "vote": result.get("vote", ""),
                "reason": result.get("reason", ""),
                "ok": result.get("ok", False),
            }
            ballots.append(ballot)
            yield _sse("vote_cast", ballot)

        tally = tally_yesno_votes(ballots)
        yield _sse("vote_tally", {"kind": "yesno", "tally": tally})

        if tally["passes"]:
            verdict = "The motion is carried."
        elif tally["majority"] == "nay":
            verdict = "The motion is lost."
        else:
            verdict = "The motion is tied; the chair declares it lost."

        text = (
            f"{verdict}\n\n"
            f"Aye: {tally['aye']}    Nay: {tally['nay']}    "
            f"Abstain: {tally['abstain']}\n\n"
            f"Motion: \"{motion}\""
        )
        session.final_report = {
            "kind": "vote_result",
            "text": text,
            "vote_kind": "yesno",
            "motion": motion,
            "tally": tally,
            "ballots": ballots,
            "flavor": "roberts_rules",
        }
        msg = _add_orchestrator_message(
            session, text, kind="vote_result",
            extra={
                "vote_kind": "yesno", "tally": tally, "motion": motion,
                "flavor": "roberts_rules",
            },
        )
        yield _sse("orchestrator", _msg_payload(msg))
