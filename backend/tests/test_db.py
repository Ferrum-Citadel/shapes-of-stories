from app.db import run_migrations


async def test_migrations_idempotent_and_schema_present(pool):
    assert await run_migrations(pool) == []  # conftest already applied them
    async with pool.connection() as conn:
        cur = await conn.execute(
            "select table_name from information_schema.tables "
            "where table_schema='public' order by 1"
        )
        names = {r["table_name"] for r in await cur.fetchall()}
    assert {
        "sessions",
        "works",
        "beats",
        "jobs",
        "share_links",
        "rate_limits",
        "schema_migrations",
    } <= names
