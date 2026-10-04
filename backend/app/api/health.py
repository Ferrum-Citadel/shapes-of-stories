from fastapi import APIRouter, Request

from app.api.deps import get_pool

router = APIRouter()


@router.get("/api/ping")
async def ping():
    return {"ok": True}


@router.get("/api/health")
async def health(request: Request):
    async with get_pool(request).connection() as conn:
        await conn.execute("select 1")
    return {"ok": True, "db": True}
