import asyncio
from types import SimpleNamespace

from app.api import deps
from app.api.deps import events_ticket
from app.core.estimate import estimate
from tests.api_helpers import NOVEL, create, run_to_complete, running_worker, wait_state


async def test_create_work_requires_session_and_key_and_stores_encrypted(client, session, pool):
    r = await client.post("/api/works", content=NOVEL, headers={"X-Filename": "n.txt"})
    assert r.status_code == 401
    r = await client.post("/api/works", content=NOVEL, headers={**session, "X-Filename": "n.txt"})
    assert r.status_code == 400 and r.json()["error"] == "missing_key"
    r = await client.post(
        "/api/works",
        content=NOVEL,
        headers={**session, "X-Filename": "n.txt", "X-Jev-Key": "sk-test-1234567890"},
    )
    assert r.status_code == 201
    wid = r.json()["work_id"]
    assert len(wid) == 22 and r.json()["structure"]["beats"]
    async with pool.connection() as conn:
        cur = await conn.execute(
            "select text_ciphertext, key_ciphertext from jobs where work_id=%s", (wid,)
        )
        row = await cur.fetchone()
        assert b"CHAPTER" not in bytes(row["text_ciphertext"])
        assert b"sk-test" not in bytes(row["key_ciphertext"])
        cur = await conn.execute("select structure::text as s from works where id=%s", (wid,))
        assert "river ran" not in (await cur.fetchone())["s"]
    r = await client.get(f"/api/works/{wid}", headers=session)
    assert r.status_code == 200 and r.json()["state"] == "queued"
    assert r.json()["total"] == len(r.json()["structure"]["beats"])
    assert (await client.get("/api/works/doesnotexist")).status_code == 404


async def test_work_view_carries_the_preview_estimate(client, session):
    r = await client.post(
        "/api/works",
        content=NOVEL,
        headers={**session, "X-Filename": "n.txt", "X-Jev-Key": "sk-test-1234567890"},
    )
    j = (await client.get(f"/api/works/{r.json()['work_id']}", headers=session)).json()
    want = estimate(j["word_count"], len(j["structure"]["beats"])).cost_usd
    assert j["cost_usd"] == want > 0


async def test_reading_a_work_keeps_its_session_alive(client, session, pool):
    wid = await create(client, session)
    sql = "select last_seen_at < now() - interval '1 day' as idle from sessions where id=%s"
    async with pool.connection() as conn:
        await conn.execute(
            "update sessions set last_seen_at = now() - interval '9 days' where id=%s",
            (session["X-Session"],),
        )
        await client.get(f"/api/works/{wid}", headers=session)
        assert not (await (await conn.execute(sql, (session["X-Session"],))).fetchone())["idle"]


async def test_an_expired_work_is_gone_before_the_sweep(client, session, pool):
    wid = await create(client, session)
    ticket = (await client.get(f"/api/works/{wid}", headers=session)).json()["events_ticket"]
    async with pool.connection() as conn:
        await conn.execute(
            "update works set expires_at = now() - interval '1 second' where id=%s", (wid,)
        )
    assert (await client.get(f"/api/works/{wid}", headers=session)).status_code == 404
    assert (await client.get(f"/api/works/{wid}/events?ticket={ticket}")).status_code == 404
    assert (await client.get("/api/session/works", headers=session)).json()["works"] == []


async def test_session_running_limit(client, session):
    h = {**session, "X-Filename": "n.txt", "X-Jev-Key": "sk-test-1234567890"}
    for _ in range(2):
        r = await client.post("/api/works", content=NOVEL, headers=h)
        assert r.status_code == 201
    r = await client.post("/api/works", content=NOVEL, headers=h)
    assert r.status_code == 409 and r.json()["error"] == "limit_session_running"


async def test_parallel_uploads_respect_the_running_limit(client, session, monkeypatch):
    from app import config

    monkeypatch.setattr(config, "SESSION_RUNNING_MAX", 1)
    h = {**session, "X-Filename": "n.txt", "X-Jev-Key": "sk-test-1234567890"}
    url = "/api/works"
    rs = await asyncio.gather(*(client.post(url, content=NOVEL, headers=h) for _ in range(4)))
    assert sorted(r.status_code for r in rs) == [201, 409, 409, 409]


async def test_a_file_that_fails_to_parse_uses_no_analysis(client, session, monkeypatch):
    from app import config

    monkeypatch.setattr(config, "SESSION_ANALYSES_PER_DAY", 1)
    h = {**session, "X-Jev-Key": "sk-test-1234567890"}
    r = await client.post("/api/works", content=b"%PDF-1.4", headers={**h, "X-Filename": "x.pdf"})
    assert r.status_code == 415
    r = await client.post("/api/works", content=NOVEL, headers={**h, "X-Filename": "n.txt"})
    assert r.status_code == 201
    r = await client.post("/api/works", content=NOVEL, headers={**h, "X-Filename": "n.txt"})
    assert r.status_code == 429 and r.json()["detail"]["bucket"] == "analyses"


async def test_resume_runs_the_same_limits_as_an_upload(client, session, pool, monkeypatch):
    from app import config

    failed = [await create(client, session) for _ in range(2)]
    async with pool.connection() as conn:
        await conn.execute("update works set state='failed' where id = any(%s)", (failed,))
    await create(client, session)
    h = {**session, "X-Jev-Key": "sk-test-1234567890"}
    assert (await client.post(f"/api/works/{failed[0]}/resume", headers=h)).status_code == 200
    r = await client.post(f"/api/works/{failed[1]}/resume", headers=h)
    assert r.status_code == 409 and r.json()["error"] == "limit_session_running"
    monkeypatch.setattr(config, "SESSION_RUNNING_MAX", 10)
    monkeypatch.setattr(config, "SESSION_ANALYSES_PER_DAY", 4)
    r = await client.post(f"/api/works/{failed[1]}/resume", headers=h)
    assert r.status_code == 429 and r.json()["detail"]["bucket"] == "analyses"
    monkeypatch.setattr(config, "SESSION_ANALYSES_PER_DAY", 20)
    monkeypatch.setattr(config, "RUNNING_JOBS_MAX", 1)
    monkeypatch.setattr(config, "QUEUED_MAX", 1)
    r = await client.post(f"/api/works/{failed[1]}/resume", headers=h)
    assert r.status_code == 409 and r.json()["error"] == "limit_instance_busy"


async def test_queue_guard_and_queue_position(app, client):
    wids = []
    for _ in range(4):
        h = {
            "X-Session": (await client.post("/api/session")).json()["session_id"],
            "X-Filename": "n.txt",
            "X-Jev-Key": "sk-test-1234567890",
        }
        for _ in range(2):
            r = await client.post("/api/works", content=NOVEL, headers=h)
            assert r.status_code == 201
            wids.append((r.json()["work_id"], {"X-Session": h["X-Session"]}))

    h9 = {
        "X-Session": (await client.post("/api/session")).json()["session_id"],
        "X-Filename": "n.txt",
        "X-Jev-Key": "sk-test-1234567890",
    }
    r = await client.post("/api/works", content=NOVEL, headers=h9)
    assert r.status_code == 409 and r.json()["error"] == "limit_instance_busy"

    j1 = (await client.get(f"/api/works/{wids[0][0]}", headers=wids[0][1])).json()
    j2 = (await client.get(f"/api/works/{wids[1][0]}", headers=wids[1][1])).json()
    assert j1["queue_position"] == 1
    assert j2["queue_position"] == 2

    async with running_worker(app):
        j = await wait_state(client, wids[0][1], wids[0][0], {"running", "complete", "failed"})
        assert j["queue_position"] is None


async def test_cancel_running_job(app, client, session, pool, monkeypatch):
    from app.core.jev import client as jc

    orig = jc.SyntheticJev.ask

    async def slow(self, s, q):
        await asyncio.sleep(0.2)
        return await orig(self, s, q)

    monkeypatch.setattr(jc.SyntheticJev, "ask", slow)
    wid = await create(client, session)
    async with running_worker(app):
        await wait_state(client, session, wid, {"running"})
        r = await client.post(f"/api/works/{wid}/cancel", headers=session)
        assert r.status_code == 200
        j = await wait_state(client, session, wid, {"cancelled"})
        assert j["state"] == "cancelled"
        r = await client.post(f"/api/works/{wid}/cancel", headers=session)
        assert r.status_code == 409 and r.json()["error"] == "not_running"
        async with pool.connection() as conn:
            cur = await conn.execute("select text_ciphertext from jobs where work_id=%s", (wid,))
            assert (await cur.fetchone())["text_ciphertext"] is None


async def test_a_work_is_visible_only_to_its_owner(app, client, session):
    wid = await run_to_complete(app, client, session)
    other = {"X-Session": (await client.post("/api/session")).json()["session_id"]}
    own = await client.get(f"/api/works/{wid}", headers=session)
    assert own.status_code == 200 and own.json()["analysis"]
    for headers in (other, {}, {"X-Session": "nope"}):
        assert (await client.get(f"/api/works/{wid}", headers=headers)).status_code == 404
    events = f"/api/works/{wid}/events"
    ticket = own.json()["events_ticket"]
    async with client.stream("GET", f"{events}?ticket={ticket}", timeout=10) as r:
        assert r.status_code == 200
    stranger = (await client.get(f"/api/works/{wid}", headers=other)).json()
    assert "events_ticket" not in stranger
    for bad in ("", "?ticket=", "?ticket=" + "0" * 64, "?ticket=%C3%A9"):
        assert (await client.get(events + bad)).status_code == 404


async def test_an_events_ticket_lasts_into_the_next_hour_and_no_longer(
    app, client, session, monkeypatch
):
    wid = await run_to_complete(app, client, session)
    secret, hour = app.state.settings.server_secret, 490_000
    monkeypatch.setattr(deps, "time", SimpleNamespace(time=lambda: hour * 3600 + 1800))
    events = f"/api/works/{wid}/events?ticket="
    for h in (hour, hour - 1):
        async with client.stream("GET", events + events_ticket(secret, wid, h)) as r:
            assert r.status_code == 200
    for ticket in (events_ticket(secret, wid, hour - 2), events_ticket("other", wid, hour)):
        assert (await client.get(events + ticket)).status_code == 404


async def test_strangers_get_404_from_every_route_of_a_work(app, client, session):
    wid = await run_to_complete(app, client, session)
    other = {"X-Session": (await client.post("/api/session")).json()["session_id"]}
    w = f"/api/works/{wid}"
    routes = [
        ("GET", w),
        ("GET", f"{w}/events"),
        ("POST", f"{w}/keep"),
        ("POST", f"{w}/cancel"),
        ("POST", f"{w}/resume"),
        ("GET", f"{w}/share"),
        ("POST", f"{w}/share"),
        ("DELETE", f"{w}/share"),
        ("DELETE", w),
    ]
    for method, url in routes:
        r = await client.request(method, url, headers={**other, "X-Jev-Key": "sk-test-12345678"})
        assert r.status_code == 404, (method, url, r.status_code)
    # Without any session the owner's routes still ask for one.
    assert (await client.post(f"{w}/keep")).status_code == 401
    assert (await client.get(w, headers=session)).status_code == 200
