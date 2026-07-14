"""Ranked-choice (instant-runoff) voting decision method.

Each participant ranks ALL options. If an option holds >50% of
first-choice votes it wins immediately. Otherwise the option with
the fewest first-choice votes is eliminated and its voters'
next-still-eligible choices are redistributed; the process repeats
until a winner emerges or all remaining options tie at the bottom.

When the structure handed us a `main_motion` we still hold a ranked
vote, treating the motion text as Option 1 and the structure's
`proposed_candidates` (or derived clusters of finalized positions)
as the additional options. This is the user's "RR + RCV" combo: the
chair's motion is on the ballot but doesn't get a privileged spot.

Emits SSE events:
  * `status` for progress.
  * `vote_cast` per ballot (with the full ranking).
  * `vote_tally` with the per-round IRV breakdown.
  * `orchestrator` for the final report (`kind == "ranked_choice_result"`).
"""
from __future__ import annotations

from typing import Any, AsyncIterator

from app.services.conversation.decisions.base import DecisionMethod
from app.services.conversation.voting import (
    cast_vote_ranking,
    extract_candidate_options,
    gather_votes_parallel,
    run_irv,
)
from app.services.models import Phase


class RankedChoiceDecision(DecisionMethod):
    NAME = "Ranked Choice Voting"
    DESCRIPTION = (
        "Each participant ranks all options from most to least "
        "preferred. The winner is found by instant runoff: lowest "
        "first-choice option is dropped each round, votes "
        "redistribute, repeat until a majority emerges."
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
        yield _sse("status", {"message": "Phase 5: ranked-choice vote..."})

        voters = [p for p in di.participants if p.kind != "human"]
        if not voters:
            yield _sse("error", {"message": "No AI participants left to vote."})
            return

        options: list[str] = []
        if di.main_motion:
            options.append(di.main_motion)
        if di.proposed_candidates:
            for o in di.proposed_candidates:
                if o and o not in options:
                    options.append(o)
        if len(options) < 2:
            yield _sse("status", {"message": "Identifying voting options..."})
            derived = await extract_candidate_options(
                session=session, question=di.question,
                positions=di.finalized_positions,
                participants=di.participants,
            )
            for o in derived:
                if o and o not in options:
                    options.append(o)

        if len(options) < 2:
            yield _sse("error", {
                "message": "Not enough distinct positions for a ranked vote.",
            })
            return

        options_label = "\n".join(f"  {i + 1}. {o}" for i, o in enumerate(options))
        announce = (
            f"The following options will be ranked by each participant:\n"
            f"{options_label}"
        )
        msg = _add_orchestrator_message(
            session, announce, kind="ballot_options",
            extra={"options": options},
        )
        yield _sse("orchestrator", _msg_payload(msg))

        ballots: list[dict[str, Any]] = []
        rankings_only: list[list[int]] = []
        for p, result in await gather_votes_parallel(
            voters,
            cast_vote_ranking,
            session=session,
            default_mode="rank",
            question=di.question,
            options=options,
        ):
            ranking = result.get("ranking") or []
            ballots.append({
                "voter_id": p.participant_id,
                "voter_name": p.name,
                "ranking": ranking,
                "reason": result.get("reason", ""),
                "ok": result.get("ok", False),
            })
            rankings_only.append(list(ranking))
            yield _sse("vote_cast", {
                "voter_id": p.participant_id,
                "voter_name": p.name,
                "ranking": ranking,
                "reason": result.get("reason", ""),
                "ok": result.get("ok", False),
            })

        irv = run_irv(rankings_only, len(options))
        yield _sse("vote_tally", {
            "kind": "ranked_choice",
            "options": options,
            "irv": irv,
        })

        if irv["winner"] > 0:
            winner_text = options[irv["winner"] - 1]
            summary = (
                f"Winning option: \"{winner_text}\" "
                f"({len(irv['rounds'])} round(s) of instant runoff)."
            )
        elif irv.get("tied"):
            summary = (
                "All remaining options tied at the bottom of the final "
                "round — no winner under ranked-choice."
            )
        else:
            summary = (
                "No valid ballots — no winner. (LLM voters may have "
                "returned malformed rankings.)"
            )

        rounds_block = []
        for r in irv["rounds"]:
            line_counts = ", ".join(
                f"\"{options[opt - 1]}\": {c}"
                for opt, c in sorted(r["counts"].items())
            )
            line = f"  Round {r['round']}: {line_counts}"
            if r.get("eliminated"):
                line += f"  → eliminated \"{options[r['eliminated'] - 1]}\""
            if r.get("winner"):
                line += f"  → WINNER \"{options[r['winner'] - 1]}\""
            rounds_block.append(line)

        text = (
            f"{summary}\n\nInstant-runoff rounds:\n" + "\n".join(rounds_block)
        )
        session.final_report = {
            "kind": "ranked_choice_result",
            "text": text,
            "options": options,
            "irv": irv,
            "ballots": ballots,
        }
        msg = _add_orchestrator_message(
            session, text, kind="ranked_choice_result",
            extra={"options": options, "irv": irv, "ballots": ballots},
        )
        yield _sse("orchestrator", _msg_payload(msg))
