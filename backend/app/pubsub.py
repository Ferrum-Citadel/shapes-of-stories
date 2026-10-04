import asyncio


class PubSub:
    """In-memory fan-out per work id; single process only."""
    def __init__(self):
        self._subs: dict[str, set[asyncio.Queue]] = {}

    def subscribe(self, work_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._subs.setdefault(work_id, set()).add(q)
        return q

    def unsubscribe(self, work_id: str, q: asyncio.Queue) -> None:
        subs = self._subs.get(work_id)
        if subs:
            subs.discard(q)
            if not subs:
                del self._subs[work_id]

    def publish(self, work_id: str, event: dict) -> None:
        for q in list(self._subs.get(work_id, ())):
            q.put_nowait(event)
