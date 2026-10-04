import logging

from app.security import install_access_scrub
from app.sweeper import sweep
from tests.api_helpers import create, running_worker, wait_state


async def test_key_check_and_limit(client, monkeypatch):
    r = await client.post("/api/key/check", headers={"X-Jev-Key": "sk-good-1234567890"})
    assert r.status_code == 200 and r.json() == {"ok": True, "last4": "7890"}
    from app.core.jev import client as jc

    async def reject(self, s, q):
        raise jc.JevKeyRejected()

    monkeypatch.setattr(jc.SyntheticJev, "ask", reject)
    r = await client.post("/api/key/check", headers={"X-Jev-Key": "sk-bad-1234567890"})
    assert r.json() == {"ok": False, "error": "key_rejected"}

    async def bad_request(self, s, q):
        raise jc.JevBadRequest({})

    monkeypatch.setattr(jc.SyntheticJev, "ask", bad_request)
    r = await client.post("/api/key/check", headers={"X-Jev-Key": "sk-bad-1234567890"})
    assert r.json() == {"ok": False, "error": "unavailable"}
    for _ in range(2):
        await client.post("/api/key/check", headers={"X-Jev-Key": "sk-bad-1234567890"})
    r = await client.post("/api/key/check", headers={"X-Jev-Key": "sk-bad-1234567890"})
    assert r.status_code == 429


async def test_sweeper_expires_and_nulls(app, client, session, pool):
    wid = await create(client, session)
    async with running_worker(app):
        await wait_state(client, session, wid, {"complete"})
    async with pool.connection() as conn:
        await conn.execute(
            "update works set expires_at = now() - interval '1 minute' where id=%s", (wid,)
        )
        wid2 = await create(client, session)
        await conn.execute(
            "update jobs set created_at = now() - interval '25 hours' where work_id=%s", (wid2,)
        )
        await conn.execute(
            "update sessions set last_seen_at = now() - interval '200 days' where id=%s",
            (session["X-Session"],),
        )
    counts = await sweep(app.state.pool)
    assert counts["expired_works"] >= 1
    assert counts["texts_nulled"] >= 1
    assert counts["sessions_deleted"] == 1
    assert (await client.get(f"/api/works/{wid}")).status_code == 404


async def test_no_key_material_in_logs_or_responses(app, client, session, caplog, monkeypatch):
    from app.core.jev import client as jc

    caplog.set_level(logging.DEBUG)
    key = "sk-supersecret-ABCDEFGH"
    with monkeypatch.context() as m:
        async def reject(self, s, q):
            raise jc.JevKeyRejected()

        m.setattr(jc.SyntheticJev, "ask", reject)
        r1 = await client.post("/api/key/check", headers={"X-Jev-Key": key})
        r2 = await client.post(
            "/api/works", content=b"the cat sat " * 1000,
            headers={**session, "X-Filename": "n.txt", "X-Jev-Key": key},
        )
    assert key not in r1.text and key not in r2.text
    assert all(key not in rec.getMessage() for rec in caplog.records)

    # passage text must never leak into a response body (other than /api/preview,
    # which intentionally echoes the normalized text back to its own uploader) or into logs.
    sentinel = "The heliotrope umbrella sneezed twice."
    text = "\n\n".join(
        f"CHAPTER {i}\n\n" + ("The house was quiet and the river ran on. " * 100)
        + (f" {sentinel}" if i == 1 else "")
        for i in range(1, 9)
    ).encode()
    r_preview = await client.post("/api/preview", content=text, headers={"X-Filename": "n.txt"})
    assert sentinel in r_preview.text
    r_create = await client.post(
        "/api/works", content=text,
        headers={**session, "X-Filename": "n.txt", "X-Jev-Key": "sk-test-1234567890"},
    )
    assert sentinel not in r_create.text
    wid = r_create.json()["work_id"]
    async with running_worker(app):
        j = await wait_state(client, session, wid, {"complete", "failed"})
        assert j["state"] == "complete"
    r_get = await client.get(f"/api/works/{wid}", headers=session)
    assert sentinel not in r_get.text
    url = f"/api/works/{wid}/events?ticket={r_get.json()['events_ticket']}"
    async with client.stream("GET", url, timeout=10) as r:
        body = b""
        async for chunk in r.aiter_bytes():
            body += chunk
    assert sentinel.encode() not in body
    assert all(
        sentinel not in str(v)
        for rec in caplog.records
        for v in (rec.getMessage(), rec.exc_text, *rec.__dict__.values())
        if v is not None
    )


def test_the_access_log_never_carries_a_stream_ticket(caplog):
    install_access_scrub()
    log = logging.getLogger("uvicorn.access")
    caplog.set_level(logging.INFO, logger="uvicorn.access")
    line = '%s - "%s %s HTTP/%s" %d'
    log.info(line, "1.2.3.4:5", "GET", "/api/works/w1/events?ticket=abc123&since=2", "1.1", 200)
    log.info(line, "1.2.3.4:5", "GET", "/api/shared/tok?x=1", "1.1", 200)
    events, other = caplog.records[-2:]
    assert events.getMessage() == '1.2.3.4:5 - "GET /api/works/w1/events HTTP/1.1" 200'
    assert "ticket=" not in events.getMessage() and "/api/shared/tok?x=1" in other.getMessage()
