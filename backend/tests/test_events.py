from app import config
from app.core.curves.events import mode_of, select_events
from tests.curves_helpers import answers_for, make_work


def test_strength_uses_the_per_type_strong_threshold(monkeypatch):
    monkeypatch.setitem(config.EVENT_STRONG, "death", 0.9)
    _, s = make_work(100, 600)
    ev = select_events(s, answers_for(s, events={(3, "death"): 0.8, (5, "reveal"): 0.8}))
    assert {e["type"]: e["strength"] for e in ev} == {"death": "faint", "reveal": "strong"}


def test_thresholds_and_dedup():
    _, s = make_work(100, 600)
    ans = answers_for(
        s, events={(3, "death"): 0.9, (4, "death"): 0.8, (10, "reveal"): 0.7, (15, "reveal"): 0.6}
    )
    ev = select_events(s, ans)
    deaths = [e for e in ev if e["type"] == "death"]
    assert len(deaths) == 1 and deaths[0]["beat_idx"] == 3 and deaths[0]["strength"] == "strong"
    reveals = [e for e in ev if e["type"] == "reveal"]
    assert [r["strength"] for r in reveals] == ["faint"] and reveals[0]["beat_idx"] == 10
    assert ev == sorted(ev, key=lambda e: e["bin"])


def test_mode_mixed_below_confidence():
    assert mode_of({"mode": {"choice": "dialogue", "confidence": 0.9}}) == "dialogue"
    assert mode_of({"mode": {"choice": "dialogue", "confidence": 0.5}}) == "mixed"
    assert mode_of({"missing": True}) == "mixed"
