from app import config
from app.core.curves.bins import bin_of_beat
from app.core.jev.questions import EVENTS
from app.core.structure import Structure


def mode_of(answer: dict) -> str:
    m = answer.get("mode") or {}
    if (
        answer.get("missing")
        or m.get("confidence", 0) < config.MODE_MIXED_CONFIDENCE
        or "choice" not in m
    ):
        return "mixed"
    return m["choice"]


def select_events(s: Structure, answers: dict[int, dict]) -> list[dict]:
    cands = []
    for b in s.beats:
        a = answers.get(b.idx)
        if not a or a.get("missing"):
            continue
        lo, hi = bin_of_beat(s, b.idx)
        for name in EVENTS:
            faint, strong = config.EVENT_FAINT[name], config.EVENT_STRONG[name]
            p = a["events"].get(name, 0.0)
            if p >= faint:
                cands.append({
                    "type": name, "beat_idx": b.idx, "bin": (lo + hi) // 2,
                    "probability": round(p, 3),
                    "strength": "strong" if p >= strong else "faint",
                })
    cands.sort(key=lambda e: -e["probability"])
    kept: list[dict] = []
    for c in cands:
        if all(
            k["type"] != c["type"] or abs(k["bin"] - c["bin"]) >= config.EVENT_MIN_BIN_GAP
            for k in kept
        ):
            kept.append(c)
    return sorted(kept, key=lambda e: (e["bin"], e["type"]))
