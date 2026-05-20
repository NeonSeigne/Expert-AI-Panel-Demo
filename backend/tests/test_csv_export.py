from app.api.chat import _export_csv_table
from app.services.models import Phase, Session
from app.services.models import Participant


def _mk_session():
    s = Session()
    s.question = "Will \"AI\" change, education? Yes, no, maybe.\nNew lines too."
    p1 = Participant(
        participant_id="extra_a",
        name="Alice",
        role_prompt="rp",
        model_id="model-a",
        kind="extra",
        display_name="Provider/Model A",
    )
    p2 = Participant(
        participant_id="expert_b",
        name="Bob, Ph.D.",
        role_prompt="rp",
        model_id="model-b",
        kind="expert",
        display_name="Provider/Model B",
    )
    s.participants = [p1, p2]
    s.initial_opinions = {
        "extra_a": "Alice's, opinion has commas, and \"quotes\".",
        "expert_b": "Bob's\nmulti-line\nopinion.",
    }
    s.contribution_summaries = {
        "extra_a": "Stayed firm.",
        "expert_b": "Pushed hard.",
    }
    s.final_opinions = {
        "extra_a": "Final A",
        "expert_b": "Final B",
    }
    s.messages = [
        {
            "speaker_id": "extra_a", "speaker_name": "Alice",
            "role": "participant", "phase": Phase.CONSENSUS.value,
            "text": "Final consensus statement A",
        },
        {
            "speaker_id": "expert_b", "speaker_name": "Bob, Ph.D.",
            "role": "participant", "phase": Phase.CONSENSUS.value,
            "text": "Final consensus statement B",
        },
    ]
    s.final_report = {"kind": "majority", "text": "Group decided X."}
    return s


def test_csv_export_roundtrips_through_csv_module():
    """Ensure values containing commas, quotes, and newlines get quoted
    correctly per RFC 4180."""
    import csv
    import io

    s = _mk_session()
    out = _export_csv_table(s)
    assert out["filename"] == "ccai_chat_table.csv"
    parsed = list(csv.reader(io.StringIO(out["content"])))
    # Header is question, then final, then blank, then column row.
    assert parsed[0][0] == "Question"
    assert "AI" in parsed[0][1] and "education" in parsed[0][1]
    assert parsed[1][0] == "Final Group Opinion"
    assert "Group decided X." in parsed[1][1]
    # blank row
    assert parsed[2] == []
    # column header row
    assert parsed[3] == [
        "Participant",
        "First opinion",
        "Conversation contribution",
        "Revised opinion",
        "Final opinion",
    ]
    alice_row = parsed[4]
    assert alice_row[0] == "Alice"
    assert "\"quotes\"" in alice_row[1]  # csv module preserved the quotes
    bob_row = parsed[5]
    assert bob_row[0] == "Bob, Ph.D."
    assert "multi-line" in bob_row[1]


def test_csv_export_no_field_count_drift():
    """Every row after the header should have exactly 5 columns even when
    payload contains pathological characters."""
    import csv
    import io

    s = _mk_session()
    out = _export_csv_table(s)
    rows = list(csv.reader(io.StringIO(out["content"])))
    data_rows = rows[4:]
    for row in data_rows:
        assert len(row) == 5
