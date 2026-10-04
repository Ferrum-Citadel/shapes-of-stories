import json
import math

from app import config
from app.core.curves.analysis import build_analysis
from app.core.curves.bins import bin_axis
from app.core.curves.classify import classify
from app.core.curves.smooth import smooth_pair, zscore
from app.core.jev.scorer import DRIVER_CONFIDENCE
from tests.curves_helpers import answers_for, make_work


def test_analysis_shape_and_json_serialisable():
    _, s = make_work(30, 600)
    # fall-rise -> Man in a Hole
    ans = answers_for(s, fortune=lambda i: 2 + 2 * math.cos(2 * math.pi * i / 29))
    ans[7] = {"missing": True}
    a = build_analysis(s, ans, drivers={"tension": {3: {"paragraph_idx": 1, "confidence": 0.7}}})
    json.dumps(a, allow_nan=False)
    assert a["version"] == 1 and len(a["axes"]) == 10
    f = a["bins"]["fortune"]
    assert all(len(f[k]) == 100 for k in ("raw", "sd", "shape", "detail", "z"))
    assert len(f["band"]["shape"][0]) == 100
    assert a["archetype"]["shape"] == "fall_rise" and a["archetype"]["state"] == "named"
    assert 7 in a["missing_beats"] and a["empty_bins"]
    assert a["drivers"]["tension"]["3"]["paragraph_idx"] == 1 and len(a["peak_targets"]) <= 40
    assert a["driver_gate"] == DRIVER_CONFIDENCE
    assert abs(sum(a["mode_share"].values()) - 1) < 1e-6 and len(a["chapters"]) == 30
    assert "mixed" not in a["mode_share"]


def test_display_preset_never_changes_archetype(monkeypatch):
    _, s = make_work(30, 600)
    ans = answers_for(s, fortune=lambda i: 4 * i / 29)
    default = build_analysis(s, ans)["archetype"]
    assert default["shape"] == "rise"
    for detail in (1.0, 100.0):
        monkeypatch.setattr(config, "WHITTAKER_DETAIL", detail)
        assert build_analysis(s, ans)["archetype"] == default


def test_constant_fortune_through_pipeline_is_none():
    _, s = make_work(30, 600)
    ans = answers_for(s, fortune=lambda i: 2.0)
    a = build_analysis(s, ans)
    assert a["archetype"]["state"] == "none"


def test_build_analysis_coerces_string_answer_keys():
    _, s = make_work(10, 600)
    ans = answers_for(s, fortune=lambda i: float(i % 5))
    assert build_analysis(s, {str(k): v for k, v in ans.items()}) == build_analysis(s, ans)


def test_stored_curves_are_bounded_while_the_classifier_sees_the_smoother_output():
    _, s = make_work(30, 600)
    ans = answers_for(s, fortune=lambda i: 0.0 if i < 25 else 4.0)
    raw, sd = bin_axis(s, ans, "fortune")
    smoothed, lo, _ = smooth_pair(raw, sd, config.WHITTAKER_SHAPE)
    assert max(smoothed) > 4 and min(lo) < 0
    a = build_analysis(s, ans)
    f = a["bins"]["fortune"]
    assert max(f["shape"]) == 4.0 and min(f["band"]["shape"][0]) == 0.0
    assert min(f["shape"]) >= 0 and max(f["detail"]) <= 4 and max(f["band"]["shape"][1]) <= 4
    assert a["archetype"] == classify(smoothed) != classify(f["shape"])
    assert f["z"] == zscore(smoothed) and f["raw"] == raw
