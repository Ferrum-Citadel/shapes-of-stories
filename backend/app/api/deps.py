import hmac
import time
from datetime import UTC, datetime

from fastapi import Depends, Header, Request

from app import store
from app.api.errors import ApiError


def get_pool(request: Request):
    return request.app.state.pool


def client_ip(request: Request) -> str:
    # Behind an edge proxy the visitor is the header the edge overwrites, not the hop before us.
    header = request.app.state.settings.client_ip_header
    if header and (ip := request.headers.get(header)):
        return ip
    return request.client.host if request.client else "unknown"


async def optional_session(
    request: Request, x_session: str | None = Header(default=None)
) -> str | None:
    if not x_session:
        return None
    async with get_pool(request).connection() as conn:
        return x_session if await store.touch_session(conn, x_session) else None


async def require_session(sid: str | None = Depends(optional_session)) -> str:
    if sid is None:
        raise ApiError(401, "no_session")
    return sid


async def require_key(x_jev_key: str | None = Header(default=None)) -> str:
    if not x_jev_key or len(x_jev_key) < 8:
        raise ApiError(400, "missing_key")
    return x_jev_key


def day_bucket(prefix: str, ident: str) -> str:
    return f"{prefix}:{ident}:{datetime.now(UTC):%Y-%m-%d}"


def hour_bucket(prefix: str, ident: str) -> str:
    return f"{prefix}:{ident}:{datetime.now(UTC):%Y-%m-%dT%H}"


async def enforce_limit(conn, bucket: str, maximum: int):
    if await store.bump_limit(conn, bucket) > maximum:
        raise ApiError(429, "rate_limited", bucket=bucket.split(":")[0], max=maximum)


def owns(w: dict, sid: str | None) -> bool:
    return sid is not None and hmac.compare_digest(w["session_id"].encode(), sid.encode())


async def owner_work(request: Request, work_id: str, sid: str) -> dict:
    async with get_pool(request).connection() as conn:
        w = await store.get_work(conn, work_id)
    # A stranger learns nothing, not even that the work exists.
    if not w or not owns(w, sid):
        raise ApiError(404, "not_found")
    return w


def events_ticket(secret: str, work_id: str, hour: int | None = None) -> str:
    # EventSource sends no headers, so the stream takes this stand-in for the owner's session,
    # which keeps the session itself out of URLs and access logs; it lapses within two hours.
    hour = int(time.time() // 3600) if hour is None else hour
    return hmac.new(secret.encode(), f"events:{work_id}:{hour}".encode(), "sha256").hexdigest()


def valid_events_ticket(secret: str, work_id: str, ticket: str) -> bool:
    hour = int(time.time() // 3600)
    return any(
        hmac.compare_digest(ticket.encode(), events_ticket(secret, work_id, h).encode())
        for h in (hour, hour - 1)
    )


def progress(w: dict, job: dict | None) -> dict:
    return {"done": (job or {}).get("done", 0), "total": (job or {}).get("total", w["beat_count"])}
