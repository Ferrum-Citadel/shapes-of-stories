from app import config
from app.core.curves.bins import _total, beat_spans
from app.core.structure import Structure


def beat_for_bin(s: Structure, k: int) -> int:
    spans = beat_spans(s)
    total = _total(s)
    origin = spans[0][0]
    n = config.BINS
    lo, hi = k * total / n + origin, (k + 1) * total / n + origin
    best, best_ov = 0, -1.0
    for i, (a, b) in enumerate(spans):
        ov = min(b, hi) - max(a, lo)
        if ov > best_ov:
            best, best_ov = i, ov
    return best


def _local_maxima(y: list[float]) -> list[int]:
    n = len(y)
    out = []
    for i in range(n):
        left = y[i] > y[i - 1] if i > 0 else True
        right = y[i] >= y[i + 1] if i < n - 1 else True
        if left and right:
            out.append(i)
    return out


def peak_targets(
    s: Structure, detail_curves: dict[str, list[float]], skip: set[int] = frozenset()
) -> list[tuple[str, int]]:
    out = []
    for axis, curve in detail_curves.items():
        if max(curve) - min(curve) < 1e-9:
            continue  # flat: no meaningful peak
        maxima = sorted(_local_maxima(curve), key=lambda i: -curve[i])
        seen: set[int] = set()
        for k in maxima:
            b = beat_for_bin(s, k)
            if b in seen or b in skip:
                continue
            seen.add(b)
            out.append((axis, b))
            if len(seen) >= config.PEAKS_PER_AXIS:
                break
    return out
