from app import config
from app.core.structure import Structure


def beat_spans(s: Structure) -> list[tuple[float, float]]:
    if s.preset == "transcript":
        return [(b.start_s, b.end_s) for b in s.beats]
    out, pos = [], 0.0
    for b in s.beats:
        out.append((pos, pos + b.word_count))
        pos += b.word_count
    return out


def _total(s: Structure) -> float:
    spans = beat_spans(s)
    return spans[-1][1] - spans[0][0] if spans else 0.0


def bin_of_beat(s: Structure, idx: int) -> tuple[int, int]:
    spans = beat_spans(s)
    total = _total(s)
    origin = spans[0][0]
    a, b = spans[idx]
    n = config.BINS
    lo = min(n - 1, int((a - origin) / total * n + 1e-9))
    hi = min(n - 1, int(((b - origin) / total * n) - 1e-9))
    return lo, max(lo, hi)


def bin_axis(s: Structure, answers: dict[int, dict], axis: str):
    n = config.BINS
    spans = beat_spans(s)
    total = _total(s)
    origin = spans[0][0]
    num = [0.0] * n
    sdnum = [0.0] * n
    den = [0.0] * n
    for b in s.beats:
        a = answers.get(b.idx)
        if not a or a.get("missing"):
            continue
        sc = a["scores"][axis]
        x0 = (spans[b.idx][0] - origin) / total * n
        x1 = (spans[b.idx][1] - origin) / total * n
        for k in range(max(0, int(x0)), min(n, int(x1 - 1e-9) + 1)):
            overlap = min(x1, k + 1) - max(x0, k)
            if overlap <= 0:
                continue
            num[k] += overlap * sc["score"]
            sdnum[k] += overlap * sc["sd"]
            den[k] += overlap
    vals = [num[k] / den[k] if den[k] > 0 else None for k in range(n)]
    sds = [sdnum[k] / den[k] if den[k] > 0 else None for k in range(n)]
    return vals, sds
