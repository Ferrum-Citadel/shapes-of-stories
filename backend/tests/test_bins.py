from app.core.curves.bins import beat_spans, bin_axis, bin_of_beat
from tests.curves_helpers import answers_for, make_work


def test_spans_are_cumulative_words():
    _, s = make_work(4, 600)
    spans = beat_spans(s)
    assert spans[0][0] == 0 and abs(spans[-1][1] - s.word_count) < 1e-9
    assert all(a < b for a, b in spans) and all(spans[i][1] == spans[i + 1][0] for i in range(3))


def test_bin_values_are_span_weighted_and_missing_is_none():
    _, s = make_work(10, 600)
    ans = answers_for(s, fortune=lambda i: float(i % 5))
    ans[5] = {"missing": True}
    vals, sds = bin_axis(s, ans, "fortune")
    assert len(vals) == 100 and vals[0] == 0.0 and sds[0] == 0.3
    lo, hi = bin_of_beat(s, 5)
    # interior bins of the missing beat are empty
    assert all(vals[b] is None for b in range(lo + 1, hi))
    assert vals[99] == 4.0  # beat 9 → 9 % 5 = 4


def test_bin_straddling_two_beats_is_weighted_mean():
    _, s = make_work(3, 500)  # 3 beats, bins of 15.x words; boundaries do not align
    ans = answers_for(s, fortune=lambda i: [0.0, 4.0, 4.0][i])
    vals, _ = bin_axis(s, ans, "fortune")
    lo, hi = bin_of_beat(s, 0)
    # bin 33 covers words 495-510: 5 words from beat 0 (0.0) and 10 from beat 1 (4.0)
    assert abs(vals[hi] - 8 / 3) < 1e-6
    assert vals[lo] == 0.0 and vals[99] == 4.0


def test_bin_of_beat_at_exact_boundaries():
    _, s = make_work(100, 600)
    for i in range(100):
        assert bin_of_beat(s, i) == (i, i)
