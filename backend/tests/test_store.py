from app import store
from app.core.prepare import prepare
from app.security import Crypto, compress

BODY = "\n\n".join(
    [f"CHAPTER {i}\n\n" + ("It was late and the lamps were lit. " * 100) for i in range(1, 9)]
)


async def make_work(pool, sid=None):
    pr = prepare(BODY.encode(), "b.txt")
    c = Crypto("s")
    tct, tn = c.encrypt(compress(pr.parsed.text))
    kct, kn = c.encrypt(b"sk-key")
    async with pool.connection() as conn:
        sid = sid or await store.create_session(conn)
        wid = await store.create_work(
            conn,
            session_id=sid,
            prepared=pr,
            text_ct=tct,
            text_nonce=tn,
            key_ct=kct,
            key_nonce=kn,
            kind="novel",
        )
    return sid, wid, pr


async def test_create_claim_save_complete(pool):
    sid, wid, pr = await make_work(pool)
    async with pool.connection() as conn:
        w = await store.get_work(conn, wid)
        assert w["state"] == "queued"
        assert w["beat_count"] == len(pr.structure.beats)
        assert w["structure"]["preset"] == "prose"
        job = await store.claim_job(conn, "w1")
        assert job["work_id"] == wid
        assert job["text_ciphertext"]
        assert (await store.get_work(conn, wid))["state"] == "running"
        assert await store.claim_job(conn, "w2") is None  # already claimed, heartbeat fresh
        assert await store.save_beat(conn, wid, 0, {"scores": {}}, "m") == 1
        assert (await store.beats_done(conn, wid)) == {0: {"scores": {}}}
        await store.complete_work(conn, wid, {"version": 1}, "m")
        w, j = await store.get_work(conn, wid), await store.get_job(conn, wid)
        assert w["state"] == "complete"
        assert w["expires_at"] is not None
        assert w["analysis"] == {"version": 1}
        assert j["text_ciphertext"] is None
        assert j["key_ciphertext"] is None


async def test_stale_heartbeat_is_reclaimable(pool):
    sid, wid, _ = await make_work(pool)
    async with pool.connection() as conn:
        await store.claim_job(conn, "w1")
        await conn.execute(
            "update jobs set heartbeat_at = now() - interval '2 minutes' where work_id=%s",
            (wid,),
        )
        job = await store.claim_job(conn, "w2")
        assert job and job["attempts"] == 2


async def test_claim_job_excludes_running_ids(pool):
    sid, wid, _ = await make_work(pool)
    async with pool.connection() as conn:
        job = await store.claim_job(conn, "w1")
        assert job["work_id"] == wid
        await conn.execute(
            "update jobs set heartbeat_at = now() - interval '2 minutes' where work_id=%s",
            (wid,),
        )
        assert await store.claim_job(conn, "w2", [wid]) is None  # excluded: skipped
        again = await store.claim_job(conn, "w2", [])  # empty list must still work
        assert again and again["work_id"] == wid  # not excluded: reclaimable


async def test_kept_and_fail_and_limits(pool):
    sid, wid, _ = await make_work(pool)
    async with pool.connection() as conn:
        assert await store.set_kept(conn, wid, 50) is True
        await store.claim_job(conn, "w1")
        assert await store.fail_work(conn, wid, "key_rejected", keep_text=True) is True
        w, j = await store.get_work(conn, wid), await store.get_job(conn, wid)
        assert w["state"] == "failed"
        assert w["expires_at"] is None
        assert j["key_ciphertext"] is None
        assert j["text_ciphertext"]
        assert await store.bump_limit(conn, "b1") == 1
        assert await store.bump_limit(conn, "b1") == 2
        assert await store.count_running(conn) == 0
        await store.delete_work(conn, wid)
        assert await store.get_work(conn, wid) is None


def test_watermark():
    assert store.watermark({}) == -1
    assert store.watermark({0: {}}) == 0
    assert store.watermark({0: {}, 2: {}, 3: {}}) == 0
    assert store.watermark({0: {}, 1: {}, 2: {}, 3: {}}) == 3


async def test_complete_work_guards_state(pool):
    sid, wid, _ = await make_work(pool)
    async with pool.connection() as conn:
        assert await store.cancel_work(conn, wid) is True
        assert await store.complete_work(conn, wid, {"version": 1}, "m") is False
        w, j = await store.get_work(conn, wid), await store.get_job(conn, wid)
        assert w["state"] == "cancelled"
        assert w["analysis"] is None
        assert j["text_ciphertext"] is None


async def test_concurrent_saves_count_every_passage(pool):
    import asyncio

    async def save(idx, wid):
        async with pool.connection() as conn:
            await store.save_beat(conn, wid, idx, {"scores": {}}, "m")

    for _ in range(5):
        sid, wid, pr = await make_work(pool, None)
        n = len(pr.structure.beats)
        await asyncio.gather(*(save(i, wid) for i in range(n)))
        async with pool.connection() as conn:
            assert (await store.get_job(conn, wid))["done"] == n
