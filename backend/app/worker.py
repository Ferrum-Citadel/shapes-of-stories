"""In-process worker: claims jobs, scores beats, publishes progress, completes with text/key
deletion."""

import asyncio
import logging
import os

from app import config, store
from app.core.jev.client import JevKeyRejected, JevRateLimited, make_client
from app.core.jev.limiter import key_hash
from app.core.jev.questions import MODEL_ID, QUESTION_SET_VERSION
from app.core.pipeline import analyze_work, answers_model
from app.core.structure import structure_from_json
from app.security import decompress

log = logging.getLogger("sos.worker")


class Worker:
    def __init__(self, app):
        self.app = app
        self.running: dict[str, asyncio.Task] = {}
        self._wake = asyncio.Event()
        self.id = f"{os.getpid()}-{id(self)}"

    def wake(self) -> None:
        self._wake.set()

    def cancel(self, work_id: str) -> bool:
        t = self.running.get(work_id)
        if t:
            t.cancel()
            return True
        return False

    async def run(self) -> None:
        while True:
            try:
                self.running = {w: t for w, t in self.running.items() if not t.done()}
                claimed = None
                if len(self.running) < config.RUNNING_JOBS_MAX:
                    async with self.app.state.pool.connection() as conn:
                        claimed = await store.claim_job(conn, self.id, list(self.running))
                if claimed:
                    self.running[claimed["work_id"]] = asyncio.create_task(
                        self.process(claimed), name=f"job-{claimed['work_id']}"
                    )
                    continue
                self._wake.clear()
                try:
                    # WORKER_IDLE_POLL_S backstop reclaims stale leases
                    await asyncio.wait_for(self._wake.wait(), timeout=config.WORKER_IDLE_POLL_S)
                except TimeoutError:
                    pass
            except Exception:
                log.exception("worker claim loop error")
                await asyncio.sleep(5)

    async def _heartbeat(self, wid: str) -> None:
        while True:
            await asyncio.sleep(config.HEARTBEAT_S)
            try:
                async with self.app.state.pool.connection() as conn:
                    await store.heartbeat(conn, wid)
            except Exception:
                log.exception("heartbeat failed for %s", wid)

    async def process(self, job: dict) -> None:
        wid = job["work_id"]
        pool, pubsub, crypto = self.app.state.pool, self.app.state.pubsub, self.app.state.crypto
        settings = self.app.state.settings
        hb = asyncio.create_task(self._heartbeat(wid))
        client = None
        try:
            if job["text_ciphertext"] is None or (
                settings.jev_mode == "live" and job["key_ciphertext"] is None
            ):
                async with pool.connection() as conn:
                    await store.fail_work(conn, wid, "text_or_key_missing", keep_text=False)
                pubsub.publish(
                    wid, {"event": "state", "state": "failed", "error": "text_or_key_missing"}
                )
                return
            text = decompress(crypto.decrypt(bytes(job["text_ciphertext"]), bytes(job["nonce"])))
            api_key = (
                crypto.decrypt(bytes(job["key_ciphertext"]), bytes(job["key_nonce"])).decode()
                if job["key_ciphertext"]
                else "synthetic"
            )
            khash = key_hash(api_key)
            s = structure_from_json(job["structure"])
            state = {"paused": False}

            async def on_pause(seconds: float):
                if not state["paused"]:
                    state["paused"] = True
                    async with pool.connection() as conn:
                        await store.set_state(conn, wid, "paused")
                    pubsub.publish(
                        wid,
                        {
                            "event": "state",
                            "state": "paused",
                            "reason": "rate_limited",
                            "seconds": seconds,
                        },
                    )

            client = make_client(settings.jev_mode, api_key=api_key, on_pause=on_pause)
            model_asked = "synthetic" if settings.jev_mode == "synthetic" else MODEL_ID
            # Passages a resumed run still cannot score would fail the same way on every Resume.
            allow_gap = job["error"] == "unscored_passages"
            async with pool.connection() as conn:
                done = await store.beats_done(conn, wid)
                if job["question_set_version"] != QUESTION_SET_VERSION or any(
                    a.get("model") not in (None, model_asked) for a in done.values()
                ):
                    # Answers to other questions, or from another model, cannot be joined
                    # with the ones this run gives.
                    await store.restart_scoring(conn, wid)
                    done, allow_gap = {}, False
            # A passage an earlier run left unscored is asked again.
            done = {i: a for i, a in done.items() if not a.get("missing")}
            done_idxs = set(done)
            pubsub.publish(wid, {"event": "state", "state": "running"})

            async def on_answer(idx: int, answers: dict):
                async with pool.connection() as conn:
                    if state["paused"]:
                        state["paused"] = False
                        await store.set_state(conn, wid, "running")
                        pubsub.publish(wid, {"event": "state", "state": "running"})
                    n = await store.save_beat(conn, wid, idx, answers, answers.get("model"))
                    if idx == 0 and answers.get("text_kind", {}).get("choice") in (
                        "nonfiction",
                        "poetry_or_lyrics",
                        "other",
                    ):
                        await store.set_kind_warning(conn, wid, answers["text_kind"]["choice"])
                done_idxs.add(idx)
                pubsub.publish(
                    wid,
                    {
                        "event": "beat",
                        "idx": idx,
                        "answers": answers,
                        "done": n,
                        "total": job["total"],
                        "watermark": store.watermark(done_idxs),
                    },
                )

            answers, analysis = await analyze_work(
                client,
                khash,
                text,
                s,
                job["format"],
                done=done,
                on_answer=on_answer,
                allow_gap=allow_gap,
            )
            if analysis["missing_beats"] and not allow_gap:
                await self._fail(wid, "unscored_passages")
                return
            model = answers_model(answers)
            async with pool.connection() as conn:
                await store.complete_work(conn, wid, analysis, model)
            pubsub.publish(wid, {"event": "complete", "analysis": analysis})
        except JevKeyRejected:
            await self._fail(wid, "key_rejected")
        except JevRateLimited:
            await self._fail(wid, "rate_limited")
        except Exception:  # noqa: BLE001
            log.exception("job %s failed", wid)
            await self._fail(wid, "internal")
        finally:
            hb.cancel()
            if client:
                await client.aclose()

    async def _fail(self, wid: str, error: str) -> None:
        async with self.app.state.pool.connection() as conn:
            await store.fail_work(conn, wid, error, keep_text=True)
        self.app.state.pubsub.publish(wid, {"event": "state", "state": "failed", "error": error})
