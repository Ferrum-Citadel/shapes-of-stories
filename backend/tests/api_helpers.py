import asyncio
from contextlib import asynccontextmanager

from app.core.jev.questions import AXES

NOVEL = "\n\n".join(
    [
        f"CHAPTER {i}\n\n" + ("The house was quiet and the river ran on. " * 100)
        for i in range(1, 9)
    ]
).encode()

DONE_SCORES = {ax: {"score": 2.0, "sd": 0.0} for ax in AXES}


async def create(client, session):
    r = await client.post(
        "/api/works", content=NOVEL,
        headers={**session, "X-Filename": "n.txt", "X-Jev-Key": "sk-test-1234567890"},
    )
    assert r.status_code == 201
    return r.json()["work_id"]


async def wait_state(client, session, wid, states, timeout=30):
    for _ in range(timeout * 10):
        r = await client.get(f"/api/works/{wid}", headers=session)
        assert r.status_code == 200
        j = r.json()
        if j["state"] in states:
            return j
        await asyncio.sleep(0.1)
    raise AssertionError("timeout")


@asynccontextmanager
async def running_worker(app):
    task = asyncio.create_task(app.state.worker.run())
    try:
        yield task
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


async def run_to_complete(app, client, session):
    wid = await create(client, session)
    async with running_worker(app):
        await wait_state(client, session, wid, {"complete"})
    return wid
