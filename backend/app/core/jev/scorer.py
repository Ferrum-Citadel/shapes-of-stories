import asyncio
from collections.abc import Awaitable, Callable

from app import config
from app.core.jev.answers import normalize_answers
from app.core.jev.client import (
    JevBadRequest,
    JevError,
    JevFixtureMissing,
    JevKeyRejected,
    JevRateLimited,
)
from app.core.jev.limiter import LIMITER
from app.core.jev.questions import DRIVER_QUESTIONS, build_questions
from app.core.jev.state import build_state
from app.core.structure import Structure
from app.core.text import tail

GATE_CONFIDENCE = 0.6
# Display gate for driver quotes; lower gates admit mostly weak picks.
DRIVER_CONFIDENCE = 0.6
Q_WITH_GATE = build_questions(True)
Q_PLAIN = build_questions(False)


def initial_work_kind(fmt: str, words: int) -> str:
    if fmt == "fountain":
        return "screenplay"
    if fmt in ("srt", "vtt"):
        return "transcript"
    return "short story" if words < config.NOVEL_MIN_WORDS else "novel"


def beat_state(text: str, s: Structure, idx: int, work_kind: str) -> dict:
    b = s.beats[idx]
    prev = s.beats[idx - 1] if idx > 0 else None
    t = tail(text, prev.start_cp, prev.end_cp, config.TAIL_MAX_WORDS) if prev else ""
    title = s.chapters[b.chapter_idx].title if s.chapters else ""
    # Decile ("0–10%") and "Opening" titles only give position; send a neutral label instead.
    chapter = (
        title if s.chapter_source == "headings" and title != "Opening"
        else f"Chapter {b.chapter_idx + 1}"
    )
    return build_state(work_kind, chapter, t, text[b.start_cp:b.end_cp])


async def score_beats(
    client, text: str, s: Structure, work_kind: str, *, key_hash: str, done: dict[int, dict],
    on_answer: Callable[[int, dict], Awaitable[None]] | None = None,
) -> dict[int, dict]:
    result: dict[int, dict] = dict(done)
    if 0 not in result:
        result[0] = await _one(client, key_hash, beat_state(text, s, 0, work_kind), Q_WITH_GATE)
        if on_answer:
            await on_answer(0, result[0])
    gate = result[0].get("text_kind") or {}
    if (
        work_kind in ("novel", "short story")
        and gate.get("choice") == "screenplay_or_play"
        and gate.get("confidence", 0) >= GATE_CONFIDENCE
    ):
        work_kind = "play"
    sem = asyncio.Semaphore(config.JOB_CONCURRENCY)

    async def run(idx: int):
        async with sem:
            ans = await _one(client, key_hash, beat_state(text, s, idx, work_kind), Q_PLAIN)
        result[idx] = ans
        if on_answer:
            await on_answer(idx, ans)

    todo = [idx for idx in range(1, len(s.beats)) if idx not in result]
    tasks = [asyncio.create_task(run(i)) for i in todo]
    try:
        for t in asyncio.as_completed(tasks):
            await t                      # re-raises on any task failure or cancellation
    except BaseException:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise
    return result


async def _one(client, key_hash, state, questions) -> dict:
    try:
        await LIMITER.acquire(key_hash)
        raw, model = await client.ask(state, questions)
        return normalize_answers(raw, model)
    except (JevFixtureMissing, JevKeyRejected, JevRateLimited):
        raise
    except JevBadRequest:
        return {"missing": True, "error": "bad_request"}
    except JevError:
        return {"missing": True, "error": "jev_error"}
    except ValueError:
        return {"missing": True, "error": "malformed_answer"}


async def ask_driver(
    client, key_hash: str, options: list[str], axis: str
) -> tuple[int | None, float]:
    """Return (option index, confidence). Options are a beat's driver chunks (text.driver_chunks),
    sent in full. The index is stored whenever `choice` names a valid option, regardless of
    confidence; callers gate display/use on confidence. A malformed answer, or a
    bad-request/other Jev error, returns (None, 0.0); rate-limit, key, and fixture-miss errors
    still propagate."""
    opts = {f"c{i}": o for i, o in enumerate(options[:255])}  # the API accepts at most 255 options
    if len(opts) < 2:
        return (0 if opts else None), 1.0
    q = {"driver": {"type": "choice", "instructions": DRIVER_QUESTIONS[axis], "criteria": opts}}
    await LIMITER.acquire(key_hash)
    try:
        # No state: the options carry the text and the instructions carry the criterion.
        raw, _ = await client.ask({}, q)
        a = raw["driver"]
        choice = a["choice"]
        if choice not in opts:
            raise ValueError(f"unknown choice {choice!r}")
        conf = float(a.get("confidence", 0.0))
        idx = int(choice[1:])
    except (JevFixtureMissing, JevKeyRejected, JevRateLimited):
        raise
    except (KeyError, ValueError, JevError):
        return None, 0.0
    return idx, conf
