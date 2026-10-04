"""Gallery build: Gutenberg → prepare → analyze (live API key) → static JSON + text. Idempotent by
content and structure hash."""

import hashlib
import json
import time
import tomllib
import urllib.request
from dataclasses import asdict
from pathlib import Path

from app import config
from app.calibration import stderr_emit
from app.core.curves.analysis import (
    ANALYSIS_VERSION,
    build_analysis,
    finish_analysis,
    kept_answer,
)
from app.core.jev.client import SyntheticJev
from app.core.jev.questions import MODEL_ID, QUESTION_SET_VERSION
from app.core.jev.scorer import DRIVER_CONFIDENCE, GATE_CONFIDENCE, initial_work_kind
from app.core.pipeline import analyze_text, answers_model
from app.core.prepare import prepare
from app.core.structure import Structure, structure_from_json
from app.core.text import CHUNK_MIN_WORDS

UA = "shapes-of-stories gallery build (https://github.com/Ferrum-Citadel/shapes-of-stories)"
# Each work's passage answers live in a folder of their own, so nothing that lists the work
# files takes one for a work.
ANSWERS = "answers"


def _progress_on_answer(emit, slug: str, total_beats: int, t0: float):
    """Reports every 5 beats or 10 s, whichever comes first."""
    seen, last_beats, last_t = set(), 0, t0

    async def on_answer(idx, ans):
        nonlocal last_beats, last_t
        seen.add(idx)  # a retried passage counts once
        beats_done = len(seen)
        now = time.monotonic()
        if beats_done - last_beats >= 5 or now - last_t >= 10:
            emit(f"  {slug}: {beats_done}/{total_beats} beats, {now - t0:.0f} s")
            last_beats, last_t = beats_done, now

    return on_answer


def fetch_gutenberg(pg_id: int, cache_dir: Path) -> bytes:
    cache_dir.mkdir(parents=True, exist_ok=True)
    f = cache_dir / f"pg{pg_id}.txt"
    if not f.exists():
        url = f"https://www.gutenberg.org/cache/epub/{pg_id}/pg{pg_id}.txt"
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            f.write_bytes(r.read())
    return f.read_bytes()


def structure_hash(s: Structure) -> str:
    """Beat, chapter and section boundaries and chapter titles: a heading-rule change moves them
    without changing the text, and each passage is sent with its chapter title."""
    bounds = (
        [[b.start_cp, b.end_cp] for b in s.beats]
        + [[c.start_cp, c.section_idx, c.title] for c in s.chapters]
        + [[x.start_cp, x.end_cp] for x in s.sections]
    )
    return hashlib.sha256(json.dumps(bounds).encode()).hexdigest()


def _fingerprint(values: dict) -> str:
    return hashlib.sha256(json.dumps(values, sort_keys=True).encode()).hexdigest()[:12]


# Every value besides the text, the questions and the model that changes a work's answers or
# driver picks, which only scoring can redo: passage sizes, chapter titles and the context sent
# with each passage, the work kind and its gate, and driver chunks.
_SCORING_NAMES = (
    "BEAT_TARGET",
    "BEAT_MIN",
    "BEAT_MAX",
    "SHORT_WORK_WORDS",
    "SHORT_BEAT_TARGET",
    "MIN_BEATS",
    "GROUP_FLOOR",
    "TAIL_MAX_WORDS",
    "CHAPTER_TITLE_MAX",
    "NOVEL_MIN_WORDS",
)
# Every value that changes what an analysis derives from the answers, which a recurve redoes:
# binning and smoothing, shape and event thresholds, mode confidence, peaks and the driver gate.
_CONFIG_NAMES = (
    "BINS",
    "SHAPE_MIN_SD",
    "WHITTAKER_SHAPE",
    "WHITTAKER_DETAIL",
    "WEIGHT_EPS",
    "SHAPE_NAMED_R",
    "SHAPE_LEANS_R",
    "SHAPE_MARGIN",
    "EVENT_STRONG",
    "EVENT_FAINT",
    "EVENT_MIN_BIN_GAP",
    "MODE_MIXED_CONFIDENCE",
    "PEAKS_PER_AXIS",
    "DRIVER_CALLS",
)


def scoring_hash() -> str:
    return _fingerprint(
        {name: getattr(config, name) for name in _SCORING_NAMES}
        | {
            "GATE_CONFIDENCE": GATE_CONFIDENCE,
            "CHUNK_MIN_WORDS": CHUNK_MIN_WORDS,
        }
    )


def config_hash() -> str:
    return _fingerprint(
        {name: getattr(config, name) for name in _CONFIG_NAMES}
        | {
            "DRIVER_CONFIDENCE": DRIVER_CONFIDENCE,
            "ANALYSIS_VERSION": ANALYSIS_VERSION,
        }
    )


def _unchanged(existing: Path, content_hash: str, structure_hash: str, model: str) -> bool:
    if not existing.exists() or not (existing.parent / ANSWERS / existing.name).exists():
        return False
    j = json.loads(existing.read_text())
    return (
        j["work"].get("content_hash") == content_hash
        and j["work"].get("structure_hash") == structure_hash
        and j["work"].get("question_set_version") == QUESTION_SET_VERSION
        and j["work"].get("model_id") == model
        and j["work"].get("scoring_hash") == scoring_hash()
        and j["work"].get("config_hash") == config_hash()
    )


def _sparkline(meta: dict) -> list[float]:
    return [round(v, 2) for v in meta["analysis"]["bins"]["fortune"]["shape"]]


async def build_gallery(
    list_path: Path,
    out_dir: Path,
    cache_dir: Path,
    client,
    key_hash: str,
    *,
    only=None,
    emit=None,
) -> dict:
    emit = emit or stderr_emit
    works = tomllib.loads(list_path.read_text())["work"]
    out_dir.mkdir(parents=True, exist_ok=True)
    todo = [w for w in works if not only or w["slug"] in only]
    total = len(todo)
    expected_model = "synthetic" if isinstance(client, SyntheticJev) else MODEL_ID
    built, skipped, failed, index = [], [], [], []
    for n, w in enumerate(todo, 1):
        if not (cache_dir / f"pg{w['pg_id']}.txt").exists():
            emit(f"fetching pg{w['pg_id']} …")
        pr = prepare(fetch_gutenberg(w["pg_id"], cache_dir), f"pg{w['pg_id']}.txt")
        emit(
            f"[{n}/{total}] {w['slug']}: {pr.structure.word_count:,} words, "
            f"{len(pr.structure.beats)} beats"
        )
        meta_path = out_dir / f"{w['slug']}.json"
        text_path = out_dir / f"{w['slug']}.txt"
        s_hash = structure_hash(pr.structure)
        declared = {k: w[k] for k in ("sections", "chapters") if k in w}
        found = {k: len(getattr(pr.structure, k)) for k in declared}
        if found != declared:
            stderr_emit(
                f"[{n}/{total}] {w['slug']}: declared "
                + ", ".join(f"{v} {k}" for k, v in declared.items())
                + ", found "
                + ", ".join(f"{v} {k}" for k, v in found.items())
                + ", not written"
            )
            failed.append({"slug": w["slug"], "reason": "layout differs"})
            continue
        if _unchanged(meta_path, pr.content_hash, s_hash, expected_model):
            skipped.append(w["slug"])
            meta = json.loads(meta_path.read_text())
            if not text_path.exists():
                text_path.write_text(pr.parsed.text, encoding="utf-8")
            emit(f"[{n}/{total}] {w['slug']}: skipped (unchanged)")
        else:
            t0 = time.monotonic()
            on_answer = _progress_on_answer(emit, w["slug"], len(pr.structure.beats), t0)
            answers, analysis = await analyze_text(client, key_hash, pr, on_answer=on_answer)
            if analysis["missing_beats"]:
                stderr_emit(
                    f"[{n}/{total}] {w['slug']}: unscored beats {analysis['missing_beats']}, "
                    "not written"
                )
                failed.append({"slug": w["slug"], "reason": "unscored beats"})
                continue
            model = answers_model(answers) or expected_model
            if model != expected_model:
                # The skip rule compares with the requested model, so until MODEL_ID is updated
                # this work would be scored again on every run.
                stderr_emit(
                    f"[{n}/{total}] {w['slug']}: scored by {model}, not the requested "
                    f"{expected_model}"
                )
                failed.append(
                    {
                        "slug": w["slug"],
                        "reason": f"scored by {model}, update MODEL_ID to {model}",
                    }
                )
            kind = initial_work_kind(pr.parsed.format, pr.structure.word_count)
            meta = {
                "work": {
                    "slug": w["slug"],
                    "title": w["title"],
                    "author": w["author"],
                    "pg_id": w["pg_id"],
                    "word_count": pr.structure.word_count,
                    "kind": kind,
                    "format": "txt",
                    "content_hash": pr.content_hash,
                    "structure_hash": s_hash,
                    "question_set_version": QUESTION_SET_VERSION,
                    "model_id": model,
                    "scoring_hash": scoring_hash(),
                    "config_hash": config_hash(),
                    "expected_shape": w.get("expected_shape"),
                },
                "structure": asdict(pr.structure),
                "analysis": analysis,
            }
            # The work file goes last: the skip rule reads it, so a build cut short in between
            # never leaves it beside answers it was not derived from.
            (out_dir / ANSWERS).mkdir(exist_ok=True)
            (out_dir / ANSWERS / meta_path.name).write_text(
                json.dumps(
                    {i: kept_answer(answers[i]) for i in sorted(answers)}, separators=(",", ":")
                )
            )
            text_path.write_text(pr.parsed.text, encoding="utf-8")
            meta_path.write_text(json.dumps(meta, separators=(",", ":")))
            if model == expected_model:
                built.append(w["slug"])
            emit(f"[{n}/{total}] {w['slug']}: done in {time.monotonic() - t0:.0f} s")
        a = meta["analysis"]["archetype"]
        index.append(
            {
                "slug": w["slug"],
                "title": w["title"],
                "author": w["author"],
                "pg_id": w["pg_id"],
                "word_count": meta["work"]["word_count"],
                "content_hash": meta["work"]["content_hash"],
                "question_set_version": meta["work"]["question_set_version"],
                "model_id": meta["work"]["model_id"],
                "archetype": {k: a[k] for k in ("state", "shape", "caption", "r", "margin")},
                "sparkline": _sparkline(meta),
            }
        )
    index_path = out_dir / "index.json"
    by_slug = {}
    if index_path.exists():
        by_slug = {e["slug"]: e for e in json.loads(index_path.read_text())}
    if not only:
        # A failed work keeps its old file, so its old entry stays in the index too.
        failed_slugs = {f["slug"] for f in failed}
        by_slug = {slug: e for slug, e in by_slug.items() if slug in failed_slugs}
    for e in index:
        by_slug[e["slug"]] = e
    index = sorted(by_slug.values(), key=lambda e: e["title"])
    index_path.write_text(json.dumps(index, separators=(",", ":")))
    return {"built": built, "skipped": skipped, "failed": failed}


def _rederive(meta: dict, answers: dict) -> dict | str:
    """The work's analysis derived again from its stored answers through the current code and
    settings, keeping the stored driver pick of every peak that is still a target; the reason
    it cannot be, when a setting only scoring can redo has changed, its answers are not one per
    stored passage or a target has no stored pick."""
    if meta["work"].get("scoring_hash") != scoring_hash():
        return "settings a recurve cannot redo have changed, run gallery-build"
    s = structure_from_json(meta["structure"])
    if set(answers) != {str(b.idx) for b in s.beats}:
        return "its answers are not one per stored passage, run gallery-build"
    stored = meta["analysis"]["drivers"]
    drivers: dict[str, dict[int, dict]] = {}
    for axis, idx in build_analysis(s, answers)["peak_targets"]:
        pick = stored.get(axis, {}).get(str(idx))
        if pick is None:
            return f"no stored {axis} driver pick for passage {idx}"
        drivers.setdefault(axis, {})[idx] = pick
    return finish_analysis(build_analysis(s, answers, drivers))


def recurve_gallery(out_dir: Path, emit=None) -> list[str]:
    """Derives every work's stored analysis again without scoring anything and refreshes the
    index to match. A work with stored answers gets its whole analysis from them and the
    current derivation fingerprint; one refused keeps its files. A work without them gets only
    its curves from its per-bin scores, and if any such work's shape would change nothing is
    written. Returns the refused works."""
    emit = emit or stderr_emit
    metas, refused = {}, []
    for meta_path in sorted(out_dir.glob("*.json")):
        if meta_path.name == "index.json":
            continue
        meta = json.loads(meta_path.read_text())
        old = meta["analysis"]["archetype"]
        answers_path = out_dir / ANSWERS / meta_path.name
        if not answers_path.exists():
            analysis = finish_analysis(meta["analysis"])
            if analysis["archetype"] != old:
                raise RuntimeError(f"{meta_path.name}: the stored archetype would change")
            metas[meta_path] = {**meta, "analysis": analysis}, "curves rewritten"
            continue
        analysis = _rederive(meta, json.loads(answers_path.read_text()))
        if isinstance(analysis, str):
            stderr_emit(f"{meta_path.stem}: {analysis}, not rewritten")
            refused.append(meta_path.stem)
            continue
        if analysis["archetype"]["caption"] != old["caption"]:
            stderr_emit(
                f"{meta_path.stem}: the shape changes from {old['caption']} to "
                f"{analysis['archetype']['caption']}"
            )
        work = {**meta["work"], "config_hash": config_hash()}
        metas[meta_path] = {**meta, "work": work, "analysis": analysis}, "derived from its answers"
    for meta_path, (meta, done) in metas.items():
        meta_path.write_text(json.dumps(meta, separators=(",", ":")))
        emit(f"{meta['work']['slug']}: {done}")
    by_slug = {meta_path.stem: meta for meta_path, (meta, _) in metas.items()}
    index_path = out_dir / "index.json"
    index = json.loads(index_path.read_text())
    for e in index:
        if e["slug"] in by_slug:
            a = by_slug[e["slug"]]["analysis"]["archetype"]
            e["archetype"] = {k: a[k] for k in ("state", "shape", "caption", "r", "margin")}
            e["sparkline"] = _sparkline(by_slug[e["slug"]])
    index_path.write_text(json.dumps(index, separators=(",", ":")))
    return refused
