import importlib

from app import config
from app.core.jev.questions import EVENTS


def test_event_thresholds_are_per_type():
    assert set(config.EVENT_STRONG) == set(config.EVENT_FAINT) == set(EVENTS)
    assert (config.EVENT_FAINT["death"], config.EVENT_STRONG["death"]) == (0.40, 0.55)


def test_every_faint_threshold_is_strictly_below_its_strong():
    assert all(config.EVENT_FAINT[e] < config.EVENT_STRONG[e] for e in EVENTS)


def test_env_override(monkeypatch):
    monkeypatch.setenv("WORD_CAP", "1000")
    importlib.reload(config)
    assert config.WORD_CAP == 1000
    monkeypatch.delenv("WORD_CAP")
    importlib.reload(config)
    assert config.WORD_CAP == 600_000
