import asyncio
import json

from app import store
from tests.api_helpers import DONE_SCORES, create, running_worker


async def ticket(client, session, wid):
    return (await client.get(f"/api/works/{wid}", headers=session)).json()["events_ticket"]


async def read_events(client, session, wid, since=None, max_events=500):
    headers = {"Last-Event-ID": str(since)} if since is not None else {}
    events = []
    url = f"/api/works/{wid}/events?ticket={await ticket(client, session, wid)}"
    async with client.stream("GET", url, headers=headers, timeout=60) as r:
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
        buf = {}
        async for line in r.aiter_lines():
            if line.startswith("event:"):
                buf["event"] = line[6:].strip()
            elif line.startswith("id:"):
                buf["id"] = int(line[3:])
            elif line.startswith("data:"):
                buf["data"] = json.loads(line[5:])
            elif line == "" and buf:
                events.append(buf)
                buf = {}
                terminal_state = (
                    events[-1]["event"] == "state"
                    and events[-1]["data"]["state"] in ("failed", "cancelled")
                )
                if events[-1]["event"] in ("complete",) or terminal_state:
                    break
            if len(events) >= max_events:
                break
    return events


async def test_stream_snapshot_live_and_complete(app, client, session):
    wid = await create(client, session)
    async with running_worker(app):
        ev = await read_events(client, session, wid)
        assert ev[0]["event"] == "snapshot" and ev[-1]["event"] == "complete"
        assert "queue_position" in ev[0]["data"]
        beats = [e for e in ev if e["event"] == "beat"]
        assert beats and all("id" in b for b in beats) and beats[0]["data"]["answers"]["scores"]
        # reconnect after completion: snapshot carries everything, then complete, then the
        # stream ends
        ev2 = await read_events(client, session, wid, since=2)
        assert (
            ev2[0]["event"] == "snapshot"
            and all(b["idx"] > 2 for b in ev2[0]["data"]["beats"])
            and ev2[-1]["event"] == "complete"
        )


async def test_watermark_stream_ids_skip_gaps(app, client, session, pool):
    wid = await create(client, session)
    async with pool.connection() as conn:
        for i in (0, 2, 3):
            await store.save_beat(
                conn, wid, i,
                {"model": "synthetic", "scores": DONE_SCORES, "events": {}, "mode": {},
                 **({"text_kind": {"choice": "prose_fiction", "confidence": 1}} if i == 0 else {})},
                "synthetic",
            )

    async def publisher():
        await asyncio.sleep(0.05)
        app.state.pubsub.publish(wid, {"event": "beat", "idx": 3, "watermark": 0,
                                        "answers": {}, "done": 4, "total": 8})
        await asyncio.sleep(0.05)
        app.state.pubsub.publish(wid, {"event": "beat", "idx": 1, "watermark": 3,
                                        "answers": {}, "done": 5, "total": 8})
        await asyncio.sleep(0.05)
        app.state.pubsub.publish(wid, {"event": "state", "state": "cancelled"})

    task = asyncio.create_task(publisher())
    events = []
    try:
        url = f"/api/works/{wid}/events?ticket={await ticket(client, session, wid)}"
        async with client.stream("GET", url, timeout=10) as r:
            buf = {}
            async for line in r.aiter_lines():
                if line.startswith("event:"):
                    buf["event"] = line[6:].strip()
                elif line.startswith("id:"):
                    buf["id"] = int(line[3:])
                elif line.startswith("data:"):
                    buf["data"] = json.loads(line[5:])
                elif line == "" and buf:
                    events.append(buf)
                    buf = {}
                    if events[-1]["event"] == "state":
                        break
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    assert events[0]["event"] == "snapshot" and events[0]["id"] == 0  # beats 0,2,3: watermark 0
    assert events[1]["event"] == "beat" and events[1]["data"]["idx"] == 3 and events[1]["id"] == 0
    assert events[2]["event"] == "beat" and events[2]["data"]["idx"] == 1 and events[2]["id"] == 3


async def test_stream_404(client):
    r = await client.get("/api/works/nope/events")
    assert r.status_code == 404


async def test_stream_bad_since_is_typed_422(client):
    r = await client.get("/api/works/x/events?since=abc")
    assert r.status_code == 422
    j = r.json()
    assert j["error"] == "bad_request" and "errors" in j["detail"]
