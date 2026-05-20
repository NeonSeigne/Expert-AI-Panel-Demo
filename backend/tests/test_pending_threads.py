"""Tests for the per-speaker pending-threads helpers in
`app.services.orchestrator`.

These guard the prompt rule: when it's your turn to speak, you should
address questions/replies aimed at you since your last own-message turn
before moving on. The helpers feed the `{pending_block}` template slot
in CRITIQUE / FINALIZATION / CONSENSUS_ALLIED / CONSENSUS_SOLO and the
`replying_to` field on outgoing messages (frontend "Replying to X" pill).
"""
from app.services.models import Participant, Session
from app.services.orchestrator import (
    _format_pending_block,
    _pending_addressed_for,
    _replying_to_ids,
)


def _p(pid: str, name: str) -> Participant:
    return Participant(
        participant_id=pid,
        name=name,
        role_prompt="(prompt)",
        model_id="gpt-4o-mini",
    )


def _msg(
    speaker_id: str,
    speaker_name: str,
    text: str,
    *,
    role: str = "participant",
    addressed_to: str | None = None,
) -> dict:
    return {
        "speaker_id": speaker_id,
        "speaker_name": speaker_name,
        "role": role,
        "text": text,
        "addressed_to": addressed_to,
    }


def test_pending_empty_when_no_addressed_messages():
    s = Session()
    s.participants = [_p("a", "Alice"), _p("b", "Bob")]
    s.messages = [
        _msg("a", "Alice", "Open thoughts."),
        _msg("b", "Bob", "Different topic."),
    ]
    pending = _pending_addressed_for(s, s.participants[0])
    assert pending == []


def test_pending_collects_only_messages_after_speakers_last_turn():
    s = Session()
    alice = _p("a", "Alice")
    bob = _p("b", "Bob")
    cara = _p("c", "Cara")
    s.participants = [alice, bob, cara]
    s.messages = [
        _msg("a", "Alice", "Old message from Alice", addressed_to="a"),
        _msg("a", "Alice", "Alice speaks again."),
        _msg("b", "Bob", "Bob asks Alice something.", addressed_to="a"),
        _msg("c", "Cara", "Cara also asks Alice.", addressed_to="a"),
        _msg("c", "Cara", "Cara on a different point.", addressed_to="b"),
    ]
    pending = _pending_addressed_for(s, alice)
    assert pending == [
        ("b", "Bob", "Bob asks Alice something."),
        ("c", "Cara", "Cara also asks Alice."),
    ]


def test_pending_ignores_orchestrator_messages():
    s = Session()
    alice = _p("a", "Alice")
    s.participants = [alice]
    s.messages = [
        _msg("a", "Alice", "Hi.", addressed_to=None),
        _msg(
            "orch", "Orchestrator", "Some status.",
            role="orchestrator", addressed_to="a",
        ),
    ]
    pending = _pending_addressed_for(s, alice)
    assert pending == []


def test_pending_block_renders_none_when_empty():
    block = _format_pending_block([])
    assert "(none)" in block
    assert block.endswith("\n\n")


def test_pending_block_renders_each_thread_with_speaker_attribution():
    block = _format_pending_block([
        ("b", "Bob", "Can you cite the source?"),
        ("c", "Cara", "I disagree because X."),
    ])
    assert "Bob said to you" in block
    assert "Can you cite the source?" in block
    assert "Cara said to you" in block
    assert "I disagree because X." in block


def test_pending_block_truncates_very_long_quotes():
    long_text = "x" * 2000
    block = _format_pending_block([("b", "Bob", long_text)])
    assert "..." in block
    # Very rough upper bound: truncated quote + framing should be well under
    # the original 2000 chars.
    assert len(block) < 1000


def test_replying_to_ids_extracts_unique_ordered_asker_ids():
    pending = [
        ("b", "Bob", "First Bob question."),
        ("c", "Cara", "Cara chimes in."),
        ("b", "Bob", "Bob follows up - same id, should de-dupe."),
        ("d", "Dan", "Dan also."),
    ]
    assert _replying_to_ids(pending) == ["b", "c", "d"]


def test_replying_to_ids_empty_for_empty_pending():
    assert _replying_to_ids([]) == []
