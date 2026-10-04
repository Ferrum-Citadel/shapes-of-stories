import math
import random

from app.core.curves.classify import classify, dct_coeffs

T = [(i + 0.5) / 100 for i in range(100)]
TEMPLATES = {
    "rise": [-math.cos(math.pi * t) for t in T],
    "fall": [math.cos(math.pi * t) for t in T],
    "fall_rise": [math.cos(2 * math.pi * t) for t in T],
    "rise_fall": [-math.cos(2 * math.pi * t) for t in T],
    "rise_fall_rise": [-math.cos(3 * math.pi * t) for t in T],
    "fall_rise_fall": [math.cos(3 * math.pi * t) for t in T],
}


def test_each_template_recovered_with_noise():
    rng = random.Random(1)
    for name, tpl in TEMPLATES.items():
        noisy = [v + rng.gauss(0, 0.25) for v in tpl]
        res = classify(noisy)
        assert res["shape"] == name and res["state"] == "named", (name, res)


def test_constant_curve_is_no_clear_shape():
    res = classify([0.0] * 100)
    assert res["state"] == "none" and res["caption"] == "Which Way Is Up?"


def test_flat_and_nearly_flat_curves_are_none():
    assert classify([2.0] * 100)["state"] == "none"
    assert classify([2.0 + 0.01 * ((i % 7) - 3) for i in range(100)])["state"] == "none"


def test_mixture_leans():
    mix = [
        a + 0.8 * b
        for a, b in zip(TEMPLATES["fall_rise"], TEMPLATES["rise_fall_rise"], strict=True)
    ]
    res = classify(mix)
    assert res["state"] in ("leans", "named") and res["margin"] < 0.35


def test_dct_first_coefficient_sign_for_rise():
    c = dct_coeffs(TEMPLATES["rise"])
    assert c[0] < 0 and abs(c[1]) < 1e-6 and len(c) == 5


def test_rise_fall_rise_is_called_cinderella():
    assert classify(TEMPLATES["rise_fall_rise"])["caption"] == "Cinderella"
