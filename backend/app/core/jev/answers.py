import math

from app.core.jev.questions import AXES, EVENTS


def score_sd(p: list[float], score: float) -> float:
    return math.sqrt(sum(pi * (i - score) ** 2 for i, pi in enumerate(p)))


def _choice(a: dict) -> dict:
    return {"choice": a["choice"], "confidence": float(a.get("confidence", 0.0))}


def normalize_answers(raw: dict, model: str) -> dict:
    try:
        scores = {}
        for axis in AXES:
            a = raw.get(axis)
            if not a or a.get("type") != "score":
                raise ValueError(f"missing score answer: {axis}")
            p = [float(a["probabilities"].get(str(i), 0.0)) for i in range(5)]
            s = float(a["score"])
            scores[axis] = {
                "score": s,
                "p": p,
                "confidence": float(a.get("confidence", 0.0)),
                "sd": score_sd(p, s),
            }
        events = {}
        for name in EVENTS:
            a = raw.get(name)
            if not a or a.get("type") != "noul":
                raise ValueError(f"missing noul answer: {name}")
            events[name] = float(a["noul"])
        if "mode" not in raw:
            raise ValueError("missing mode")
        out = {
            "model": model,
            "scores": scores,
            "events": events,
            "mode": _choice(raw["mode"]),
        }
        if "text_kind" in raw:
            out["text_kind"] = _choice(raw["text_kind"])
        return out
    except (KeyError, TypeError, AttributeError) as e:
        raise ValueError(f"malformed answer: {e!r}") from None
