import math

import numpy as np
from scipy.fft import dct

from app import config
from app.core.curves.smooth import zscore

SHAPES: dict[str, str] = {
    "rise": "Rags to Riches",
    "fall": "Tragedy",
    "fall_rise": "Man in a Hole",
    "rise_fall": "Icarus",
    "rise_fall_rise": "Cinderella",
    "fall_rise_fall": "Oedipus",
}
_SIGNS = {
    "rise": (1, -1),
    "fall": (1, 1),
    "fall_rise": (2, 1),
    "rise_fall": (2, -1),
    "rise_fall_rise": (3, -1),
    "fall_rise_fall": (3, 1),
}


def dct_coeffs(x: list[float], k: int = 5) -> list[float]:
    c = dct(np.asarray(x, dtype=float), type=2)
    return [float(v) / 2 for v in c[1 : k + 1]]


def classify(fortune_shape: list[float]) -> dict:
    if float(np.std(fortune_shape)) < config.SHAPE_MIN_SD:
        return {
            "state": "none",
            "shape": None,
            "caption": "Which Way Is Up?",
            "r": 0.0,
            "margin": 0.0,
            "correlations": {k: 0.0 for k in SHAPES},
        }
    z = zscore(fortune_shape)
    c = dct_coeffs(z, 5)
    norm = math.sqrt(sum(v * v for v in c))
    corr = {
        name: (0.0 if norm == 0 else sign * c[k - 1] / norm) for name, (k, sign) in _SIGNS.items()
    }
    ranked = sorted(corr.items(), key=lambda kv: kv[1], reverse=True)
    (best, r), (_, second) = ranked[0], ranked[1]
    margin = r - second
    if r >= config.SHAPE_NAMED_R and margin >= config.SHAPE_MARGIN:
        state, shape, caption = "named", best, SHAPES[best]
    elif r >= config.SHAPE_LEANS_R:
        state, shape, caption = "leans", best, f"leans toward {SHAPES[best]}"
    else:
        state, shape, caption = "none", None, "Which Way Is Up?"
    return {
        "state": state,
        "shape": shape,
        "caption": caption,
        "r": round(r, 3),
        "margin": round(margin, 3),
        "correlations": {k: round(v, 3) for k, v in corr.items()},
    }
