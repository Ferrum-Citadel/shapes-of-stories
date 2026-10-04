"""Async pool and a minimal migration runner.

prepare_threshold=None: works behind a transaction-mode pooler such as pgbouncer.
"""
from pathlib import Path

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

MIGRATIONS = Path(__file__).parent / "migrations"


def make_pool(database_url: str) -> AsyncConnectionPool:
    return AsyncConnectionPool(
        database_url,
        open=False,
        min_size=1,
        max_size=5,
        kwargs={"row_factory": dict_row, "prepare_threshold": None, "autocommit": True},
    )


async def run_migrations(pool: AsyncConnectionPool) -> list[str]:
    applied = []
    async with pool.connection() as conn:
        await conn.execute(
            "create table if not exists schema_migrations("
            "name text primary key, applied_at timestamptz default now())"
        )
        cur = await conn.execute("select name from schema_migrations")
        done = {r["name"] for r in await cur.fetchall()}
        for f in sorted(MIGRATIONS.glob("*.sql")):
            if f.name in done:
                continue
            async with conn.transaction():
                await conn.execute(f.read_text())
                await conn.execute("insert into schema_migrations(name) values (%s)", (f.name,))
            applied.append(f.name)
    return applied
