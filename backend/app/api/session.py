from fastapi import APIRouter, Depends, Request

from app import config, store
from app.api.deps import client_ip, day_bucket, enforce_limit, get_pool, require_session

router = APIRouter()


@router.post("/api/session", status_code=201)
async def create_session(request: Request):
    async with get_pool(request).connection() as conn:
        await enforce_limit(
            conn, day_bucket("sessions", client_ip(request)), config.IP_SESSIONS_PER_DAY
        )
        return {"session_id": await store.create_session(conn)}


@router.get("/api/session/works")
async def my_works(request: Request, sid: str = Depends(require_session)):
    async with get_pool(request).connection() as conn:
        return {"works": await store.list_works(conn, sid)}
