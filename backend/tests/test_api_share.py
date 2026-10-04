import asyncio

from tests.api_helpers import create, run_to_complete


async def test_keep_requires_complete(client, session):
    wid = await create(client, session)  # stays queued: worker is not running
    r = await client.post(f"/api/works/{wid}/keep", headers=session)
    assert r.status_code == 409 and r.json()["error"] == "not_complete"


async def test_keep_share_revoke_delete(app, client, session):
    wid = await run_to_complete(app, client, session)
    other = {"X-Session": (await client.post("/api/session")).json()["session_id"]}
    r = await client.post(f"/api/works/{wid}/share", headers=session)
    assert r.status_code == 409  # not kept
    assert (await client.post(f"/api/works/{wid}/keep", headers=other)).status_code == 404
    r = await client.post(f"/api/works/{wid}/keep", headers=session)
    assert r.json() == {"kept": True}
    assert (await client.get(f"/api/works/{wid}", headers=session)).json()["expires_at"] is None
    tok = (await client.post(f"/api/works/{wid}/share", headers=session)).json()["token"]
    r = await client.get(f"/api/shared/{tok}")
    assert r.status_code == 200 and "session_id" not in r.json() and r.json()["analysis"]
    assert (await client.delete(f"/api/works/{wid}/share", headers=session)).status_code == 204
    assert (await client.get(f"/api/shared/{tok}")).status_code == 404
    works = (await client.get("/api/session/works", headers=session)).json()["works"]
    assert works[0]["id"] == wid
    assert (await client.delete(f"/api/works/{wid}", headers=session)).status_code == 204
    assert (await client.get(f"/api/works/{wid}", headers=session)).status_code == 404


async def test_shared_view_carries_nothing_owner_only(app, client, session):
    from app.api.works import SHARED_KEYS

    wid = await run_to_complete(app, client, session)
    await client.post(f"/api/works/{wid}/keep", headers=session)
    tok = (await client.post(f"/api/works/{wid}/share", headers=session)).json()["token"]
    j = (await client.get(f"/api/shared/{tok}")).json()
    assert set(j) == set(SHARED_KEYS) and j["analysis"] and j["structure"]["chapters"]
    for k in ("id", "cost_usd", "kept", "expires_at", "session_id", "error", "state"):
        assert k not in j
    assert wid not in str(j)


async def test_share_link_is_stable_until_stopped(app, client, session):
    wid = await run_to_complete(app, client, session)
    other = {"X-Session": (await client.post("/api/session")).json()["session_id"]}
    url = f"/api/works/{wid}/share"
    assert (await client.get(url, headers=session)).json() == {"token": None}
    await client.post(f"/api/works/{wid}/keep", headers=session)
    tok = (await client.post(url, headers=session)).json()["token"]
    # A second share, a double click or a reload, hands back the same live link.
    assert (await client.post(url, headers=session)).json()["token"] == tok
    assert (await client.get(url, headers=session)).json() == {"token": tok}
    assert (await client.get(url, headers=other)).status_code == 404
    assert (await client.get(url)).status_code == 401
    await client.delete(url, headers=session)
    assert (await client.get(url, headers=session)).json() == {"token": None}
    new = (await client.post(url, headers=session)).json()["token"]
    assert new != tok
    assert (await client.get(f"/api/shared/{tok}")).status_code == 404
    assert (await client.get(f"/api/shared/{new}")).status_code == 200


async def test_dead_share_links(app, client, session, pool):
    wid = await run_to_complete(app, client, session)
    await client.post(f"/api/works/{wid}/keep", headers=session)
    tok = (await client.post(f"/api/works/{wid}/share", headers=session)).json()["token"]
    for bad in ("not-a-token", "x" * 200, "%2e%2e"):
        assert (await client.get(f"/api/shared/{bad}")).status_code == 404
    async with pool.connection() as conn:
        await conn.execute(
            "update works set kept=false, expires_at=now()-interval '1 second' where id=%s",
            (wid,),
        )
    assert (await client.get(f"/api/shared/{tok}")).status_code == 404
    async with pool.connection() as conn:
        await conn.execute("update works set kept=true, expires_at=null where id=%s", (wid,))
    assert (await client.get(f"/api/shared/{tok}")).status_code == 200
    await client.delete(f"/api/works/{wid}", headers=session)
    assert (await client.get(f"/api/shared/{tok}")).status_code == 404


async def test_two_first_shares_at_once_agree_on_one_token(app, client, session, pool):
    wid = await run_to_complete(app, client, session)
    await client.post(f"/api/works/{wid}/keep", headers=session)
    url = f"/api/works/{wid}/share"
    rs = await asyncio.gather(*(client.post(url, headers=session) for _ in range(4)))
    assert len({r.json()["token"] for r in rs}) == 1
    async with pool.connection() as conn:
        cur = await conn.execute(
            "select count(*) as n from share_links where work_id=%s and revoked_at is null",
            (wid,),
        )
        assert (await cur.fetchone())["n"] == 1


async def test_stopping_and_sharing_at_once_leave_at_most_one_live_link(app, client, session, pool):
    wid = await run_to_complete(app, client, session)
    await client.post(f"/api/works/{wid}/keep", headers=session)
    url = f"/api/works/{wid}/share"
    for _ in range(8):
        await asyncio.gather(
            client.post(url, headers=session),
            client.delete(url, headers=session),
            client.post(url, headers=session),
        )
        async with pool.connection() as conn:
            cur = await conn.execute(
                "select token from share_links where work_id=%s and revoked_at is null", (wid,)
            )
            live = [r["token"] for r in await cur.fetchall()]
        assert len(live) <= 1
        assert (await client.get(url, headers=session)).json() == {"token": (live or [None])[0]}
