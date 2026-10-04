from collections import Counter

from app import config
from app.core.curves.bins import bin_axis
from app.core.curves.chapters import chapter_stats
from app.core.curves.classify import classify
from app.core.curves.events import mode_of, select_events
from app.core.curves.peaks import peak_targets
from app.core.curves.smooth import smooth_pair, zscore
from app.core.jev.questions import AXES
from app.core.jev.scorer import DRIVER_CONFIDENCE
from app.core.structure import Structure

ANALYSIS_VERSION = 1


def _clip(xs: list[float]) -> list[float]:
    return [min(4.0, max(0.0, v)) for v in xs]


def smooth_bins(raw: list, sd: list) -> tuple[dict, list[float], list[float]]:
    """One axis's stored bins block plus the unclipped shape and detail curves."""
    shape, s_lo, s_hi = smooth_pair(raw, sd, config.WHITTAKER_SHAPE)
    detail, d_lo, d_hi = smooth_pair(raw, sd, config.WHITTAKER_DETAIL)
    # Stored curves are clipped to the 0–4 score scale for display, while z and the returned
    # curves keep the unclipped values so classification and peak targets use the smoother's
    # own output.
    block = {
        "raw": raw,
        "sd": sd,
        "shape": _clip(shape),
        "detail": _clip(detail),
        "band": {"shape": [_clip(s_lo), _clip(s_hi)], "detail": [_clip(d_lo), _clip(d_hi)]},
        "z": zscore(shape),
    }
    return block, shape, detail


def kept_answer(a: dict) -> dict:
    """What an analysis reads of a passage's answer, at two decimals, so a gallery work is
    derived exactly from the answers file it stores and an upload is derived the same way; one
    decimal would move a curve by up to 0.2."""
    if a.get("missing"):
        return a
    return {
        "scores": {
            ax: {"score": round(v["score"], 2), "sd": round(v["sd"], 2)}
            for ax, v in a["scores"].items()
        },
        "events": {k: round(p, 2) for k, p in a["events"].items()},
        "mode": {k: v if k == "choice" else round(v, 2) for k, v in a.get("mode", {}).items()},
    }


def build_analysis(
    s: Structure, answers: dict[int, dict], drivers: dict[str, dict[int, dict]] | None = None
) -> dict:
    answers = {int(k): kept_answer(v) for k, v in answers.items()}
    bins, shape_curves, detail_curves, empty = {}, {}, {}, set()
    for axis in AXES:
        raw, sd = bin_axis(s, answers, axis)
        empty |= {i for i, v in enumerate(raw) if v is None}
        bins[axis], shape_curves[axis], detail_curves[axis] = smooth_bins(raw, sd)
    events = select_events(s, answers)
    missing = {i for i, a in answers.items() if a.get("missing")}
    scored = [b for b in s.beats if answers.get(b.idx) and b.idx not in missing]
    modes = Counter(mode_of(answers[b.idx]) for b in scored)
    mode_share = {m: round(c / len(scored), 3) for m, c in modes.items()} if scored else {}
    return {
        "version": ANALYSIS_VERSION,
        "axes": list(AXES),
        "bins": bins,
        "empty_bins": sorted(empty),
        "missing_beats": sorted(missing),
        "archetype": classify(shape_curves["fortune"]),
        "events": events,
        "chapters": chapter_stats(s, answers, events),
        "mode_share": mode_share,
        "drivers": {ax: {str(b): v for b, v in d.items()} for ax, d in (drivers or {}).items()},
        # Every pick and its confidence are stored; consumers highlight only at or above this gate.
        "driver_gate": DRIVER_CONFIDENCE,
        "peak_targets": [[ax, b] for ax, b in peak_targets(s, detail_curves, missing)][
            : config.DRIVER_CALLS
        ],
    }


# The chart cannot show more than 3 decimals; the per-bin scores the curves are smoothed from
# keep 5, the fewest with which every stored work's classification is unchanged by rounding.
DISPLAY, SOURCE = 3, 5


def rounded(x, digits=DISPLAY):
    if isinstance(x, float):
        return round(x, digits)
    if isinstance(x, list):
        return [rounded(v, digits) for v in x]
    if isinstance(x, dict):
        return {k: rounded(v, SOURCE if k in ("raw", "sd") else digits) for k, v in x.items()}
    return x


def finish_analysis(analysis: dict) -> dict:
    """Smooths every axis again from its per-bin scores at their stored precision, classifies
    the fortune curve again and rounds, so a stored analysis is exactly what a recurve of it
    would give."""
    bins, archetype = {}, None
    for axis, b in analysis["bins"].items():
        bins[axis], shape, _ = smooth_bins(rounded(b["raw"], SOURCE), rounded(b["sd"], SOURCE))
        if axis == "fortune":
            archetype = classify(shape)
    return rounded({**analysis, "bins": bins, "archetype": archetype})
