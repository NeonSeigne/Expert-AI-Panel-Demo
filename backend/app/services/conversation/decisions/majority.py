"""Majority-rules voting decision method.

Two voting modes, chosen automatically:

  * If the structure handed us a `main_motion` (Robert's Rules
    typically does), each participant votes aye/nay/abstain on it.
    Motion passes if ayes > nays.

  * Otherwise, the orchestrator clusters finalized positions into a
    small set of option labels (or uses `proposed_candidates` from
    the structure if present), and each participant votes for ONE
    option. Highest vote count wins.

A tie at the top is reported as a "no winner" outcome — we don't
auto-break ties because the user's design intent for majority rules
is "most votes wins, period".

Emits SSE events:
  * `status` — phase announcement and progress.
  * `vote_cast` — one per ballot.
  * `vote_tally` — final counts (so the frontend can render a chart).
  * `orchestrator` — the final report with `kind == "vote_result"`.
"""
from __future__ import annotations

from typing import Any, AsyncIterator

from app.services.conversation.decisions.base import DecisionMethod
from app.services.conversation.voting import (
    cast_vote_single,
    gather_votes_parallel,
    cast_vote_yesno,
    extract_candidate_options,
    tally_single_votes,
    tally_yesno_votes,
)
from app.services.models import Phase


class MajorityRulesDecision(DecisionMethod):
    NAME = "Majority Rules Voting"
    DESCRIPTION = (
        "Each participant votes for one option (or aye/nay on a "
        "motion). The choice with the most votes wins; ties are "
        "reported as no-winner."
    )

    async def run(self) -> AsyncIterator[str]:
        from app.services.orchestrator import (
            _sse,
            _add_orchestrator_message,
            _msg_payload,
        )

        session = self.session
        di = self.decision_input
        session.phase = Phase.VOTING
        yield _sse("status", {"message": "Phase 5: majority vote..."})

        # AI participants only — humans abstain in the automated path.
        voters = [p for p in di.participants if p.kind != "human"]
        if not voters:
            yield _sse("error", {"message": "No AI participants left to vote."})
            return

        if di.main_motion:
            async for chunk in self._run_motion_vote(voters, di.main_motion):
                yield chunk
            return

        # Plurality vote on derived candidates
        async for chunk in self._run_plurality_vote(voters):
            yield chunk

    async def _run_motion_vote(self, voters, motion: str) -> AsyncIterator[str]:
        from app.services.orchestrator import (
            _sse,
            _add_orchestrator_message,
            _msg_payload,
        )

        session = self.session
        announce_text = f"The motion on the floor is: \"{motion}\""
        msg = _add_orchestrator_message(
            session, announce_text, kind="motion", extra={"motion": motion},
        )
        yield _sse("orchestrator", _msg_payload(msg))

        ballots: list[dict[str, Any]] = []
        for p, result in await gather_votes_parallel(
            voters,
            cast_vote_yesno,
            session=session,
            default_mode="yesno",
            motion=motion,
        ):
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

        verdict = "PASSES" if tally["passes"] else (
            "FAILS" if tally["majority"] != "tie" else "is TIED (no winner)"
        )
        text = (
            f"The motion {verdict}.\n\n"
            f"Aye: {tally['aye']}    Nay: {tally['nay']}    "
            f"Abstain: {tally['abstain']}\n\n"
            f"Motion: {motion}"
        )
        session.final_report = {
            "kind": "vote_result",
            "text": text,
            "vote_kind": "yesno",
            "motion": motion,
            "tally": tally,
            "ballots": ballots,
        }
        msg = _add_orchestrator_message(
            session, text, kind="vote_result",
            extra={"vote_kind": "yesno", "tally": tally, "motion": motion},
        )
        yield _sse("orchestrator", _msg_payload(msg))

    async def _run_plurality_vote(self, voters) -> AsyncIterator[str]:
        from app.services.orchestrator import (
            _sse,
            _add_orchestrator_message,
            _msg_payload,
        )

        session = self.session
        di = self.decision_input

        # Use structure-proposed candidates if available; else derive.
        options = list(di.proposed_candidates or [])
        if not options:
            yield _sse("status", {"message": "Identifying voting options..."})
            options = await extract_candidate_options(
                session=session,
                question=di.question,
                positions=di.finalized_positions,
                participants=di.participants,
            )

        if len(options) < 2:
            yield _sse("error", {
                "message": "Not enough distinct positions to hold a vote.",
            })
            return

        options_label = "\n".join(f"  {i + 1}. {o}" for i, o in enumerate(options))
        announce = f"The following options are on the ballot:\n{options_label}"
        msg = _add_orchestrator_message(
            session, announce, kind="ballot_options",
            extra={"options": options},
        )
        yield _sse("orchestrator", _msg_payload(msg))

        ballots: list[dict[str, Any]] = []
        for p, result in await gather_votes_parallel(
            voters,
            cast_vote_single,
            session=session,
            default_mode="single",
            question=di.question,
            options=options,
        ):
            ballot = {
                "voter_id": p.participant_id,
                "voter_name": p.name,
                "choice": result.get("choice", 0),
                "reason": result.get("reason", ""),
                "ok": result.get("ok", False),
            }
            ballots.append(ballot)
            yield _sse("vote_cast", ballot)

        tally = tally_single_votes(ballots, len(options))
        yield _sse("vote_tally", {
            "kind": "plurality", "tally": tally, "options": options,
        })

        if tally["winner"] > 0:
            winner_text = options[tally["winner"] - 1]
            summary = (
                f"Winning option: \"{winner_text}\" "
                f"({tally['counts'][tally['winner'] - 1]} of "
                f"{tally['total_cast']} votes)"
            )
        elif tally["tied_for_first"]:
            tied_names = ", ".join(
                f"\"{options[i - 1]}\"" for i in tally["tied_for_first"]
            )
            summary = (
                f"Tied for first ({tally['counts'][tally['tied_for_first'][0] - 1]} votes each): "
                f"{tied_names}. No winner under majority-rules."
            )
        else:
            summary = "No votes were cast successfully — no winner."

        details = "\n".join(
            f"  - \"{opt}\": {tally['counts'][i]} vote(s)"
            for i, opt in enumerate(options)
        )
        text = f"{summary}\n\nFull tally:\n{details}"
        session.final_report = {
            "kind": "vote_result",
            "text": text,
            "vote_kind": "plurality",
            "options": options,
            "tally": tally,
            "ballots": ballots,
        }
        msg = _add_orchestrator_message(
            session, text, kind="vote_result",
            extra={
                "vote_kind": "plurality",
                "tally": tally,
                "options": options,
            },
        )
        yield _sse("orchestrator", _msg_payload(msg))
