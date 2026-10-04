"""Build a Structure and synthetic answers for curve tests without touching Jev."""
from app.core.ingest import parse
from app.core.jev.questions import AXES, EVENTS
from app.core.structure import build_structure


def make_work(n_beats=20, words_per_beat=600):
    text = "\n\n".join(
        f"CHAPTER {i}\n\n" + ("w " * words_per_beat).strip() for i in range(1, n_beats + 1)
    )
    p = parse(text.encode(), "t.txt")
    return p.text, build_structure(p)


def answers_for(structure, fortune=None, sd=0.3, events=None, mode="action", conf=0.9):
    """fortune: function idx -> score in 0..4 ; events: {(idx, name): prob}"""
    out = {}
    for b in structure.beats:
        f = fortune(b.idx) if fortune else 2.0
        scores = {
            ax: {"score": f if ax == "fortune" else 2.0, "p": [0, 0, 1, 0, 0],
                 "confidence": 0.9, "sd": sd}
            for ax in AXES
        }
        ev = {e: (events or {}).get((b.idx, e), 0.05) for e in EVENTS}
        out[b.idx] = {
            "model": "t", "scores": scores, "events": ev,
            "mode": {"choice": mode, "confidence": conf},
        }
    return out
