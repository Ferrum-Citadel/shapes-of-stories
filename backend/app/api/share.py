from fastapi import APIRouter, Depends, Request, Response

from app import store
from app.api.deps import get_pool, owner_work, require_session
from app.api.errors import ApiError
from app.api.works import shared_view

router = APIRouter()


@router.get("/api/works/{work_id}/share")
async def share_link(request: Request, work_id: str, sid: str = Depends(require_session)):
    await owner_work(request, work_id, sid)
    async with get_pool(request).connection() as conn:
        return {"token": await store.active_share(conn, work_id)}


@router.post("/api/works/{work_id}/share")
async def share(request: Request, work_id: str, sid: str = Depends(require_session)):
    await owner_work(request, work_id, sid)
    # Sharing again hands back the live link, so a second click never kills one already sent.
    async with get_pool(request).connection() as conn:
        tok = await store.share_once(conn, work_id)
    if tok is None:
        raise ApiError(409, "not_kept")
    return {"token": tok}


@router.delete("/api/works/{work_id}/share", status_code=204)
async def unshare(request: Request, work_id: str, sid: str = Depends(require_session)):
    await owner_work(request, work_id, sid)
    async with get_pool(request).connection() as conn:
        await store.revoke_share(conn, work_id)
    return Response(status_code=204)


@router.get("/api/shared/{token}")
async def shared(request: Request, token: str):
    async with get_pool(request).connection() as conn:
        w = await store.get_shared(conn, token)
        if not w:
            raise ApiError(404, "not_found")
        await store.touch_viewed(conn, w["id"])
    return shared_view(w)
