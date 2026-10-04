from app.core.curves.smooth import smooth_pair, whittaker, zscore


def test_ramp_and_constant_preserved_any_lambda():
    ramp = [i / 99 * 4 for i in range(100)]
    for lam in (10, 200, 5000):
        out = whittaker(ramp, [0.3] * 100, lam)
        assert max(abs(a - b) for a, b in zip(out, ramp, strict=True)) < 1e-6
    assert all(abs(v - 2.0) < 1e-9 for v in whittaker([2.0] * 100, [0.3] * 100, 200))


def test_no_ripple_and_end_slope_kept():
    y = [0.0] * 50 + [4.0] * 50                    # step
    out = whittaker(y, [0.3] * 100, 200)
    assert -0.3 < min(out) and max(out) < 4.3        # small overshoot at most
    assert max(out[i] - out[i + 1] for i in range(99)) < 0.05  # bounded ripple
    rising = [i / 99 * 4 for i in range(100)]
    out = whittaker(rising, [0.3] * 100, 200)
    assert out[99] - out[98] > 0.03                  # slope survives at the edge


def test_empty_bins_are_interpolated_and_low_sd_dominates():
    y = [1.0] * 40 + [None] * 20 + [3.0] * 40
    out = whittaker(y, [0.3] * 40 + [None] * 20 + [0.3] * 40, 10)
    assert 1.0 < out[50] < 3.0
    y2 = [2.0] * 100
    y2[50] = 4.0
    tight = whittaker(y2, [0.3] * 50 + [0.05] + [0.3] * 49, 10)
    loose = whittaker(y2, [0.3] * 50 + [1.0] + [0.3] * 49, 10)
    assert tight[50] > loose[50]


def test_all_empty_gives_zeros_and_band_shape():
    assert whittaker([None] * 100, [None] * 100, 200) == [0.0] * 100
    c, lo, hi = smooth_pair([2.0] * 100, [0.5] * 100, 200)
    assert all(abs(h - lv - 1.0) < 1e-6 for lv, h in zip(lo, hi, strict=True)) and len(c) == 100


def test_single_bin_gives_constant():
    y = [None] * 100
    y[37] = 5.0
    sd = [None] * 100
    sd[37] = 0.3
    assert whittaker(y, sd, 200) == [5.0] * 100


def test_zscore():
    z = zscore([1, 2, 3])
    assert abs(sum(z)) < 1e-9 and abs(z[2] - 1.2247) < 1e-3
    assert zscore([5, 5, 5]) == [0.0, 0.0, 0.0]
