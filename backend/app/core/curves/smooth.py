"""Whittaker–Henderson (order 2) with per-point weights. Dense solve; n = 100."""
import numpy as np

from app import config


def _D2(n: int) -> np.ndarray:
    D = np.zeros((n - 2, n))
    for i in range(n - 2):
        D[i, i], D[i, i + 1], D[i, i + 2] = 1.0, -2.0, 1.0
    return D


def whittaker(y, sd, lam: float) -> list[float]:
    n = len(y)
    w = np.array(
        [
            0.0 if (v is None or s is None) else 1.0 / (float(s) ** 2 + config.WEIGHT_EPS)
            for v, s in zip(y, sd, strict=True)
        ]
    )
    if w.sum() == 0:
        return [0.0] * n
    if np.count_nonzero(w) < 2:
        v = next(v for v, wi in zip(y, w, strict=True) if wi > 0)
        return [float(v)] * n
    w = w / w[w > 0].mean()
    yy = np.array([0.0 if v is None else float(v) for v in y])
    D = _D2(n)
    A = np.diag(w) + lam * D.T @ D
    x = np.linalg.solve(A, w * yy)
    return [float(v) for v in x]


def smooth_pair(vals, sds, lam: float):
    curve = whittaker(vals, sds, lam)
    sd_curve = whittaker(sds, [0.3 if s is not None else None for s in sds], lam)
    lo = [c - s for c, s in zip(curve, sd_curve, strict=True)]
    hi = [c + s for c, s in zip(curve, sd_curve, strict=True)]
    return curve, lo, hi


def zscore(xs) -> list[float]:
    a = np.array(xs, dtype=float)
    sd = a.std()
    if sd < 1e-9:
        return [0.0] * len(xs)
    return [float(v) for v in (a - a.mean()) / sd]
