from app.api.chat import (
    _export_csv_table,
    _export_md,
    _export_txt,
)
from app.services.models import Phase, Session
from app.services.models import Participant


# Number of columns in the CSV table (kept here for tests to assert
# field-count stability if the schema ever shifts).
EXPECTED_CSV_COLUMNS = 12


def _mk_session(*, with_credentials: bool = False) -> Session:
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
    if with_credentials:
        s.credential_summary = [
            {
                "participant_id": "extra_a",
                "name": "Alice",
                "expertise": "Comparative education researcher.",
                "personality": "Calm, evidence-driven.",
                "credibility_for_question": 0.78,
                "bias_to_watch": "Tends to over-trust meta-analyses.",
            },
            {
                "participant_id": "expert_b",
                "name": "Bob, Ph.D.",
                "expertise": "K-12 classroom teacher, 20 years.",
                "personality": "Combative; debates loudly.",
                "credibility_for_question": 0.62,
                "bias_to_watch": "Anchors on personal anecdotes.",
            },
        ]
    return s


def test_csv_export_roundtrips_through_csv_module():
    """Ensure values containing commas, quotes, and newlines get quoted
    correctly per RFC 4180, and that credential columns are populated."""
    import csv
    import io

    s = _mk_session(with_credentials=True)
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
        "Expertise (orchestrator's read)",
        "Style",
        "Credibility on this question (0-1)",
        "Bias to watch",
        "First opinion",
        "Conversation contribution",
        "Revised opinion",
        "Final opinion",
        "Consecutive failures",
        "Enabled",
        "Auto-disabled",
    ]
    alice_row = parsed[4]
    assert alice_row[0] == "Alice"
    # credential columns
    assert alice_row[1] == "Comparative education researcher."
    assert alice_row[2] == "Calm, evidence-driven."
    assert alice_row[3] == "0.78"
    assert alice_row[4] == "Tends to over-trust meta-analyses."
    # opinion columns - "First opinion" still preserves quotes/commas/newlines
    assert "\"quotes\"" in alice_row[5]
    assert alice_row[9] == "0"
    assert alice_row[10] == "yes"
    assert alice_row[11] == "no"
    bob_row = parsed[5]
    assert bob_row[0] == "Bob, Ph.D."
    assert bob_row[3] == "0.62"
    assert "multi-line" in bob_row[5]


def test_csv_export_no_field_count_drift():
    """Every data row should have exactly EXPECTED_CSV_COLUMNS columns,
    matching the header row, even with pathological characters and even
    when credentials are missing."""
    import csv
    import io

    s = _mk_session(with_credentials=False)
    out = _export_csv_table(s)
    rows = list(csv.reader(io.StringIO(out["content"])))
    header = rows[3]
    assert len(header) == EXPECTED_CSV_COLUMNS
    for row in rows[4:]:
        assert len(row) == EXPECTED_CSV_COLUMNS


def test_csv_export_blank_credentials_when_summary_missing():
    """When the orchestrator hasn't built a Credential Summary yet, the
    credential columns should be present but empty - never crash."""
    import csv
    import io

    s = _mk_session(with_credentials=False)
    out = _export_csv_table(s)
    rows = list(csv.reader(io.StringIO(out["content"])))
    alice_row = rows[4]
    # cols 1..4 are credential columns (Expertise, Style, Credibility, Bias)
    assert alice_row[1] == ""
    assert alice_row[2] == ""
    assert alice_row[3] == ""
    assert alice_row[4] == ""
    # but the opinion columns should still be populated
    assert "Alice" in alice_row[0]
    assert alice_row[6] == "Stayed firm."  # contribution summary


def test_txt_export_includes_credential_block_when_present():
    s = _mk_session(with_credentials=True)
    out = _export_txt(s)
    body = out["content"]
    assert "Credential Summary" in body
    assert "Comparative education researcher." in body
    assert "0.78" in body
    assert "Tends to over-trust meta-analyses." in body
    # Block precedes the conversation transcript
    cred_idx = body.index("Credential Summary")
    msg_idx = body.index("Final consensus statement A")
    assert cred_idx < msg_idx


def test_txt_export_omits_credential_block_when_empty():
    s = _mk_session(with_credentials=False)
    out = _export_txt(s)
    assert "Credential Summary" not in out["content"]


def test_md_export_includes_credential_block_when_present():
    s = _mk_session(with_credentials=True)
    out = _export_md(s)
    body = out["content"]
    assert "## Credential Summary" in body
    assert "### Alice" in body
    assert "### Bob, Ph.D." in body
    assert "**Credibility on this question:** 0.78" in body
    assert "**Bias to watch:**" in body


def test_md_export_omits_credential_block_when_empty():
    s = _mk_session(with_credentials=False)
    out = _export_md(s)
    assert "## Credential Summary" not in out["content"]
