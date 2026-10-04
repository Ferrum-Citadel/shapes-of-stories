import asyncio
import json

import pytest

from app import config, store
from app.core.jev.client import SyntheticJev
from app.core.jev.questions import QUESTION_SET_VERSION
from app.gallery import build_gallery
from tests.api_helpers import DONE_SCORES, NOVEL, create, running_worker, wait_state


async def test_worker_completes_job_and_nulls_text(app, client, session, pool):
    wid = await create(client, session)
    async with running_worker(app):
        j = await wait_state(client, session, wid, {"complete", "failed"})
        assert j["state"] == "complete" and j["analysis"]["archetype"]["caption"]
        assert j["done"] == j["total"]
        assert j["model_id"] == "synthetic" and j["expires_at"] is not None
        async with pool.connection() as conn:
            job = await store.get_job(conn, wid)
            assert job["text_ciphertext"] is None and job["key_ciphertext"] is None
            cur = await conn.execute(
                "select count(*) as n from beats where work_id=%s and answers is null", (wid,)
            )
            assert (await cur.fetchone())["n"] == 0


async def test_upload_stores_the_analysis_the_gallery_build_writes(
    app, client, session, tmp_path, monkeypatch
):
    monkeypatch.setattr("app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: NOVEL)
    lst = tmp_path / "list.toml"
    lst.write_text('[[work]]\nslug = "n"\ntitle = "N"\nauthor = "A"\npg_id = 1\n')
    out = tmp_path / "out"
    await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k", emit=lambda _: None)
    built = json.loads((out / "n.json").read_text())["analysis"]

    wid = await create(client, session)
    async with running_worker(app):
        j = await wait_state(client, session, wid, {"complete", "failed"})
        assert j["state"] == "complete"
        assert j["analysis"] == built


@pytest.mark.parametrize("fails_on_resume", [0, 1, 2])
async def test_passage_unscored_after_one_retry_fails_then_resume_asks_only_it(
    app, client, session, pool, monkeypatch, fails_on_resume
):
    """The first run fails before any driver call; Resume asks the passage again, with one
    retry, and completes, with the gap only when both of its tries fail."""
    from app.core import pipeline
    from app.core.jev import client as jc
    orig, orig_driver = jc.SyntheticJev.ask, pipeline.ask_driver
    target, calls, drivers = [], [], []

    async def counting_driver(*a):
        drivers.append(a[-1])
        return await orig_driver(*a)

    monkeypatch.setattr(pipeline, "ask_driver", counting_driver)

    async def fails_one_passage(self, state, questions):
        if state.get("chapter") == "CHAPTER 3" and not target:
            target.append(state["passage"])
        if target and state.get("passage") == target[0]:
            calls.append(state["passage"])
            raise jc.JevError("unavailable")
        return await orig(self, state, questions)

    monkeypatch.setattr(jc.SyntheticJev, "ask", fails_one_passage)
    wid = await create(client, session)
    async with running_worker(app):
        j = await wait_state(client, session, wid, {"complete", "failed"})
        assert j["state"] == "failed" and j["error"] == "unscored_passages"
        assert len(calls) == 2 and drivers == []
        async with pool.connection() as conn:
            job = await store.get_job(conn, wid)
            assert job["text_ciphertext"] is not None
            done = await store.beats_done(conn, wid)
        assert len(done) == j["total"]
        missing = [i for i, a in done.items() if a.get("missing")]
        assert len(missing) == 1

        resumed = []

        async def counting(self, state, questions):
            if state.get("chapter", "").startswith("CHAPTER"):
                resumed.append(state["passage"])
                if state["passage"] == target[0] and len(resumed) <= fails_on_resume:
                    raise jc.JevError("unavailable")
            return await orig(self, state, questions)

        monkeypatch.setattr(jc.SyntheticJev, "ask", counting)
        r = await client.post(
            f"/api/works/{wid}/resume", headers={**session, "X-Jev-Key": "sk-test-1234567890"}
        )
        assert r.status_code == 200
        j = await wait_state(client, session, wid, {"complete", "failed"})
        assert j["state"] == "complete" and j["error"] is None
        assert resumed == target * min(2, fails_on_resume + 1)
        assert j["analysis"]["missing_beats"] == (missing if fails_on_resume == 2 else [])
        assert 0 < len(drivers) == len(j["analysis"]["peak_targets"])


async def test_passage_scored_on_the_retry_completes(app, client, session, monkeypatch):
    from app.core.jev import client as jc
    orig = jc.SyntheticJev.ask
    failed = []

    async def fails_once(self, state, questions):
        if state.get("chapter") == "CHAPTER 3" and not failed:
            failed.append(state["passage"])
            raise jc.JevError("unavailable")
        return await orig(self, state, questions)

    monkeypatch.setattr(jc.SyntheticJev, "ask", fails_once)
    wid = await create(client, session)
    async with running_worker(app):
        j = await wait_state(client, session, wid, {"complete", "failed"})
        assert failed and j["state"] == "complete"
        assert j["analysis"]["missing_beats"] == []


async def crashed_after_three_beats(
    pool, wid, question_set_version=QUESTION_SET_VERSION, model="synthetic"
):
    """A crashed worker: claimed, stale heartbeat, three beats already scored."""
    async with pool.connection() as conn:
        await store.claim_job(conn, "dead")
        for i in range(3):
            await store.save_beat(
                conn, wid, i,
                {"model": model, "scores": DONE_SCORES, "events": {}, "mode": {},
                 **({"text_kind": {"choice": "prose_fiction", "confidence": 1}} if i == 0 else {})},
                model,
            )
        await conn.execute(
            "update jobs set heartbeat_at = now() - interval '5 minutes' where work_id=%s", (wid,)
        )
        await conn.execute(
            "update works set question_set_version=%s where id=%s", (question_set_version, wid)
        )


@pytest.mark.parametrize("stored", [{"question_set_version": "q0"}, {"model": "jev-0.1.0"}])
async def test_resume_under_new_questions_or_model_rescores_every_beat(
    app, client, session, pool, monkeypatch, stored
):
    wid = await create(client, session)
    await crashed_after_three_beats(pool, wid, **stored)
    calls = []
    from app.core.jev import client as jc
    orig = jc.SyntheticJev.ask

    async def counting(self, state, questions):
        calls.append(state.get("chapter", ""))
        return await orig(self, state, questions)

    monkeypatch.setattr(jc.SyntheticJev, "ask", counting)
    async with running_worker(app):
        j = await wait_state(client, session, wid, {"complete", "failed"})
        assert j["state"] == "complete"
        assert j["question_set_version"] == QUESTION_SET_VERSION
        assert j["model_id"] == "synthetic"
        assert len([c for c in calls if c.startswith("CHAPTER")]) == j["total"]
        assert j["done"] == j["total"]


async def test_a_restart_under_new_questions_fails_on_its_first_gap_again(
    app, client, session, pool, monkeypatch
):
    wid = await create(client, session)
    await crashed_after_three_beats(pool, wid, question_set_version="q0")
    async with pool.connection() as conn:
        await conn.execute("update works set error='unscored_passages' where id=%s", (wid,))
    from app.core.jev import client as jc
    orig = jc.SyntheticJev.ask

    async def fails_chapter_three(self, state, questions):
        if state.get("chapter") == "CHAPTER 3":
            raise jc.JevError("unavailable")
        return await orig(self, state, questions)

    monkeypatch.setattr(jc.SyntheticJev, "ask", fails_chapter_three)
    async with running_worker(app):
        j = await wait_state(client, session, wid, {"complete", "failed"})
        assert j["state"] == "failed" and j["error"] == "unscored_passages"
        assert j["question_set_version"] == QUESTION_SET_VERSION
        # As the failure message says, Resume tries them once more and finishes without them.
        r = await client.post(
            f"/api/works/{wid}/resume", headers={**session, "X-Jev-Key": "sk-test-1234567890"}
        )
        assert r.status_code == 200
        j = await wait_state(client, session, wid, {"complete", "failed"})
        assert j["state"] == "complete" and j["analysis"]["missing_beats"]


async def test_crash_resume_does_not_rescore_done_beats(app, client, session, pool, monkeypatch):
    wid = await create(client, session)
    await crashed_after_three_beats(pool, wid)
    calls = []
    from app.core.jev import client as jc
    orig = jc.SyntheticJev.ask

    async def counting(self, state, questions):
        calls.append(state.get("chapter", ""))
        return await orig(self, state, questions)

    monkeypatch.setattr(jc.SyntheticJev, "ask", counting)
    async with running_worker(app):
        j = await wait_state(client, session, wid, {"complete", "failed"})
        assert j["state"] == "complete"
        beat_calls = [c for c in calls if c.startswith("CHAPTER")]
        assert len(beat_calls) == j["total"] - 3


async def test_key_rejected_fails_keeps_text_drops_key(app, client, session, pool, monkeypatch):
    from app.core.jev import client as jc

    async def reject(self, state, questions):
        raise jc.JevKeyRejected()

    monkeypatch.setattr(jc.SyntheticJev, "ask", reject)
    wid = await create(client, session)
    async with running_worker(app):
        j = await wait_state(client, session, wid, {"complete", "failed"})
        assert j["state"] == "failed" and j["error"] == "key_rejected"
        async with pool.connection() as conn:
            job = await store.get_job(conn, wid)
            assert job["key_ciphertext"] is None and job["text_ciphertext"] is not None


async def test_kind_warning_set_from_gate(app, client, session, monkeypatch):
    from app.core.jev import client as jc
    orig = jc.SyntheticJev.ask

    async def gate_nonfiction(self, state, questions):
        raw, model = await orig(self, state, questions)
        if "text_kind" in questions:
            raw["text_kind"] = {
                "type": "choice", "choice": "nonfiction", "probabilities": {}, "confidence": 0.9,
            }
        return raw, model

    monkeypatch.setattr(jc.SyntheticJev, "ask", gate_nonfiction)
    wid = await create(client, session)
    async with running_worker(app):
        j = await wait_state(client, session, wid, {"complete", "failed"})
        assert j["state"] == "complete"
        assert j["kind_warning"] == "nonfiction"


async def test_run_loop_survives_claim_error(app, monkeypatch):
    calls = {"n": 0}
    orig_claim = store.claim_job

    async def flaky_claim(conn, worker_id, *a, **kw):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("boom")
        return await orig_claim(conn, worker_id, *a, **kw)

    monkeypatch.setattr(store, "claim_job", flaky_claim)
    orig_sleep = asyncio.sleep

    async def fast_sleep(_):
        await orig_sleep(0)

    monkeypatch.setattr(asyncio, "sleep", fast_sleep)
    async with running_worker(app) as task:
        for _ in range(100):
            if calls["n"] >= 2:
                break
            await orig_sleep(0.02)
        assert calls["n"] >= 2  # kept calling claim_job after the RuntimeError
        assert not task.done()  # the loop itself never crashed


async def test_heartbeat_survives_failure_and_claim_skips_running_job(
    app, client, session, pool, monkeypatch
):
    monkeypatch.setattr(config, "LEASE_S", 1)
    monkeypatch.setattr(config, "HEARTBEAT_S", 0.05)
    calls = {"n": 0}
    orig_heartbeat = store.heartbeat

    async def flaky_heartbeat(conn, work_id):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("boom")
        await orig_heartbeat(conn, work_id)

    monkeypatch.setattr(store, "heartbeat", flaky_heartbeat)
    from app.core.jev import client as jc
    orig_ask = jc.SyntheticJev.ask

    async def slow(self, s, q):
        await asyncio.sleep(0.5)
        return await orig_ask(self, s, q)

    monkeypatch.setattr(jc.SyntheticJev, "ask", slow)
    wid = await create(client, session)
    async with running_worker(app):
        await wait_state(client, session, wid, {"running"})
        await asyncio.sleep(1.3)  # let the lease look stale (LEASE_S=1) while still running
        app.state.worker.wake()  # force a re-poll while the job is still in self.running
        j = await wait_state(client, session, wid, {"complete", "failed"})
        assert j["state"] == "complete"
        assert calls["n"] >= 2  # heartbeat kept ticking after the first failure
        async with pool.connection() as conn:
            job = await store.get_job(conn, wid)
        assert job["attempts"] == 1  # claimed exactly once despite the stale-looking lease
