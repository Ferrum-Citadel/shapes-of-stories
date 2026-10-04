import re

from app.core.jev import questions as Q

_NEG = re.compile(r"\b(not|never|no)\b|n't", re.I)
_POS = re.compile(r"\b(beginning|ending|end of|near the end|chapter one|final chapter)\b", re.I)


def validate() -> list[str]:
    out = []
    for axis, a in Q.AXES.items():
        if len(a.levels) != 5:
            out.append(f"{axis}: {len(a.levels)} levels")
        if _NEG.search(a.question):
            out.append(f"{axis}: negation in question")
        if _POS.search(a.question):
            out.append(f"{axis}: position word in question")
        for i, lvl in enumerate(a.levels):
            if _NEG.search(lvl[0]):
                out.append(f"{axis} level {i}: negation in description")
    if "question" in Q.AXES["mystery"].question.lower():
        out.append("mystery: literal word 'question'")
    for name, text in Q.EVENTS.items():
        if _POS.search(text):
            out.append(f"{name}: position word")
    return out


def test_shape_of_question_set():
    q = Q.build_questions(with_gate=True)
    assert list(Q.AXES) == [
        "fortune",
        "tension",
        "mystery",
        "humor",
        "warmth",
        "romance",
        "wonder",
        "dread",
        "sorrow",
        "pace",
    ]
    assert len([k for k, v in q.items() if v["type"] == "score"]) == 10
    assert len([k for k, v in q.items() if v["type"] == "noul"]) == 9
    assert set(k for k, v in q.items() if v["type"] == "choice") == {"mode", "text_kind"}
    assert "text_kind" not in Q.build_questions(with_gate=False)


def test_every_score_has_five_structured_levels_and_same_scope():
    q = Q.build_questions(with_gate=False)
    for axis in Q.AXES:
        s = q[axis]
        assert s["instructions"]["scope"] == Q.SCOPE and s["instructions"]["question"]
        assert len(s["criteria"]) == 5
        for lvl in s["criteria"]:
            assert set(lvl) == {"description", "examples"} and len(lvl["examples"]) >= 2


def test_driver_questions_speak_of_options_and_end_with_the_pick_sentence():
    for axis, text in Q.DRIVER_QUESTIONS.items():
        assert "passage" not in text.lower()
        assert "each option" in text
        assert Q._DRIVER_ASK[axis] in text and "Which single option" in Q._DRIVER_ASK[axis]
        assert text.endswith("If several qualify, choose the one whose wording is most direct.")


def test_validate_flags_the_deliberate_q3_contrasts_and_nothing_else():
    # mystery deliberately contrasts what is and isn't withheld; the negation check flags it by
    # design.
    assert validate() == [
        "mystery: negation in question",
        "mystery level 0: negation in description",
    ]


def test_only_pace_carries_a_note_and_it_reaches_the_built_question():
    q = Q.build_questions(with_gate=False)
    assert q["pace"]["instructions"]["note"] == Q.AXES["pace"].note
    assert [a for a in Q.AXES if "note" in q[a]["instructions"]] == ["pace"]


def test_validate_catches_negation_and_position(monkeypatch):
    bad = dict(Q.AXES)
    bad["pace"] = Q.Axis("Is this not near the end?", Q.AXES["pace"].levels)
    monkeypatch.setattr(Q, "AXES", bad)
    v = validate()
    assert any("negation" in x for x in v) and any("position" in x for x in v)
