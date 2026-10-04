"""sos command line: preview, record-fixtures, calibrate, gallery-build, gallery-recurve,
analyze, questions-json."""

import argparse
import asyncio
import json
import os
import sys
from dataclasses import asdict
from datetime import date
from pathlib import Path

from app import config
from app.calibration import render_report, run_calibration, write_rows
from app.core.errors import IngestError
from app.core.jev.client import JevFixtureMissing, make_client, record
from app.core.jev.limiter import key_hash
from app.core.jev.questions import AXES, EVENTS, MODEL_ID, QUESTION_SET_VERSION
from app.core.jev.scorer import ask_driver, initial_work_kind, score_beats
from app.core.jev.state import cache_key
from app.core.pipeline import analyze_text, beat_paragraph_spans
from app.core.prepare import prepare
from app.core.text import chunk_texts, driver_chunks
from app.gallery import build_gallery, recurve_gallery


def _client(args, fixture_path: Path | None = None):
    """The Jev client and key for args.mode; None, with the error printed, for live mode
    without TYPESAFE_API_KEY or fixture mode without a fixture file."""
    key = os.environ.get("TYPESAFE_API_KEY")
    if args.mode == "live" and not key:
        print(json.dumps({"error": "missing_api_key"}), file=sys.stderr)
        return None
    if args.mode == "fixture" and not fixture_path:
        print(json.dumps({"error": "missing_fixture"}), file=sys.stderr)
        return None
    client = make_client(
        args.mode,
        api_key=key if args.mode == "live" else None,
        fixture_path=fixture_path,
        model=getattr(args, "model", MODEL_ID),
    )
    return client, key or "synthetic"


def cmd_preview(args):
    path = Path(args.file)
    try:
        pr = prepare(path.read_bytes(), path.name)
    except OSError as e:
        print(json.dumps({"error": "unreadable_file", "reason": str(e)}), file=sys.stderr)
        return 2
    except IngestError as e:
        print(json.dumps({"error": e.code, **e.detail}), file=sys.stderr)
        return 2
    s = pr.structure
    summary = {
        "title": pr.parsed.title,
        "author": pr.parsed.author,
        "format": pr.parsed.format,
        "words": s.word_count,
        "chapters": len(s.chapters),
        "sections": len(s.sections),
        "beats": len(s.beats),
        "preset": s.preset,
        "chapter_source": s.chapter_source,
        "estimate": asdict(pr.estimate),
        "stripped": [asdict(x) for x in pr.parsed.stripped],
        "warnings": pr.parsed.warnings,
        "content_hash": pr.content_hash,
    }
    if args.json:
        print(json.dumps(summary))
    else:
        for k, v in summary.items():
            print(f"{k}: {v}")
    return 0


class _Recording:
    def __init__(self, inner, path):
        self.inner = inner
        self.path = path

    async def ask(self, state, questions):
        raw, model = await self.inner.ask(state, questions)
        record(self.path, cache_key(state, questions), raw, model)
        return raw, model

    async def aclose(self):
        await self.inner.aclose()


def cmd_record(args):
    made = _client(args)
    if made is None:
        return 2
    inner, key = made
    path = Path(args.file)
    out = Path(args.out)
    pr = prepare(path.read_bytes(), path.name)
    client = _Recording(inner, out)
    kind = initial_work_kind(pr.parsed.format, pr.structure.word_count)

    async def go():
        try:
            await score_beats(
                client,
                pr.parsed.text,
                pr.structure,
                kind,
                key_hash=key_hash(key),
                done={},
            )
            spans = beat_paragraph_spans(pr.parsed.text, pr.structure, 0)
            chunks = driver_chunks(pr.parsed.text, spans)
            await ask_driver(
                client, key_hash(key), chunk_texts(pr.parsed.text, spans, chunks), "tension"
            )
        finally:
            await client.aclose()

    asyncio.run(go())
    print(f"recorded to {out}")
    return 0


def cmd_calibrate(args):
    made = _client(args)
    if made is None:
        return 2
    client, key = made
    emit = (lambda _line: None) if args.quiet else None

    async def go():
        try:
            return await run_calibration(
                client,
                key_hash(key),
                Path(args.texts_dir),
                Path(args.fixtures),
                emit=emit,
                split=args.split,
            )
        finally:
            await client.aclose()

    res = asyncio.run(go())
    md = render_report(res, QUESTION_SET_VERSION, args.model if args.mode == "live" else args.mode)
    print(md)
    if args.rows_out:
        write_rows(res["rows"], Path(args.rows_out))
    out_dir = Path(args.out)
    name = f"{date.today().isoformat()}-{QUESTION_SET_VERSION}"
    if args.mode == "live":
        name += f"-{args.model}"
    if args.split != "all":
        name += f"-{args.split}"
    out = out_dir / f"{name}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(md)
    return 0


def cmd_gallery(args):
    made = _client(args)
    if made is None:
        return 2
    client, key = made
    emit = (lambda _line: None) if args.quiet else None

    async def go():
        try:
            return await build_gallery(
                Path(args.list),
                Path(args.out),
                Path(args.cache),
                client,
                key_hash(key),
                only=args.only or None,
                emit=emit,
            )
        finally:
            await client.aclose()

    r = asyncio.run(go())
    print(json.dumps(r))
    return 1 if r["failed"] else 0


def cmd_recurve(args):
    try:
        refused = recurve_gallery(Path(args.out))
    except RuntimeError as e:
        print(e, file=sys.stderr)
        return 1
    return 1 if refused else 0


def cmd_analyze(args):
    made = _client(args, fixture_path=Path(args.fixture) if args.fixture else None)
    if made is None:
        return 2
    client, key = made
    path = Path(args.file)
    try:
        pr = prepare(path.read_bytes(), path.name)

        async def go():
            try:
                return await analyze_text(client, key_hash(key), pr)
            finally:
                await client.aclose()

        answers, analysis = asyncio.run(go())
    except OSError as e:
        print(json.dumps({"error": "unreadable_file", "reason": str(e)}), file=sys.stderr)
        return 2
    except IngestError as e:
        print(json.dumps({"error": e.code, **e.detail}), file=sys.stderr)
        return 2
    except JevFixtureMissing as e:
        print(json.dumps({"error": type(e).__name__, "reason": str(e)}), file=sys.stderr)
        return 2
    result = {
        "structure": asdict(pr.structure),
        "answers": {str(k): v for k, v in answers.items()},
        "analysis": analysis,
    }
    text = json.dumps(result)
    if args.out:
        Path(args.out).write_text(text)
    else:
        print(text)
    return 0


def _name(key: str) -> str:
    return key.replace("_", " ").capitalize()


def cmd_questions_json(args):
    data = {
        "version": QUESTION_SET_VERSION,
        "axes": [
            {
                "key": k,
                "name": _name(k),
                "question": f"{a.question} {a.note}" if a.note else a.question,
                "levels": [lvl[0] for lvl in a.levels],
            }
            for k, a in AXES.items()
        ],
        "events": [{"key": k, "name": _name(k), "question": q} for k, q in EVENTS.items()],
        # The frontend keeps its own copies of these; a test there pins each one to this file.
        "constants": {
            "bins": config.BINS,
            "score_max": max(len(a.levels) for a in AXES.values()) - 1,
            "mode_confidence": config.MODE_MIXED_CONFIDENCE,
            "shape_named_r": config.SHAPE_NAMED_R,
            "shape_leans_r": config.SHAPE_LEANS_R,
            "shape_margin": config.SHAPE_MARGIN,
            "passage_words": config.BEAT_TARGET,
        },
    }
    Path(args.out).write_text(
        json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="sos")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("preview")
    p.add_argument("file")
    p.add_argument("--json", action="store_true")
    p.set_defaults(fn=cmd_preview)
    r = sub.add_parser("record-fixtures")
    r.add_argument("file")
    r.add_argument("--out", required=True)
    r.add_argument("--mode", default="synthetic", choices=["live", "synthetic"])
    r.set_defaults(fn=cmd_record)
    c = sub.add_parser("calibrate")
    c.add_argument("--texts-dir", required=True)
    c.add_argument("--fixtures", required=True)
    c.add_argument("--mode", default="synthetic", choices=["live", "synthetic"])
    c.add_argument("--out", default="docs/calibration")
    c.add_argument("--quiet", action="store_true")
    c.add_argument("--split", default="all", choices=["dev", "test", "all"])
    c.add_argument("--rows-out")
    c.add_argument("--model", default=MODEL_ID)
    c.set_defaults(fn=cmd_calibrate)
    g = sub.add_parser("gallery-build")
    g.add_argument("--list", default="gallery/list.toml")
    g.add_argument("--out", default="frontend/public/gallery")
    g.add_argument("--cache", default="gallery/cache")
    g.add_argument("--mode", default="synthetic", choices=["live", "synthetic"])
    g.add_argument("--only", nargs="*")
    g.add_argument("--quiet", action="store_true")
    g.add_argument("--model", default=MODEL_ID)
    g.set_defaults(fn=cmd_gallery)
    rc = sub.add_parser("gallery-recurve")
    rc.add_argument("--out", default="frontend/public/gallery")
    rc.set_defaults(fn=cmd_recurve)
    a = sub.add_parser("analyze")
    a.add_argument("file")
    a.add_argument("--mode", default="synthetic", choices=["synthetic", "fixture", "live"])
    a.add_argument("--fixture")
    a.add_argument("--out")
    a.set_defaults(fn=cmd_analyze)
    q = sub.add_parser("questions-json")
    q.add_argument("--out", required=True)
    q.set_defaults(fn=cmd_questions_json)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
