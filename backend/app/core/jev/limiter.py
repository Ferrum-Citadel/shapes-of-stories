import asyncio
import hashlib
import time

from app import config


def key_hash(api_key: str) -> str:
    return hashlib.sha256(api_key.encode()).hexdigest()[:16]


class KeyLimiter:
    """Fixed-interval token bucket per key; in-memory, so per process."""

    def __init__(self, rps: float = config.RPS_PER_KEY):
        self.interval = 1.0 / rps
        self._next: dict[str, float] = {}
        self._lock = asyncio.Lock()

    async def acquire(self, key_hash: str) -> None:
        async with self._lock:
            now = time.monotonic()
            slot = max(now, self._next.get(key_hash, now))
            self._next[key_hash] = slot + self.interval
        await asyncio.sleep(max(0.0, slot - time.monotonic()))


LIMITER = KeyLimiter()
