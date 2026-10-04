import asyncio
import json
import re

import pytest

from app.core.ingest import parse
from app.core.ingest.model import Parsed
from app.core.jev.client import (
    FixtureJev,
    JevBadRequest,
    JevFixtureMissing,
    JevKeyRejected,
    SyntheticJev,
)
from app.core.jev.questions import DRIVER_QUESTIONS
from app.core.jev.scorer import ask_driver, beat_state, initial_work_kind, score_beats
from app.core.structure import build_structure

TEXT = "\n\n".join(
    [
        f"CHAPTER {i}\n\nThe sentence number {i} goes here. " + ("More words follow. " * 120)
        for i in range(1, 7)
    ]
)
P = parse(TEXT.encode(), "t.txt")
T = P.text
S = build_structure(P)


def test_initial_work_kind():
    assert initial_work_kind("fountain", 20000) == "screenplay"
    assert initial_work_kind("srt", 5000) == "transcript"
    assert (
        initial_work_kind("txt", 5000) == "short story"
        and initial_work_kind("epub", 90000) == "novel"
    )


def test_beat_state_has_tail_and_chapter():
    s0 = beat_state(T, S, 0, "novel")
    s1 = beat_state(T, S, 1, "novel")
    assert s0["previous_passage_tail"] == ""
    assert s1["previous_passage_tail"].endswith("More words follow.")
    assert (
        s1["passage"] == T[S.beats[1].start_cp : S.beats[1].end_cp] and s0["work_kind"] == "novel"
    )


def test_beat_state_never_sends_position_labels():
    body = "\n\n".join(f"Paragraph {i}. " + "word " * 28 for i in range(40))
    p = Parsed(text=body, format="txt")
    s = build_structure(p)
    for idx in range(len(s.beats)):
        chapter = beat_state(body, s, idx, "novel")["chapter"]
        assert re.match(r"^Chapter \d+$", chapter)
    assert beat_state(T, S, 0, "novel")["chapter"] == "CHAPTER 1"


def test_score_all_beats_reports_each_and_gates_beat0():
    seen = []

    async def on_answer(idx, ans):
        seen.append(idx)

    res = asyncio.run(
        score_beats(SyntheticJev(), T, S, "novel", key_hash="k", done={}, on_answer=on_answer)
    )
    assert sorted(res) == list(range(len(S.beats))) and seen[0] == 0 and sorted(seen) == sorted(res)
    assert "text_kind" in res[0] and "text_kind" not in res[1]


def test_done_beats_are_skipped():
    calls = []

    class Counting(SyntheticJev):
        async def ask(self, state, questions):
            calls.append(state["chapter"])
            return await super().ask(state, questions)

    done = {
        0: {
            "scores": {},
            "events": {},
            "mode": {},
            "model": "x",
            "text_kind": {"choice": "prose_fiction", "confidence": 1},
        }
    }

    res = asyncio.run(score_beats(Counting(), T, S, "novel", key_hash="k", done=done))
    assert len(calls) == len(S.beats) - 1 and res[0] is done[0]


def test_bad_request_marks_missing_and_key_rejected_propagates():
    class Bad(SyntheticJev):
        async def ask(self, state, questions):
            if state["chapter"] == "CHAPTER 3":
                raise JevBadRequest({"x": 1})
            return await super().ask(state, questions)

    res = asyncio.run(score_beats(Bad(), T, S, "novel", key_hash="k", done={}))
    assert any(a.get("missing") for a in res.values())

    class Rejecting(SyntheticJev):
        async def ask(self, state, questions):
            raise JevKeyRejected()

    with pytest.raises(JevKeyRejected):
        asyncio.run(score_beats(Rejecting(), T, S, "novel", key_hash="k", done={}))


def test_missing_error_never_carries_server_text():
    class Bad(SyntheticJev):
        async def ask(self, state, questions):
            raise JevBadRequest({"detail": {"input": "SECRET PASSAGE TEXT"}})

    res = asyncio.run(score_beats(Bad(), T, S, "novel", key_hash="k", done={}))
    assert all(a.get("missing") for a in res.values())
    assert "SECRET" not in json.dumps(res)


def test_fixture_miss_propagates(tmp_path):
    client = FixtureJev(tmp_path / "none.json")

    with pytest.raises(JevFixtureMissing):
        asyncio.run(score_beats(client, T, S, "novel", key_hash="k", done={}))


def test_on_answer_failure_cancels_siblings():
    class Slow(SyntheticJev):
        async def ask(self, state, questions):
            if "text_kind" not in questions:
                await asyncio.sleep(0.05)
            return await super().ask(state, questions)

    raised = False

    async def on_answer(idx, ans):
        nonlocal raised
        if idx >= 1 and not raised:
            raised = True
            raise RuntimeError("boom")

    async def outer():
        try:
            await score_beats(Slow(), T, S, "novel", key_hash="k", done={}, on_answer=on_answer)
        except RuntimeError:
            pass
        assert all(t.done() for t in asyncio.all_tasks() if t is not asyncio.current_task())

    asyncio.run(outer())


def test_ask_driver_returns_index_and_confidence():
    idx, conf = asyncio.run(
        ask_driver(SyntheticJev(), "k", ["para one", "para two", "para three"], "tension")
    )
    assert 0 <= idx < 3
    assert 0 <= conf <= 1


def test_ask_driver_caps_options_keeps_full_text_and_sends_the_axis_question_without_state():
    captured = {}

    class Recording(SyntheticJev):
        async def ask(self, state, questions):
            captured["state"], captured["questions"] = state, questions
            return await super().ask(state, questions)

    options = ["x" * 500 for _ in range(300)]
    asyncio.run(ask_driver(Recording(), "k", options, "tension"))
    driver = captured["questions"]["driver"]
    assert set(driver["criteria"]) == {f"c{i}" for i in range(255)}
    assert all(len(v) == 500 for v in driver["criteria"].values())
    assert driver["instructions"] == DRIVER_QUESTIONS["tension"]
    assert captured["state"] == {}


def test_ask_driver_malformed_answer_is_none():
    class Malformed:
        async def ask(self, state, questions):
            return {"driver": {"type": "choice"}}, "m"

        async def aclose(self):
            pass

    idx, conf = asyncio.run(ask_driver(Malformed(), "k", ["a", "b", "c"], "tension"))
    assert (idx, conf) == (None, 0.0)


@pytest.mark.parametrize(
    ("work_kind", "expected"),
    [("novel", "play"), ("screenplay", "screenplay")],
)
def test_gate_switches_work_kind_to_play(work_kind, expected):
    seen_kinds = []

    class ForcedGate(SyntheticJev):
        async def ask(self, state, questions):
            raw, model = await super().ask(state, questions)
            if "text_kind" in questions:
                raw["text_kind"] = {
                    "type": "choice",
                    "choice": "screenplay_or_play",
                    "probabilities": {},
                    "confidence": 0.9,
                }
            else:
                seen_kinds.append(state["work_kind"])
            return raw, model

    asyncio.run(score_beats(ForcedGate(), T, S, work_kind, key_hash="k", done={}))
    assert seen_kinds and all(k == expected for k in seen_kinds)
