from fastapi import APIRouter, Depends, Request

from app import config
from app.api.deps import client_ip, enforce_limit, get_pool, hour_bucket, require_key
from app.core.jev.client import JevError, JevKeyRejected, JevRateLimited, make_client
from app.core.jev.limiter import LIMITER, key_hash

router = APIRouter()


@router.post("/api/key/check")
async def key_check(request: Request, x_jev_key: str = Depends(require_key)):
    async with get_pool(request).connection() as conn:
        await enforce_limit(
            conn, hour_bucket("keycheck", client_ip(request)), config.KEY_CHECKS_PER_HOUR
        )
    client = make_client(request.app.state.settings.jev_mode, api_key=x_jev_key)
    try:
        await LIMITER.acquire(key_hash(x_jev_key))
        await client.ask(
            {"passage": "The cat sat on the mat."},
            {"has_cat": {"type": "noul", "instructions": "Does `passage` mention a cat?"}},
        )
        return {"ok": True, "last4": x_jev_key[-4:]}
    except JevKeyRejected:
        return {"ok": False, "error": "key_rejected"}
    except JevRateLimited:
        return {"ok": False, "error": "rate_limited"}
    except JevError:
        return {"ok": False, "error": "unavailable"}
    finally:
        await client.aclose()
