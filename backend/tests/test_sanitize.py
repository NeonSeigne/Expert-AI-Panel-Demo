from app.utils.sanitize import strip_thinking, response_has_thinking


def test_strip_simple_think_tag():
    assert strip_thinking("<think>plan</think>final") == "final"


def test_strip_multiline_think_tag():
    raw = "<think>line1\nline2\n</think>actual reply"
    assert strip_thinking(raw) == "actual reply"


def test_strip_nested_reasoning_blocks():
    raw = (
        "<reasoning>step 1\nstep 2</reasoning>"
        "<analysis>more thinking</analysis>"
        "real text"
    )
    assert strip_thinking(raw) == "real text"


def test_strip_multiple_think_blocks():
    raw = "<think>a</think>middle<think>b</think>end"
    assert strip_thinking(raw) == "middleend"


def test_strip_uppercase_tag():
    assert strip_thinking("<THINK>plan</THINK>final") == "final"


def test_idempotent():
    cleaned = strip_thinking("<think>foo</think>bar")
    assert strip_thinking(cleaned) == cleaned


def test_empty_inputs_safe():
    assert strip_thinking(None) == ""
    assert strip_thinking("") == ""
    assert strip_thinking("   \n\t  ") == ""


def test_thought_prologue():
    raw = "Thought: I should probably mention X.\n\nReal response here."
    assert strip_thinking(raw) == "Real response here."


def test_response_has_thinking_via_text():
    assert response_has_thinking("<think>plan</think>x")
    assert not response_has_thinking("just plain text")


def test_response_has_thinking_via_msg_field():
    assert response_has_thinking("plain text", {"reasoning_content": "stuff"})
    assert response_has_thinking("plain text", {"reasoning": "stuff"})
    assert not response_has_thinking("plain text", {"content": "x"})


def test_strip_framing_tokens():
    raw = "<|reasoning|>plan<|/reasoning|>final"
    assert strip_thinking(raw) == "final"
