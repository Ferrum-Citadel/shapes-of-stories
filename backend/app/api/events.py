import hmac
import json

from fastapi import APIRouter, Header, Request
from sse_starlette.sse import EventSourceResponse, ServerSentEvent

from app import store
from app.api.deps import events_ticket, get_pool, progress
from app.api.errors import ApiError

router = APIRouter()
TERMINAL = {"complete", "failed", "cancelled"}
PING_S = 15


def _event(event: str, data: dict, id: int | None = None) -> ServerSentEvent:
    return ServerSentEvent(data=json.dumps(data, separators=(",", ":")), event=event,
                            id=str(id) if id is not None else None)


@router.get("/api/works/{work_id}/events")
async def events(request: Request, work_id: str, since: int | None = None, ticket: str = "",
                 last_event_id: str | None = Header(default=None)):
    pool, pubsub = get_pool(request), request.app.state.pubsub
    if since is None and last_event_id and last_event_id.isdigit():
        since = int(last_event_id)
    async with pool.connection() as conn:
        w = await store.get_work(conn, work_id)
    if not w or not hmac.compare_digest(
        ticket.encode(), events_ticket(work_id, w["session_id"]).encode()
    ):
        raise ApiError(404, "not_found")

    async def gen():
        q = pubsub.subscribe(work_id)  # subscribe before the snapshot: no gap
        try:
            async with pool.connection() as conn:
                w = await store.get_work(conn, work_id)
                job = await store.get_job(conn, work_id)
                done = await store.beats_done(conn, work_id)
                qp = await store.queue_position(conn, work_id)
            if w is None:
                yield _event("state", {"state": "cancelled"})
                return
            beats = [
                {"idx": i, "answers": a} for i, a in sorted(done.items())
                if since is None or i > since
            ]
            wm = store.watermark(done)
            yield _event(
                "snapshot",
                {"state": w["state"], **progress(w, job), "beats": beats, "queue_position": qp},
                id=wm if wm >= 0 else None,
            )
            if w["state"] in TERMINAL:
                if w["state"] == "complete":
                    yield _event("complete", {"analysis": w["analysis"]})
                else:
                    yield _event("state", {"state": w["state"], "error": w.get("error")})
                return
            while True:
                ev = await q.get()
                name = ev["event"]
                payload = {k: v for k, v in ev.items() if k not in ("event", "watermark")}
                yield _event(name, payload, id=ev.get("watermark") if name == "beat" else None)
                if name == "complete" or (name == "state" and payload.get("state") in TERMINAL):
                    return
        finally:
            pubsub.unsubscribe(work_id, q)

    return EventSourceResponse(gen(), ping=PING_S,
                               headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
