import math

import pytest

from app.core.jev.answers import normalize_answers, score_sd
from app.core.jev.questions import AXES, EVENTS, build_questions
from app.core.jev.state import build_state, cache_key, canonical_json


def raw_answers(with_gate=False):
    a = {
        axis: {
            "type": "score",
            "score": 2.0,
            "probabilities": {"0": 0, "1": 0.25, "2": 0.5, "3": 0.25, "4": 0},
            "confidence": 0.5,
            "legend": {},
        }
        for axis in AXES
    }
    a |= {e: {"type": "noul", "noul": 0.1} for e in EVENTS}
    a["mode"] = {
        "type": "choice",
        "choice": "dialogue",
        "probabilities": {"dialogue": 0.8},
        "confidence": 0.8,
    }
    if with_gate:
        a["text_kind"] = {
            "type": "choice",
            "choice": "prose_fiction",
            "probabilities": {},
            "confidence": 0.9,
        }
    return a


def test_cache_key_is_stable_and_order_independent():
    s = build_state("novel", "Chapter 1", "tail.", "passage.")
    q = build_questions(False)
    assert cache_key(s, q) == cache_key(dict(reversed(list(s.items()))), q)
    assert len(cache_key(s, q)) == 64
    assert canonical_json({"b": 1, "a": "é"}) == '{"a":"é","b":1}'


def test_normalize_answers_shape_and_sd():
    n = normalize_answers(raw_answers(True), "jev-1.13.0")
    assert n["model"] == "jev-1.13.0"
    assert (
        n["scores"]["fortune"]["p"]
        == [0, 0.25, 0.5, 0.25, 0]
    )
    assert n["scores"]["fortune"]["score"] == 2.0
    assert math.isclose(
        n["scores"]["fortune"]["sd"],
        math.sqrt(0.25 + 0.25),
    )
    assert n["events"]["death"] == 0.1
    assert n["mode"] == {"choice": "dialogue", "confidence": 0.8}
    assert n["text_kind"] == {"choice": "prose_fiction", "confidence": 0.9}
    assert "text_kind" not in normalize_answers(raw_answers(False), "m")


def test_missing_axis_is_an_error():
    r = raw_answers()
    del r["pace"]
    with pytest.raises(ValueError):
        normalize_answers(r, "m")


def test_score_sd_zero_when_peaked():
    assert score_sd([0, 0, 1, 0, 0], 2.0) == 0.0


def test_malformed_answer_is_a_value_error():
    r = raw_answers()
    del r["fortune"]["score"]
    with pytest.raises(ValueError):
        normalize_answers(r, "m")
    r2 = raw_answers()
    r2["mode"] = {"type": "choice"}
    with pytest.raises(ValueError):
        normalize_answers(r2, "m")
    r3 = raw_answers()
    r3["fortune"]["probabilities"] = None
    with pytest.raises(ValueError):
        normalize_answers(r3, "m")
