"""Jev clients: live (httpx), fixture (recorded), synthetic (deterministic)."""
import asyncio
import hashlib
import json
import math
import random
from pathlib import Path
from typing import Protocol

import httpx

from app.core.jev.questions import MODEL_ID
from app.core.jev.state import cache_key


class JevError(Exception): ...


class JevKeyRejected(JevError): ...


class JevRateLimited(JevError): ...


class JevBadRequest(JevError):
    def __init__(self, detail):
        super().__init__("422")
        self.detail = detail


class JevFixtureMissing(JevError): ...


class JevClient(Protocol):
    async def ask(self, state: dict, questions: dict) -> tuple[dict, str]: ...
    async def aclose(self) -> None: ...


class SyntheticJev:
    """Deterministic plausible answers from a hash of the state. Any question set works."""
    async def ask(self, state: dict, questions: dict) -> tuple[dict, str]:
        seed = int(hashlib.sha256(json.dumps(state, sort_keys=True).encode()).hexdigest()[:16], 16)
        out = {}
        for qid, q in questions.items():
            rng = random.Random(f"{seed}:{qid}")
            if q["type"] == "score":
                n = len(q["criteria"])
                center = rng.random() * (n - 1)
                w = [math.exp(-((i - center) ** 2) / 0.6) for i in range(n)]
                z = sum(w)
                p = [x / z for x in w]
                out[qid] = {
                    "type": "score",
                    "score": sum(i * pi for i, pi in enumerate(p)),
                    "probabilities": {str(i): pi for i, pi in enumerate(p)},
                    "confidence": round(max(p), 3),
                    "legend": {},
                }
            elif q["type"] == "noul":
                r = rng.random()
                out[qid] = {"type": "noul", "noul": round(0.85 if r > 0.9 else r * 0.4, 3)}
            else:
                opts = list(q["criteria"])
                pick = rng.choice(opts)
                probs = {o: 0.1 for o in opts}
                probs[pick] = 1 - 0.1 * (len(opts) - 1)
                out[qid] = {
                    "type": "choice",
                    "choice": pick,
                    "probabilities": probs,
                    "confidence": round(probs[pick], 3),
                }
        return out, "synthetic"

    async def aclose(self) -> None: ...


class FixtureJev:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.data = json.loads(self.path.read_text()) if self.path.exists() else {}

    async def ask(self, state: dict, questions: dict) -> tuple[dict, str]:
        rec = self.data.get(cache_key(state, questions))
        if rec is None:
            raise JevFixtureMissing(f"no recorded answer in {self.path.name}")
        return rec["answers"], rec["model"]

    async def aclose(self) -> None: ...


def record(path: Path, key: str, answers: dict, model: str) -> None:
    path = Path(path)
    data = json.loads(path.read_text()) if path.exists() else {}
    data[key] = {"answers": answers, "model": model}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=0, sort_keys=True))


def make_client(
    mode: str,
    api_key: str | None = None,
    *,
    on_pause=None,
    fixture_path: Path | None = None,
) -> JevClient:
    if mode == "synthetic":
        return SyntheticJev()
    if mode == "fixture":
        if not fixture_path:
            raise ValueError("fixture mode needs fixture_path")
        return FixtureJev(fixture_path)
    if mode == "live":
        if not api_key:
            raise ValueError("live mode needs api_key")
        return LiveJev(api_key, on_pause=on_pause)
    raise ValueError(f"unknown JEV_MODE {mode!r}")


PAUSE_BUDGET_S = 600.0


class LiveJev:
    def __init__(self, api_key: str, *, on_pause=None, transport=None):
        self._client = httpx.AsyncClient(
            base_url="https://api.typesafe.ai",
            timeout=httpx.Timeout(60.0, connect=10.0),
            headers={"Authorization": f"Bearer {api_key}"},
            transport=transport,
        )
        self.on_pause = on_pause
        self.pause_budget_s = PAUSE_BUDGET_S

    async def ask(self, state: dict, questions: dict) -> tuple[dict, str]:
        body = {"model": MODEL_ID, "state": state, "questions": questions}
        paused, backoff, net_errors, server_errors = 0.0, 1.0, 0, 0
        while True:
            try:
                r = await self._client.post("/v1/systemone", json=body)
            except httpx.HTTPError as e:
                net_errors += 1
                if net_errors > 3:
                    raise JevError(f"network: {type(e).__name__}") from None
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)
                continue
            if r.status_code == 200:
                try:
                    data = r.json()
                    answers = data["answers"]
                except (ValueError, KeyError, TypeError):
                    raise JevError("malformed response") from None
                return answers, data.get("model", MODEL_ID)
            if r.status_code in (401, 403):
                raise JevKeyRejected("key rejected")
            if r.status_code == 422:
                try:
                    detail = r.json()
                except ValueError:
                    detail = {}
                raise JevBadRequest(detail)
            if r.status_code == 429 or r.status_code >= 500:
                if r.status_code not in (429, 529):
                    server_errors += 1
                    if server_errors > 3:
                        raise JevError(f"server {r.status_code}")
                ra = r.headers.get("retry-after")
                if ra is not None:
                    try:
                        wait = float(ra)
                    except ValueError:
                        wait = backoff
                    else:
                        if not math.isfinite(wait) or wait <= 0:
                            wait = backoff
                else:
                    wait = backoff
                wait = max(wait, 0.5)
                backoff = min(backoff * 2, 30)
                if paused + wait > self.pause_budget_s:
                    raise JevRateLimited("pause budget exhausted")
                paused += wait
                if self.on_pause:
                    await self.on_pause(wait)
                await asyncio.sleep(wait)
                continue
            raise JevError(f"unexpected status {r.status_code}")

    async def aclose(self) -> None:
        await self._client.aclose()
