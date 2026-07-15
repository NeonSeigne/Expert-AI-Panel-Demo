"""Publish a document already produced by DocumentPipelineDiscussion.

If the structure set ``session.final_report``, this method only emits a
short status and finishes (no ballot). Otherwise it stitches
``pipeline_sections`` / finalized positions into a markdown report.
"""
from __future__ import annotations

from typing import AsyncIterator

from app.services.conversation.decisions.base import DecisionMethod


class DocumentPublishDecision(DecisionMethod):
    NAME = "Document Publish"
    DESCRIPTION = (
        "Publishes the aggregated markdown document from the document "
        "pipeline. No voting or consensus deliberation."
    )

    async def run(self) -> AsyncIterator[str]:
        from app.services.orchestrator import (
            _add_orchestrator_message,
            _msg_payload,
            _sse,
        )
        from app.services.models import Phase

        session = self.session
        session.phase = Phase.FINISHED

        if session.final_report and session.final_report.get("text"):
            yield _sse("status", {
                "message": "Document pipeline complete.",
            })
            return

        # Fallback assembly
        sections = getattr(session, "pipeline_sections", None) or {}
        names = {p.participant_id: p.name for p in session.participants}
        if sections:
            parts = [
                f"## {names.get(pid, pid)}\n\n{body.strip()}"
                for pid, body in sections.items()
                if (body or "").strip()
            ]
            text = "\n\n".join(parts)
        else:
            positions = self.decision_input.finalized_positions or {}
            parts = [
                f"## {names.get(pid, pid)}\n\n{body.strip()}"
                for pid, body in positions.items()
                if (body or "").strip()
            ]
            text = "\n\n".join(parts) or (
                getattr(session, "pipeline_ideation_brief", "")
                or session.question
            )

        session.final_report = {"kind": "document", "text": text}
        msg = _add_orchestrator_message(
            session, text, kind="document", extra={"kind": "document"},
        )
        yield _sse("orchestrator", _msg_payload(msg))
        yield _sse("status", {"message": "Document assembled."})
