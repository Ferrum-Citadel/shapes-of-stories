import asyncio
import logging

from app import config, store

log = logging.getLogger("sos.sweeper")


async def sweep(pool) -> dict:
    async with pool.connection() as conn:
        c1 = await conn.execute(
            "delete from works where expires_at is not null and expires_at < now()"
        )
        c2 = await store.clear_job_secrets(
            conn,
            "text_ciphertext is not null and created_at < now() - %s * interval '1 hour'",
            (config.TEXT_MAX_AGE_H,),
        )
        c3 = await conn.execute(
            "delete from sessions where last_seen_at < now() - %s * interval '1 day'",
            (config.SESSION_MAX_IDLE_DAYS,),
        )
        c4 = await conn.execute(
            "delete from rate_limits where created_at < now() - interval '2 days'"
        )
    return {
        "expired_works": c1.rowcount,
        "texts_nulled": c2.rowcount,
        "sessions_deleted": c3.rowcount,
        "limits_deleted": c4.rowcount,
    }


async def sweep_loop(app) -> None:
    while True:
        try:
            counts = await sweep(app.state.pool)
            if any(counts.values()):
                log.info("sweep %s", counts)
        except Exception:  # noqa: BLE001
            log.exception("sweep failed")
        await asyncio.sleep(config.SWEEP_INTERVAL_S)
