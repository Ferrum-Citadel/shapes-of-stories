"""End-to-end analysis of a prepared work: score beats, build curves, pick drivers at the peaks."""

import asyncio

from app import config
from app.core.curves.analysis import build_analysis, finish_analysis
from app.core.jev.scorer import ask_driver, initial_work_kind, score_beats
from app.core.prepare import Prepared
from app.core.structure import Structure
from app.core.text import chunk_texts, driver_chunks, passage_paragraph_spans


def beat_paragraph_spans(text: str, s: Structure, idx: int) -> list[tuple[int, int]]:
    b = s.beats[idx]
    return passage_paragraph_spans(text, b.start_cp, b.end_cp) or [(b.start_cp, b.end_cp)]


async def run_drivers(
    client, key_hash: str, text: str, s: Structure, answers: dict[int, dict], analysis: dict
) -> dict[str, dict[int, dict]]:
    """Per (axis, peak beat): the picked chunk as its first and last paragraph index in the
    beat, plus the confidence. Every pick is stored; display is gated on DRIVER_CONFIDENCE."""
    sem = asyncio.Semaphore(config.JOB_CONCURRENCY)

    async def one(axis: str, idx: int):
        async with sem:
            spans = beat_paragraph_spans(text, s, idx)
            chunks = driver_chunks(text, spans)
            c_idx, conf = await ask_driver(client, key_hash, chunk_texts(text, spans, chunks), axis)
        first, last = chunks[c_idx] if c_idx is not None else (None, None)
        return axis, idx, first, last, conf

    targets = [
        (axis, idx)
        for axis, idx in analysis["peak_targets"]
        if not answers.get(idx, {}).get("missing")
    ]
    results = await asyncio.gather(*(one(axis, idx) for axis, idx in targets))
    out: dict[str, dict[int, dict]] = {}
    for axis, idx, first, last, conf in results:
        out.setdefault(axis, {})[idx] = {
            "paragraph_idx": first,
            "paragraph_end_idx": last,
            "confidence": round(conf, 3),
        }
    return out


def answers_model(answers: dict[int, dict]) -> str | None:
    return next((a.get("model") for a in answers.values() if a.get("model")), None)


async def analyze_work(
    client,
    key_hash: str,
    text: str,
    s: Structure,
    fmt: str,
    *,
    done=None,
    on_answer=None,
    allow_gap=False,
) -> tuple[dict[int, dict], dict]:
    """The one analysis both the gallery build and an upload store: `done` holds answers kept
    from an earlier run, `on_answer` sees every new one. Unless `allow_gap`, passages still
    unscored after the retry stop it before the driver calls, and its `missing_beats` say so."""
    kind = initial_work_kind(fmt, s.word_count)
    answers = await score_beats(
        client, text, s, kind, key_hash=key_hash, done=done or {}, on_answer=on_answer
    )
    if any(a.get("missing") for a in answers.values()):
        # One more pass over just the unscored beats rides out a transient API failure.
        kept = {i: a for i, a in answers.items() if not a.get("missing")}
        answers = await score_beats(
            client, text, s, kind, key_hash=key_hash, done=kept, on_answer=on_answer
        )
    analysis = build_analysis(s, answers)
    if analysis["missing_beats"] and not allow_gap:
        return answers, finish_analysis(analysis)
    drivers = await run_drivers(client, key_hash, text, s, answers, analysis)
    return answers, finish_analysis(build_analysis(s, answers, drivers))


async def analyze_text(
    client, key_hash: str, pr: Prepared, on_answer=None
) -> tuple[dict[int, dict], dict]:
    return await analyze_work(
        client, key_hash, pr.parsed.text, pr.structure, pr.parsed.format, on_answer=on_answer
    )
