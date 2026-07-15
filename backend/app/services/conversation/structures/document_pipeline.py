"""Document pipeline — sequential marketing production structure.

Phases:
  1. Ideation rounds (critique-style debate; rounds = critique_rounds)
  2. Ideation brief (one summarizer call — context failsafe)
  3. Drafting (each specialty writes a section from the brief only)
  4. Revise (each revises own section using brief + peer sections)
  5. Final review (PM consolidates into session.final_report)
"""
from __future__ import annotations

from typing import Any, AsyncIterator

from app.services.conversation.structures.base import ConversationStructure
from app.services.conversation.types import DecisionInput
from app.services.models import Phase
from app.services.prompts.document_pipeline import (
    DRAFT_PROMPT,
    FINAL_REVIEW_PROMPT,
    IDEATION_BRIEF_SYSTEM,
    IDEATION_PROMPT,
    REVISE_PROMPT,
)

# Soft char cap per peer section when packing revise/review prompts
# (protects ~8K Neon windows when 6 long drafts are present).
_SECTION_INJECT_CHARS = 2_500
_PM_ID = "extra_marketing_project_manager"


def _truncate_section(text: str, limit: int = _SECTION_INJECT_CHARS) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    head = limit // 2 - 20
    tail = limit - head - 40
    return (
        f"{text[:head].rstrip()}\n\n"
        f"[…truncated middle…]\n\n"
        f"{text[-tail:].lstrip()}"
    )


def _format_sections_block(
    sections: dict[str, str],
    names: dict[str, str],
    *,
    exclude_pid: str | None = None,
) -> str:
    lines: list[str] = []
    for pid, body in sections.items():
        if exclude_pid and pid == exclude_pid:
            continue
        name = names.get(pid, pid)
        lines.append(f"### {name}\n{_truncate_section(body)}\n")
    return "\n".join(lines) if lines else "(no sections yet)"


def _roster_string(actives: list) -> str:
    return ", ".join(p.name for p in actives)


class DocumentPipelineDiscussion(ConversationStructure):
    NAME = "Document Pipeline"
    DESCRIPTION = (
        "Ideation rounds where the team debates the plan, then sequential "
        "drafting, revise, and final review into one markdown deliverable."
    )

    async def run(self) -> AsyncIterator[str]:
        from app.services.orchestrator import (
            _active_participants,
            _call_participant,
            _format_history,
            _orchestrator_banner_sse,
            _orchestrator_model_id,
            _sse,
        )
        from app.services.live_sse import iter_resilient_turn_sse
        from app.services.context_budget import (
            run_summarize,
            select_summarizer_model_id,
        )

        session = self.session
        actives = _active_participants(session)
        ai_actives = [p for p in actives if p.kind != "human"]
        names = {p.participant_id: p.name for p in actives}

        # ---- Phase 1: Ideation rounds ------------------------------------
        ideation_rounds = max(1, session.limits.critique_rounds)
        for round_n in range(1, ideation_rounds + 1):
            session.phase = Phase.PIPELINE_IDEATION
            for chunk in _orchestrator_banner_sse(
                session,
                f"Document pipeline: ideation round {round_n} of "
                f"{ideation_rounds}...",
            ):
                yield chunk

            transcript_snapshot = _format_history(session.messages)
            for p in ai_actives:
                if not p.enabled:
                    continue
                prompt = IDEATION_PROMPT.format(
                    round_number=round_n,
                    round_total=ideation_rounds,
                    question=session.question,
                    transcript=transcript_snapshot,
                )
                turn = None
                stream_msg_id = None
                async for item in iter_resilient_turn_sse(
                    session=session,
                    participant=p,
                    user_prompt=prompt,
                    label=f"pipeline_ideation_{round_n}",
                    max_tokens=700,
                    call_participant=_call_participant,
                ):
                    if isinstance(item, tuple) and item and item[0] == "turn":
                        _, turn, stream_msg_id = item
                    else:
                        yield item
                if turn is None:
                    continue
                for ev in turn.sse_events:
                    yield ev
                if not turn.ok:
                    yield _sse("participant_error", {
                        "participant_id": p.participant_id,
                        "name": p.name,
                        "phase": session.phase.value,
                    })
                    continue
                from app.services.orchestrator import (
                    _add_participant_message,
                    _msg_payload,
                    _participant_msg_cap_hit,
                    _wait_for_continue,
                )
                speaker = turn.speaker
                msg = _add_participant_message(
                    session,
                    speaker,
                    turn.text,
                    elapsed=turn.elapsed,
                    phase=session.phase,
                    message_id=stream_msg_id,
                )
                yield _sse("message", _msg_payload(msg))
                if _participant_msg_cap_hit(session):
                    async for chunk in _wait_for_continue(session, "messages"):
                        yield chunk

        # ---- Phase boundary: ideation brief ------------------------------
        for chunk in _orchestrator_banner_sse(
            session,
            "Document pipeline: summarizing ideation into a plan brief...",
        ):
            yield chunk

        summarizer_id = select_summarizer_model_id(
            session.summarizer_model_id,
            _orchestrator_model_id(session),
        )
        transcript_for_brief = _format_history(
            session.messages, include_orchestrator=False,
        )
        brief = ""
        if transcript_for_brief.strip():
            # run_summarize uses a fixed system prompt; prepend our
            # marketing-oriented instruction into the user payload.
            brief = await run_summarize(
                summarizer_id,
                f"{IDEATION_BRIEF_SYSTEM}\n\n---\n\n{transcript_for_brief}",
            )
            session.orchestrator_call_count += 1
        if not brief.strip():
            brief = (
                f"Plan from the user brief (ideation summary unavailable):\n"
                f"{session.question}"
            )
        session.pipeline_ideation_brief = brief.strip()
        from app.services.orchestrator import (
            _add_orchestrator_message,
            _msg_payload,
        )
        brief_msg = _add_orchestrator_message(
            session,
            f"**Ideation brief**\n\n{session.pipeline_ideation_brief}",
            kind="pipeline_brief",
        )
        yield _sse("orchestrator", _msg_payload(brief_msg))

        # Refresh enabled AI roster after ideation failures
        ai_actives = [
            p for p in _active_participants(session) if p.kind != "human"
        ]
        roster = _roster_string(_active_participants(session))

        # ---- Phase 2: Drafting -------------------------------------------
        session.phase = Phase.PIPELINE_DRAFTING
        for chunk in _orchestrator_banner_sse(
            session, "Document pipeline: drafting specialty sections...",
        ):
            yield chunk

        session.pipeline_sections = {}
        for p in ai_actives:
            prompt = DRAFT_PROMPT.format(
                question=session.question,
                ideation_brief=session.pipeline_ideation_brief,
                roster=roster,
            )
            async for chunk in self._run_section_turn(
                session, p, prompt, label="pipeline_draft",
            ):
                yield chunk
            # Last successful text for this pid is in pipeline_sections
            # if _run_section_turn stored it — ensured below via session.

        # ---- Phase 3: Revise ---------------------------------------------
        session.phase = Phase.PIPELINE_REVISE
        for chunk in _orchestrator_banner_sse(
            session, "Document pipeline: revising sections...",
        ):
            yield chunk

        # Snapshot sections so each reviser sees peers' pre-revise drafts
        draft_snapshot = dict(session.pipeline_sections)
        for p in ai_actives:
            own = draft_snapshot.get(p.participant_id, "")
            if not own.strip():
                continue
            sections_block = _format_sections_block(
                draft_snapshot, names, exclude_pid=None,
            )
            prompt = REVISE_PROMPT.format(
                question=session.question,
                ideation_brief=session.pipeline_ideation_brief,
                sections_block=sections_block,
                own_section=_truncate_section(own, 3_500),
            )
            async for chunk in self._run_section_turn(
                session, p, prompt, label="pipeline_revise",
            ):
                yield chunk

        # ---- Phase 4: Final review ---------------------------------------
        session.phase = Phase.PIPELINE_FINAL_REVIEW
        for chunk in _orchestrator_banner_sse(
            session, "Document pipeline: final review and assembly...",
        ):
            yield chunk

        reviewer = next(
            (p for p in ai_actives if p.participant_id == _PM_ID),
            ai_actives[0] if ai_actives else None,
        )
        if reviewer is None:
            yield _sse("error", {
                "message": "No AI participants left for final review.",
            })
            return

        sections_block = _format_sections_block(
            session.pipeline_sections, names,
        )
        prompt = FINAL_REVIEW_PROMPT.format(
            question=session.question,
            ideation_brief=session.pipeline_ideation_brief,
            sections_block=sections_block,
        )
        async for chunk in self._run_section_turn(
            session, reviewer, prompt, label="pipeline_final_review",
            store_section=False,
        ):
            yield chunk

        final_text = ""
        # Prefer the last message from the reviewer in this phase
        for m in reversed(session.messages):
            if (
                m.get("speaker_id") == reviewer.participant_id
                and m.get("phase") == Phase.PIPELINE_FINAL_REVIEW.value
                and m.get("role") == "participant"
            ):
                final_text = m.get("text") or ""
                break
        if not final_text.strip():
            # Fallback: stitch sections
            parts = [
                f"## {names.get(pid, pid)}\n\n{body}"
                for pid, body in session.pipeline_sections.items()
                if body.strip()
            ]
            final_text = "\n\n".join(parts) or session.pipeline_ideation_brief

        session.final_report = {
            "kind": "document",
            "text": final_text.strip(),
        }
        # Hand off positions for export / contribution summaries
        session.final_opinions = dict(session.pipeline_sections)
        if reviewer.participant_id not in session.final_opinions:
            session.final_opinions[reviewer.participant_id] = final_text

        from app.services.orchestrator import (
            _add_orchestrator_message,
            _msg_payload,
        )
        report_msg = _add_orchestrator_message(
            session,
            final_text.strip(),
            kind="document",
            extra={"kind": "document"},
        )
        yield _sse("orchestrator", _msg_payload(report_msg))

    async def _run_section_turn(
        self,
        session: Any,
        participant: Any,
        prompt: str,
        *,
        label: str,
        store_section: bool = True,
    ) -> AsyncIterator[str]:
        from app.services.orchestrator import (
            _add_participant_message,
            _call_participant,
            _msg_payload,
            _participant_msg_cap_hit,
            _sse,
            _wait_for_continue,
        )
        from app.services.live_sse import iter_resilient_turn_sse

        turn = None
        stream_msg_id = None
        async for item in iter_resilient_turn_sse(
            session=session,
            participant=participant,
            user_prompt=prompt,
            label=label,
            max_tokens=1_200,
            call_participant=_call_participant,
        ):
            if isinstance(item, tuple) and item and item[0] == "turn":
                _, turn, stream_msg_id = item
            else:
                yield item
        if turn is None:
            return
        for ev in turn.sse_events:
            yield ev
        if not turn.ok:
            yield _sse("participant_error", {
                "participant_id": participant.participant_id,
                "name": participant.name,
                "phase": session.phase.value,
            })
            return
        msg = _add_participant_message(
            session,
            turn.speaker,
            turn.text,
            elapsed=turn.elapsed,
            phase=session.phase,
            message_id=stream_msg_id,
        )
        yield _sse("message", _msg_payload(msg))
        if store_section and turn.text.strip():
            session.pipeline_sections[turn.speaker.participant_id] = turn.text
        if _participant_msg_cap_hit(session):
            async for chunk in _wait_for_continue(session, "messages"):
                yield chunk

    def build_decision_input(self) -> DecisionInput:
        actives = [
            p for p in self.session.participants if p.enabled
        ]
        return DecisionInput(
            question=self.session.question,
            participants=actives,
            transcript_messages=list(self.session.messages),
            finalized_positions=dict(self.session.final_opinions),
        )
