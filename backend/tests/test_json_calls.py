from app.services.json_calls import parse_json_response


def test_plain_json_object():
    assert parse_json_response('{"a": 1}') == {"a": 1}


def test_plain_json_array():
    assert parse_json_response('[1, 2, 3]') == [1, 2, 3]


def test_markdown_fence():
    raw = "```json\n{\"a\": 1}\n```"
    assert parse_json_response(raw) == {"a": 1}


def test_markdown_fence_no_lang():
    raw = "```\n{\"a\": 1}\n```"
    assert parse_json_response(raw) == {"a": 1}


def test_prose_then_json():
    raw = "Sure, here's the result:\n\n{\"a\": 1, \"b\": [2,3]}"
    assert parse_json_response(raw) == {"a": 1, "b": [2, 3]}


def test_json_then_prose():
    raw = "{\"a\": 1}\nThe end."
    assert parse_json_response(raw) == {"a": 1}


def test_nested_braces_ok():
    raw = "Look:\n{\"outer\": {\"inner\": [1, {\"k\": \"v\"}]}}"
    assert parse_json_response(raw) == {"outer": {"inner": [1, {"k": "v"}]}}


def test_string_with_braces_doesnt_confuse_balancer():
    raw = '{"text": "this has } and { in it", "ok": true}'
    assert parse_json_response(raw) == {"text": "this has } and { in it", "ok": True}


def test_unparseable_returns_none():
    assert parse_json_response("not json at all") is None


def test_empty_returns_none():
    assert parse_json_response("") is None
    assert parse_json_response(None) is None
