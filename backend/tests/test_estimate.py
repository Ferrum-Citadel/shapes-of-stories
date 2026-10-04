import pytest

from app.core.errors import IngestError
from app.core.estimate import check_caps, estimate


def test_novel_estimate_requests_tokens_cost_and_seconds():
    e = estimate(90_000, 112)
    assert e.requests == 152 and 500_000 < e.tokens < 520_000
    assert e.cost_usd == 0.03 and 17 < e.seconds < 19
    # ceil to cent; 152/8*0.25=4.75 vs 152/20=7.6 → 17.6


def test_caps():
    check_caps(600_000, 10)
    with pytest.raises(IngestError) as e:
        check_caps(600_001, 10)
    assert e.value.code == "over_word_cap" and e.value.detail["cap"] == 600_000
    with pytest.raises(IngestError) as e:
        check_caps(10, 50 * 1024 * 1024 + 1)
    assert e.value.code == "over_upload_cap"
