import asyncio
from collections import Counter

from app.core.ingest import parse
from app.core.jev.client import JevError, SyntheticJev
from app.core.jev.scorer import DRIVER_CONFIDENCE
from app.core.pipeline import analyze_text, beat_paragraph_spans, run_drivers
from app.core.prepare import prepare
from app.core.structure import Beat, Structure, build_structure
from tests.curves_helpers import answers_for, make_work


def test_run_drivers_skips_missing_and_stores_the_chunks_paragraph_range():
    text, s = make_work(5, 600)  # each beat is [heading, body]: one chunk, no call needed
    ans = answers_for(s)
    ans[2] = {"missing": True}
    analysis = {"peak_targets": [["tension", 1], ["tension", 2]]}
    out = asyncio.run(run_drivers(SyntheticJev(), "k", text, s, ans, analysis))
    assert out == {"tension": {1: {"paragraph_idx": 0, "paragraph_end_idx": 1, "confidence": 1.0}}}


def _multi_chunk_work():
    """Five chapters of six 100-word paragraphs; beat 0 holds [heading, p, p, p], so its driver
    chunks are (0, 1), (2, 2), (3, 3)."""
    para = " ".join(f"w{i}" for i in range(100))
    text = "\n\n".join(f"CHAPTER {c}\n\n" + "\n\n".join([para] * 6) for c in range(1, 6))
    p = parse(text.encode(), "t.txt")
    return p.text, build_structure(p)


class _Picks:
    def __init__(self, choice):
        self.choice, self.asked = choice, []

    async def ask(self, state, questions):
        self.asked.append((state, questions))
        return {"driver": {"choice": self.choice, "confidence": 0.9}}, "t"


def test_run_drivers_maps_the_picked_chunk_to_its_paragraph_range():
    text, s = _multi_chunk_work()
    client = _Picks("c0")
    targets = {"peak_targets": [["tension", 0]]}
    out = asyncio.run(run_drivers(client, "k", text, s, answers_for(s), targets))
    assert out["tension"][0] == {"paragraph_idx": 0, "paragraph_end_idx": 1, "confidence": 0.9}
    state, questions = client.asked[0]
    assert state == {}
    assert list(questions["driver"]["criteria"]) == ["c0", "c1", "c2"]
    assert questions["driver"]["criteria"]["c0"].startswith("CHAPTER 1\n\nw0 w1 ")


class _NoChoiceClient:
    async def ask(self, state, questions):
        return {"driver": {"type": "choice"}}, "bad"


def test_run_drivers_malformed_driver_answer_is_none_conf_zero():
    text, s = _multi_chunk_work()
    targets = {"peak_targets": [["tension", 1]]}
    out = asyncio.run(run_drivers(_NoChoiceClient(), "k", text, s, answers_for(s), targets))
    assert out["tension"][1] == {
        "paragraph_idx": None,
        "paragraph_end_idx": None,
        "confidence": 0.0,
    }


class _FailsChapterThree(SyntheticJev):
    """Raises for every passage of chapter 3, `times` times each."""

    def __init__(self, times: int):
        self.times, self.calls = times, Counter()

    async def ask(self, state, questions):
        if state.get("chapter") == "CHAPTER 3":
            self.calls[state["passage"]] += 1
            if self.calls[state["passage"]] <= self.times:
                raise JevError("unavailable")
        return await super().ask(state, questions)


def _twelve_chapters():
    return prepare(
        "\n\n".join(
            f"CHAPTER {i}\n\n" + ("The tide turned and the town waited. " * 120)
            for i in range(1, 13)
        ).encode(),
        "n.txt",
    )


def test_analyze_text_scores_an_unscored_passage_once_more():
    _, analysis = asyncio.run(analyze_text(_FailsChapterThree(times=1), "k", _twelve_chapters()))
    assert analysis["missing_beats"] == []


def test_analyze_text_keeps_a_passage_unscored_after_one_retry():
    client = _FailsChapterThree(times=2)
    _, analysis = asyncio.run(analyze_text(client, "k", _twelve_chapters()))
    assert analysis["missing_beats"] and set(client.calls.values()) == {2}


def test_analyze_text_synthetic_payload_carries_driver_gate():
    text = "\n\n".join(
        f"CHAPTER {i}\n\n" + ("The tide turned and the town waited. " * 120) for i in range(1, 13)
    )
    _, analysis = asyncio.run(analyze_text(SyntheticJev(), "k", prepare(text.encode(), "n.txt")))
    assert analysis["driver_gate"] == DRIVER_CONFIDENCE
    assert all(
        set(d) == {"paragraph_idx", "paragraph_end_idx", "confidence"}
        for per_axis in analysis["drivers"].values()
        for d in per_axis.values()
    )


# The same passages are checked against the frontend's paragraphsOf (__tests__/text.test.ts).
_THREE = "Alpha one. Alpha two.\n\nBeta one. Beta two.\n\nGamma one. Gamma two."


def _paragraphs_of_passage(start: int, end: int) -> list[str]:
    s = Structure([], [], [Beat(0, 0, start, end, 0)], "headings", "prose", 0)
    return [_THREE[a:b] for a, b in beat_paragraph_spans(_THREE, s, 0)]


def test_a_passage_starting_inside_a_paragraph_counts_its_piece_as_paragraph_0():
    start = _THREE.index("Alpha two.")
    end = _THREE.index("Beta two.") + len("Beta two.")
    assert _paragraphs_of_passage(start, end) == ["Alpha two.", "Beta one. Beta two."]


def test_a_passage_ending_inside_a_paragraph_keeps_its_last_piece():
    start = _THREE.index("Beta one.")
    end = _THREE.index("Gamma one.") + len("Gamma one.")
    assert _paragraphs_of_passage(start, end) == ["Beta one. Beta two.", "Gamma one."]
