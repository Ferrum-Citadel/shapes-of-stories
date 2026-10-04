import asyncio
import json
from pathlib import Path

import httpx
import pytest

from app.core.jev.answers import normalize_answers
from app.core.jev.client import (
    FixtureJev,
    JevBadRequest,
    JevError,
    JevFixtureMissing,
    JevKeyRejected,
    JevRateLimited,
    LiveJev,
    SyntheticJev,
    make_client,
    record,
)
from app.core.jev.questions import build_questions
from app.core.jev.state import build_state, cache_key

Q = build_questions(True)
S = build_state("novel", "Ch 1", "", "The storm broke over the harbour and the boats fled.")


def test_synthetic_is_deterministic_and_normalizable():
    c = SyntheticJev()
    a1, m1 = asyncio.run(c.ask(S, Q))
    a2, _ = asyncio.run(c.ask(S, Q))
    assert a1 == a2 and m1 == "synthetic"
    n = normalize_answers(a1, m1)
    assert all(abs(sum(v["p"]) - 1) < 1e-6 for v in n["scores"].values())
    assert n["text_kind"]["choice"] in Q["text_kind"]["criteria"]
    b, _ = asyncio.run(c.ask(build_state("novel", "Ch 1", "", "A different passage entirely."), Q))
    assert b != a1


def test_fixture_roundtrip_and_missing(tmp_path: Path):
    f = tmp_path / "fx.json"
    key = cache_key(S, Q)
    record(f, key, {"x": 1}, "jev-1.13.0")
    c = FixtureJev(f)
    assert asyncio.run(c.ask(S, Q)) == ({"x": 1}, "jev-1.13.0")
    with pytest.raises(JevFixtureMissing):
        asyncio.run(c.ask(build_state("novel", "Ch 2", "", "other"), Q))


def test_make_client_modes(tmp_path):
    assert isinstance(make_client("synthetic"), SyntheticJev)
    assert isinstance(make_client("fixture", fixture_path=tmp_path / "a.json"), FixtureJev)
    with pytest.raises(ValueError):
        make_client("live")  # needs api_key


async def _no_sleep(_):
    pass


def make_live(handler, on_pause=None, budget=None):
    c = LiveJev("sk-test-KEY", on_pause=on_pause, transport=httpx.MockTransport(handler))
    if budget is not None:
        c.pause_budget_s = budget
    return c


def test_live_success_sends_model_and_bearer():
    seen = {}

    def handler(req: httpx.Request):
        seen["auth"] = req.headers["authorization"]
        seen["body"] = json.loads(req.content)
        return httpx.Response(
            200,
            json={"model": "jev-1.13.0", "answers": {"ok": {"type": "noul", "noul": 0.9}}},
        )

    a, m = asyncio.run(make_live(handler).ask(S, {"ok": {"type": "noul", "instructions": "x"}}))
    assert m == "jev-1.13.0"
    assert a["ok"]["noul"] == 0.9
    assert seen["auth"] == "Bearer sk-test-KEY"
    assert seen["body"]["model"] == "jev-1.13.0"
    assert seen["body"]["state"] == S


def test_live_sends_the_model_it_was_given():
    seen = {}

    def handler(req: httpx.Request):
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, json={"answers": {}})

    c = LiveJev("sk-test-KEY", transport=httpx.MockTransport(handler), model="jev-9.9.9")
    _, m = asyncio.run(c.ask(S, {}))
    assert seen["body"]["model"] == "jev-9.9.9" and m == "jev-9.9.9"
    assert make_client("live", api_key="sk-test-KEY", model="jev-9.9.9").model == "jev-9.9.9"


def test_live_key_rejected_and_bad_request():
    with pytest.raises(JevKeyRejected):
        c = make_live(lambda r: httpx.Response(401, json={"detail": "bad key"}))
        asyncio.run(c.ask(S, {}))
    with pytest.raises(JevBadRequest) as e:
        c = make_live(lambda r: httpx.Response(422, json={"detail": {"field": "criteria"}}))
        asyncio.run(c.ask(S, {}))
    assert e.value.detail == {"detail": {"field": "criteria"}}
    with pytest.raises(JevBadRequest) as e:
        c = make_live(lambda r: httpx.Response(422, text="<html>proxy error</html>"))
        asyncio.run(c.ask(S, {}))
    assert e.value.detail == {}


def test_live_429_pauses_then_succeeds_and_reports(monkeypatch):
    # a "0" retry-after is not finite/positive, so it falls back to the backoff (1.0, then
    # 2.0 after doubling); asyncio.sleep is mocked so the test doesn't actually wait 3s.
    monkeypatch.setattr("app.core.jev.client.asyncio.sleep", _no_sleep)
    calls, pauses = [], []

    async def on_pause(s):
        pauses.append(s)

    def handler(req):
        calls.append(1)
        if len(calls) < 3:
            return httpx.Response(429, headers={"retry-after": "0"}, json={})
        return httpx.Response(200, json={"model": "m", "answers": {}})

    a, _ = asyncio.run(make_live(handler, on_pause).ask(S, {}))
    assert len(calls) == 3 and pauses == [1.0, 2.0]


def test_live_zero_or_negative_retry_after_is_not_a_hot_loop(monkeypatch):
    monkeypatch.setattr("app.core.jev.client.asyncio.sleep", _no_sleep)
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(429, headers={"retry-after": "-1"}, json={})

    c = make_live(handler, budget=1.0)
    with pytest.raises(JevRateLimited):
        asyncio.run(c.ask(S, {}))
    assert len(calls) <= 3


def test_live_gives_up_after_pause_budget():
    async def on_pause(s):
        pass

    c = make_live(
        lambda r: httpx.Response(529, headers={"retry-after": "0.01"}, json={}),
        on_pause,
        budget=0.02,
    )
    with pytest.raises(JevRateLimited):
        asyncio.run(c.ask(S, {}))


def test_key_never_in_exception_text():
    try:
        asyncio.run(make_live(lambda r: httpx.Response(401, json={})).ask(S, {}))
    except JevKeyRejected as e:
        assert "sk-test" not in repr(e) and "sk-test" not in str(e)


def test_live_malformed_200_is_jev_error():
    with pytest.raises(JevError):
        c = make_live(lambda r: httpx.Response(200, json={"model": "m"}))
        asyncio.run(c.ask(S, {}))


def test_live_nonnumeric_retry_after_uses_backoff():
    calls, pauses = [], []

    async def on_pause(s):
        pauses.append(s)

    def handler(req):
        calls.append(1)
        if len(calls) < 2:
            return httpx.Response(
                429,
                headers={"retry-after": "Wed, 21 Oct 2026 07:28:00 GMT"},
                json={},
            )
        return httpx.Response(200, json={"model": "m", "answers": {}})

    asyncio.run(make_live(handler, on_pause).ask(S, {}))
    assert pauses == [1.0]
