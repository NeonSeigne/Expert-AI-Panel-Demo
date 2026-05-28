"""Robert's Rules of Order — chair-mediated parliamentary discussion.

The classical RR flow, condensed for an LLM forum:

  RR-1 OPENING: the chair (orchestrator) calls the meeting to order
       and reads the question.

  RR-2 INITIAL REMARKS: each member is recognized in roster order
       and briefly states their position (a few sentences). This
       mirrors Phase 1 of the Collaborative structure but with chair
       framing. We also build the credential summary here so the
       same downstream tooling (View Credential Summary, etc.) works.

  RR-3 MOTION: the chair synthesizes a main motion from the initial
       remarks and asks for a second. Members who aren't the
       motion-maker are polled briefly for a "second" / "no second";
       the first agreement carries.

  RR-4 DEBATE: configurable number of rounds (defaults to
       `limits.critique_rounds`). Each member speaks in turn, must
       address the motion (support / oppose / amend / propose
       alternative), and may name other members. Each member's last
       remark in the debate is captured as their finalized position
       so the decision phase has the standardized hand-off it needs.

  RR-5 MOVE THE QUESTION: the chair declares debate closed and
       hands off to the decision method (typically RobertsRulesVote
       but any decision method is compatible).

The structure is deliberately self-contained — none of the
Collaborative phase functions are reused — so future RR features
(amendments, points of order, etc.) can be added without
entangling the original CCAI flow.
"""
from __future__ import annotations

from typing import Any, AsyncIterator

from app.services.conversation.structures.base import ConversationStructure
from app.services.conversation.types import DecisionInput
from app.services.credential import build_credential_summary
from app.services.json_calls import orchestrator_call
from app.services.models import Participant, Phase
from app.services.resilience import run_resilient_turn


RR_OPENING_TEMPLATE = (
    "The meeting is called to order. The chair reads the question "
    "before the assembly:\n\n"
    "  {question}\n\n"
    "The chair will recognize each member in turn for opening "
    "remarks, after which the floor will be open for motions."
)


RR_INITIAL_REMARKS_PROMPT = """The chair has called the meeting to order and read \
the following question:

  {question}

You are {speaker_name}. The chair recognizes you for opening remarks. \
Briefly state your position on the question in two or three sentences. \
Speak as a member of a deliberative assembly — formal but not stiff. \
Do not yet make a formal motion; that will come later.
"""


RR_MOTION_SYNTHESIS_PROMPT = """You are the chair of a meeting governed by \
Robert's Rules of Order. The following members have just given their \
opening remarks on this question:

  Question: {question}

Opening remarks:
{remarks_block}

Synthesize ONE concrete motion that reflects the most strongly-supported \
position. Also identify which member is most likely to formally make \
this motion (the "mover") based on their remarks, and which other \
member is most likely to second it.

Return ONLY this JSON (no prose, no fences):
{{
  "motion": "Resolved, that ...",
  "mover_id": "<participant_id>",
  "seconder_id": "<participant_id>"
}}
"""


RR_DEBATE_PROMPT = """You are {speaker_name}, a member of an assembly \
governed by Robert's Rules of Order. The main motion on the floor is:

  Motion: {motion}

This is debate round {round_n} of {round_total}. The chair has \
recognized you. Speak to the motion: support it, oppose it, propose \
an amendment, or offer a substitute. Be specific. You may address \
other members by name.

Question under consideration: {question}

Debate so far:
{transcript}
"""


class RobertsRulesDiscussion(ConversationStructure):
    NAME = "Robert's Rules of Order"
    DESCRIPTION = (
        "Chair-mediated parliamentary debate: opening remarks, the "
        "chair synthesizes a main motion and finds a seconder, "
        "members debate the motion in turn, then the chair calls "
        "for the vote."
    )

    async def run(self) -> AsyncIterator[str]:
        # Imports are local to avoid pulling the orchestrator module
        # at package-import time (orchestrator.py itself imports the
        # conversation package via the dispatcher path).
        from app.services.orchestrator import (
            _sse,
            _active_participants,
            _add_orchestrator_message,
            _add_participant_message,
            _bump_orchestrator_count,
            _call_participant,
            _format_history,
            _msg_payload,
            _orchestrator_model_id,
            _participant_msg_cap_hit,
            _wait_for_continue,
        )

        session = self.session
        actives = _active_participants(session)
        if len(actives) < 2:
            yield _sse("error", {"message": "Robert's Rules needs at least 2 members."})
            return

        # ---- RR-1: Opening -------------------------------------------------
        session.phase = Phase.RR_OPENING
        yield _sse("status", {"message": "RR-1: chair calls the meeting to order..."})
        opening_text = RR_OPENING_TEMPLATE.format(question=session.question)
        msg = _add_orchestrator_message(
            session, opening_text, kind="rr_opening",
            extra={"question": session.question},
        )
        yield _sse("orchestrator", _msg_payload(msg))

        # ---- RR-2: Initial Remarks ----------------------------------------
        session.phase = Phase.RR_INITIAL_REMARKS
        yield _sse("status", {"message": "RR-2: opening remarks..."})
        remarks: dict[str, str] = {}
        for p in _active_participants(session):
            if p.kind == "human":
                # For now humans skip remarks under RR; a future pass
                # can pause for input via human_io.
                continue
            prompt = RR_INITIAL_REMARKS_PROMPT.format(
                question=session.question,
                speaker_name=p.name,
            )
            turn = await run_resilient_turn(
                session=session, participant=p,
                user_prompt=prompt,
                label="rr_initial_remarks",
                max_tokens=400,
                call_participant=_call_participant,
            )
            for ev in turn.sse_events:
                yield ev
            if not turn.ok:
                yield _sse("participant_error", {
                    "participant_id": p.participant_id,
                    "name": p.name,
                    "phase": session.phase.value,
                })
                if p.consecutive_failures >= session.limits.auto_disable_failures:
                    p.enabled = False
                continue
            speaker = turn.speaker
            msg = _add_participant_message(
                session, speaker, turn.text,
                phase=session.phase, elapsed=turn.elapsed,
            )
            remarks[speaker.participant_id] = turn.text
            session.initial_opinions[speaker.participant_id] = turn.text
            yield _sse("message", _msg_payload(msg))
            if _participant_msg_cap_hit(session):
                async for chunk in _wait_for_continue(session, "messages"):
                    yield chunk

        # Credential summary — mirrors Phase 1 of Collaborative so the
        # rest of the app (View Credential Summary, etc.) stays happy.
        yield _sse("status", {"message": "Building Credential Summary..."})
        creds = await build_credential_summary(
            orchestrator_model_id=_orchestrator_model_id(session),
            question=session.question,
            participants=_active_participants(session),
            initial_opinions=session.initial_opinions,
            api_log=session.api_log,
            human_credential=session.human_credential,
        )
        _bump_orchestrator_count(session)
        session.credential_summary = creds
        yield _sse("credentials_updated", {
            "stage": "built",
            "credentials": session.credential_summary,
        })

        # ---- RR-3: Motion --------------------------------------------------
        session.phase = Phase.RR_MOTION
        yield _sse("status", {"message": "RR-3: chair invites a motion..."})

        remarks_block = "\n".join(
            f"- {p.name}: {remarks.get(p.participant_id, '(no remarks)')}"
            for p in _active_participants(session)
        )
        _, parsed = await orchestrator_call(
            orchestrator_model_id=_orchestrator_model_id(session),
            user_prompt=RR_MOTION_SYNTHESIS_PROMPT.format(
                question=session.question, remarks_block=remarks_block,
            ),
            label="rr_motion_synthesis",
            api_log=session.api_log,
            expect_json=True,
            max_tokens=500,
            temperature=0.3,
        )
        _bump_orchestrator_count(session)

        motion = ""
        mover_id = ""
        seconder_id = ""
        if isinstance(parsed, dict):
            motion = str(parsed.get("motion") or "").strip()
            mover_id = str(parsed.get("mover_id") or "").strip()
            seconder_id = str(parsed.get("seconder_id") or "").strip()
        if not motion:
            motion = (
                "Resolved, that the assembly endorses the position most "
                "broadly reflected in opening remarks."
            )
        session.main_motion = motion
        session.proposed_motions.append({
            "motion": motion,
            "mover_id": mover_id,
            "seconder_id": seconder_id,
        })

        by_id = {p.participant_id: p for p in _active_participants(session)}
        mover = by_id.get(mover_id)
        seconder = by_id.get(seconder_id)
        # Fallbacks if the chair's id picks don't match the roster
        if not mover:
            ai_members = [p for p in _active_participants(session) if p.kind != "human"]
            mover = ai_members[0] if ai_members else None
        if not seconder:
            ai_members = [
                p for p in _active_participants(session)
                if p.kind != "human" and mover and p.participant_id != mover.participant_id
            ]
            seconder = ai_members[0] if ai_members else None

        motion_announce = (
            f"The chair recognizes {mover.name if mover else 'the floor'} "
            f"to make a motion:\n\n"
            f"  \"{motion}\"\n\n"
            + (f"{seconder.name} seconds the motion. " if seconder else "")
            + "The motion is on the floor. Debate is open."
        )
        msg = _add_orchestrator_message(
            session, motion_announce, kind="motion",
            extra={
                "motion": motion,
                "mover_id": mover.participant_id if mover else "",
                "seconder_id": seconder.participant_id if seconder else "",
            },
        )
        yield _sse("orchestrator", _msg_payload(msg))

        # ---- RR-4: Debate --------------------------------------------------
        session.phase = Phase.RR_DEBATE
        debate_rounds = max(1, session.limits.critique_rounds)
        last_remark_per_member: dict[str, str] = dict(remarks)

        for round_n in range(1, debate_rounds + 1):
            yield _sse("status", {
                "message": f"RR-4: debate round {round_n} of {debate_rounds}...",
            })
            for p in _active_participants(session):
                if p.kind == "human":
                    continue
                prompt = RR_DEBATE_PROMPT.format(
                    speaker_name=p.name,
                    motion=motion,
                    round_n=round_n,
                    round_total=debate_rounds,
                    question=session.question,
                    transcript=_format_history(session.messages),
                )
                turn = await run_resilient_turn(
                    session=session, participant=p,
                    user_prompt=prompt,
                    label=f"rr_debate_round_{round_n}",
                    max_tokens=600,
                    call_participant=_call_participant,
                )
                for ev in turn.sse_events:
                    yield ev
                if not turn.ok:
                    yield _sse("participant_error", {
                        "participant_id": p.participant_id,
                        "name": p.name,
                        "phase": session.phase.value,
                    })
                    if p.consecutive_failures >= session.limits.auto_disable_failures:
                        p.enabled = False
                    continue
                speaker = turn.speaker
                msg = _add_participant_message(
                    session, speaker, turn.text,
                    phase=session.phase, elapsed=turn.elapsed,
                )
                last_remark_per_member[speaker.participant_id] = turn.text
                yield _sse("message", _msg_payload(msg))
                if _participant_msg_cap_hit(session):
                    async for chunk in _wait_for_continue(session, "messages"):
                        yield chunk

        # Final positions = last thing each member said in debate. This
        # is what we hand off to the decision phase via DecisionInput.
        session.final_opinions = dict(last_remark_per_member)

        # ---- RR-5: Move the Question --------------------------------------
        session.phase = Phase.RR_MOVE_THE_QUESTION
        closing = (
            "The chair calls the question. Debate is closed. The "
            "assembly will now proceed to the vote on the motion: "
            f"\"{motion}\""
        )
        msg = _add_orchestrator_message(
            session, closing, kind="rr_call_the_question",
            extra={"motion": motion},
        )
        yield _sse("orchestrator", _msg_payload(msg))

    def build_decision_input(self) -> DecisionInput:
        session = self.session
        actives = [p for p in session.participants if p.enabled]
        return DecisionInput(
            question=session.question,
            participants=actives,
            transcript_messages=list(session.messages),
            finalized_positions=dict(session.final_opinions),
            main_motion=session.main_motion,
            extras={"proposed_motions": list(session.proposed_motions)},
        )
