import asyncio
import time

from app.core.jev.limiter import KeyLimiter, key_hash


def test_spacing_and_independence():
    lim = KeyLimiter(rps=100)  # 10 ms spacing

    async def burst(k, n):
        t0 = time.monotonic()
        await asyncio.gather(*(lim.acquire(k) for _ in range(n)))
        return time.monotonic() - t0

    dt = asyncio.run(burst("a", 5))
    assert 0.035 <= dt < 0.3  # 4 gaps of 10 ms
    assert asyncio.run(burst("b", 1)) < 0.02
    assert key_hash("sk-1") != key_hash("sk-2") and len(key_hash("x")) == 16


def test_keys_whose_window_has_passed_are_forgotten():
    lim = KeyLimiter(rps=100)

    async def run():
        for k in ("a", "b", "c"):
            await lim.acquire(k)
        await asyncio.sleep(0.02)
        await lim.acquire("d")

    asyncio.run(run())
    assert list(lim._next) == ["d"]
