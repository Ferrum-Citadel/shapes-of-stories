from dataclasses import asdict

from fastapi import APIRouter, Depends, Request, Response

from app import config, store
from app.api.deps import (
    client_ip,
    day_bucket,
    enforce_limit,
    events_ticket,
    get_pool,
    optional_session,
    owner_work,
    owns,
    progress,
    require_key,
    require_session,
)
from app.api.errors import ApiError
from app.api.upload import prepare_upload, read_upload
from app.core.estimate import estimate
from app.core.jev.scorer import initial_work_kind
from app.security import compress

router = APIRouter()


async def start_limits(conn, sid: str):
    # Takes the session lock, held until the caller's transaction ends.
    await store.lock_session(conn, sid)
    if await store.count_running(conn, sid) >= config.SESSION_RUNNING_MAX:
        raise ApiError(409, "limit_session_running", max=config.SESSION_RUNNING_MAX)
    if await store.count_running(conn) >= config.RUNNING_JOBS_MAX + config.QUEUED_MAX:
        raise ApiError(409, "limit_instance_busy")
    await enforce_limit(conn, day_bucket("analyses", sid), config.SESSION_ANALYSES_PER_DAY)


@router.post("/api/works", status_code=201)
async def create_work(
    request: Request,
    sid: str = Depends(require_session),
    x_jev_key: str = Depends(require_key),
):
    pool = get_pool(request)
    async with pool.connection() as conn:
        await enforce_limit(
            conn, day_bucket("uploads", client_ip(request)), config.IP_UPLOADS_PER_DAY
        )
    data, name = await read_upload(request)
    pr = await prepare_upload(data, name)
    crypto = request.app.state.crypto
    text_ct, text_nonce = crypto.encrypt(compress(pr.parsed.text))
    key_ct, key_nonce = crypto.encrypt(x_jev_key.encode())
    async with pool.connection() as conn, conn.transaction():
        await start_limits(conn, sid)
        wid = await store.create_work(
            conn,
            session_id=sid,
            prepared=pr,
            text_ct=text_ct,
            text_nonce=text_nonce,
            key_ct=key_ct,
            key_nonce=key_nonce,
            kind=initial_work_kind(pr.parsed.format, pr.structure.word_count),
        )
    request.app.state.worker.wake()
    return {"work_id": wid, "structure": asdict(pr.structure)}


# A share link leaves out the work id, which would outlive a revoke, and everything of the
# owner's: cost, keep, expiry, session.
SHARED_KEYS = (
    "title",
    "author",
    "kind",
    "format",
    "word_count",
    "structure",
    "analysis",
    "completed_at",
    "model_id",
    "question_set_version",
    "kind_warning",
)
OWNER_KEYS = (*SHARED_KEYS, "id", "state", "error", "kept", "created_at", "expires_at")


def work_view(w: dict, job: dict | None, queue_position: int | None) -> dict:
    out = {k: w.get(k) for k in OWNER_KEYS}
    out.update(progress(w, job))
    out["queue_position"] = queue_position
    # The upload-time estimate at today's price, hence "about" wherever it is shown.
    out["cost_usd"] = estimate(w["word_count"], w["beat_count"]).cost_usd
    return out


def shared_view(w: dict) -> dict:
    return {k: w.get(k) for k in SHARED_KEYS}


@router.get("/api/works/{work_id}")
async def get_work(request: Request, work_id: str, sid: str | None = Depends(optional_session)):
    async with get_pool(request).connection() as conn:
        w = await store.get_work(conn, work_id)
        # Only the owner reads a work by its id; anyone else needs a share link.
        if not w or not owns(w, sid):
            raise ApiError(404, "not_found")
        job = await store.get_job(conn, work_id)
        qp = await store.queue_position(conn, work_id)
        await store.touch_viewed(conn, work_id)
    ticket = events_ticket(request.app.state.settings.server_secret, work_id)
    return {**work_view(w, job, qp), "events_ticket": ticket}


@router.post("/api/works/{work_id}/keep")
async def keep(request: Request, work_id: str, sid: str = Depends(require_session)):
    w = await owner_work(request, work_id, sid)
    if w["state"] != "complete":
        raise ApiError(409, "not_complete")
    async with get_pool(request).connection() as conn:
        if not await store.set_kept(conn, work_id, config.KEPT_PER_SESSION):
            raise ApiError(409, "limit_kept", max=config.KEPT_PER_SESSION)
    return {"kept": True}


@router.post("/api/works/{work_id}/cancel")
async def cancel(request: Request, work_id: str, sid: str = Depends(require_session)):
    await owner_work(request, work_id, sid)
    request.app.state.worker.cancel(work_id)
    async with get_pool(request).connection() as conn:
        if not await store.cancel_work(conn, work_id):
            raise ApiError(409, "not_running")
    request.app.state.pubsub.publish(work_id, {"event": "state", "state": "cancelled"})
    return {"state": "cancelled"}


@router.post("/api/works/{work_id}/resume")
async def resume(
    request: Request,
    work_id: str,
    sid: str = Depends(require_session),
    x_jev_key: str = Depends(require_key),
):
    w = await owner_work(request, work_id, sid)
    async with get_pool(request).connection() as conn, conn.transaction():
        job = await store.get_job(conn, work_id)
        if w["state"] != "failed" or not job or job["text_ciphertext"] is None:
            raise ApiError(409, "not_resumable")
        await start_limits(conn, sid)
        key_ct, key_nonce = request.app.state.crypto.encrypt(x_jev_key.encode())
        await store.requeue_work(conn, work_id, key_ct, key_nonce)
    request.app.state.worker.wake()
    return {"state": "queued"}


@router.delete("/api/works/{work_id}", status_code=204)
async def delete(request: Request, work_id: str, sid: str = Depends(require_session)):
    await owner_work(request, work_id, sid)
    request.app.state.worker.cancel(work_id)
    async with get_pool(request).connection() as conn:
        await store.delete_work(conn, work_id)
    request.app.state.pubsub.publish(work_id, {"event": "state", "state": "cancelled"})
    return Response(status_code=204)
