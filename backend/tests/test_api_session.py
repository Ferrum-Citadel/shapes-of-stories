import asyncio

import pytest
from asgi_lifespan import LifespanManager

from tests import conftest


async def test_health_and_session(client):
    r = await client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "db": True}
    r = await client.post("/api/session")
    assert r.status_code == 201
    assert len(r.json()["session_id"]) == 22
    r = await client.get("/api/session/works")
    assert r.status_code == 401
    assert r.json()["error"] == "no_session"
    r = await client.get("/api/session/works", headers={"X-Session": "nope"})
    assert r.status_code == 401


async def test_ping_does_not_touch_the_database(client, app):
    await app.state.pool.close()
    r = await client.get("/api/ping")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


async def test_cors_allows_configured_origin(client):
    r = await client.options(
        "/api/session",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-session",
        },
    )
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


async def test_lifespan_closes_pool_when_migrations_fail(pool, monkeypatch):
    import app.main as main_module

    async def boom(_pool):
        raise RuntimeError("boom")

    monkeypatch.setattr(main_module, "run_migrations", boom)
    a = main_module.create_app(conftest.test_settings(), start_worker=False)
    with pytest.raises(Exception) as exc_info:
        async with LifespanManager(a):
            pass
    message = str(exc_info.value) or str(exc_info.value.__cause__)
    assert "boom" in message
    assert a.state.pool.closed is True


async def test_lifespan_cancels_running_job_tasks_on_shutdown(pool):
    import app.main as main_module

    a = main_module.create_app(conftest.test_settings(), start_worker=False)
    async with LifespanManager(a):
        t = asyncio.create_task(asyncio.sleep(100))
        a.state.worker.running["fake"] = t
    assert t.cancelled()


async def test_sessions_per_connection_are_limited_per_day(client, monkeypatch):
    from app import config

    monkeypatch.setattr(config, "IP_SESSIONS_PER_DAY", 2)
    assert [(await client.post("/api/session")).status_code for _ in range(2)] == [201, 201]
    r = await client.post("/api/session")
    assert r.status_code == 429 and r.json()["detail"]["bucket"] == "sessions"
