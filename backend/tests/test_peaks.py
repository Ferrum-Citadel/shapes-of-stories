import math

from app.core.curves.peaks import beat_for_bin, peak_targets
from tests.curves_helpers import make_work


def test_peaks_pick_top_four_distinct_beats():
    _, s = make_work(20, 600)
    curve = [2 + math.sin(i / 100 * 6 * math.pi) for i in range(100)]      # 3 peaks
    flat = [1.0] * 100
    targets = peak_targets(s, {"tension": curve, "pace": flat})
    t = [b for a, b in targets if a == "tension"]
    assert 1 <= len(t) <= 4 and len(set(t)) == len(t)
    assert all(a != "pace" for a, _ in targets)  # a flat curve has no peaks
    assert beat_for_bin(s, 0) == 0 and beat_for_bin(s, 99) == 19


def test_peak_targets_skips_missing_beats():
    _, s = make_work(20, 600)
    curve = [2 + math.sin(i / 100 * 6 * math.pi) for i in range(100)]
    without = peak_targets(s, {"tension": curve})
    top_beat = without[0][1]
    with_skip = peak_targets(s, {"tension": curve}, skip={top_beat})
    assert top_beat not in [b for _, b in with_skip]
    assert with_skip[0][1] == without[1][1]
