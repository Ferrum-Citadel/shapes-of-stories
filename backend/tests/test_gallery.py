import json
import re
from dataclasses import replace
from decimal import Decimal
from pathlib import Path

import pytest

from app import config
from app.cli import main
from app.core.curves.analysis import build_analysis
from app.core.jev.client import JevError, SyntheticJev
from app.core.jev.questions import MODEL_ID
from app.core.structure import Beat, Chapter, Section, Structure
from app.gallery import build_gallery, config_hash, scoring_hash, structure_hash
from app.worker import structure_from_json

LIST = '''
[[work]]
slug = "tiny"
title = "Tiny"
author = "Nobody"
pg_id = 1
'''

TWO_LIST = '''
[[work]]
slug = "zeta"
title = "Zeta"
author = "Nobody"
pg_id = 1

[[work]]
slug = "alpha"
title = "Alpha"
author = "Nobody"
pg_id = 2
'''


def _txt(extra: str = "") -> str:
    body = "\n\n".join(
        [f"CHAPTER {i}\n\n" + ("A quiet road under a wide sky. " * 120) + extra
         for i in range(1, 10)]
    )
    return (
        f"*** START OF THE PROJECT GUTENBERG EBOOK X ***\n\n{body}\n\n"
        f"*** END OF THE PROJECT GUTENBERG EBOOK X ***"
    )


async def test_build_skips_unchanged_and_writes_three_files(tmp_path: Path, monkeypatch):
    body = "\n\n".join(
        [f"CHAPTER {i}\n\n" + ("A quiet road under a wide sky. " * 120) for i in range(1, 10)]
    )
    txt = (
        f"*** START OF THE PROJECT GUTENBERG EBOOK TINY ***\n\n{body}\n\n"
        f"*** END OF THE PROJECT GUTENBERG EBOOK TINY ***"
    )
    monkeypatch.setattr("app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: txt.encode())
    lst = tmp_path / "list.toml"
    lst.write_text(LIST)
    out = tmp_path / "out"
    r1 = await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    assert r1["built"] == ["tiny"] and (out / "tiny.json").exists() and (out / "tiny.txt").exists()
    idx = json.loads((out / "index.json").read_text())
    assert idx[0]["slug"] == "tiny" and len(idx[0]["sparkline"]) == 100 and idx[0]["content_hash"]
    meta = json.loads((out / "tiny.json").read_text())
    assert "text" not in meta and meta["analysis"]["archetype"]["caption"]
    assert meta["work"]["pg_id"] == 1
    assert "quiet road" not in (out / "tiny.json").read_text()
    assert "quiet road" in (out / "tiny.txt").read_text()
    r2 = await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    assert r2["skipped"] == ["tiny"] and r2["built"] == []


async def test_only_updates_index_without_dropping_other_entries(tmp_path: Path, monkeypatch):
    texts = {1: _txt(), 2: _txt()}
    monkeypatch.setattr(
        "app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: texts[pg_id].encode()
    )
    lst = tmp_path / "list.toml"
    lst.write_text(TWO_LIST)
    out = tmp_path / "out"
    r1 = await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    assert set(r1["built"]) == {"zeta", "alpha"}
    idx = json.loads((out / "index.json").read_text())
    assert [e["slug"] for e in idx] == ["alpha", "zeta"]  # sorted by title: Alpha < Zeta
    zeta_hash_before = next(e for e in idx if e["slug"] == "zeta")["content_hash"]

    texts[1] = _txt(" A whole new twist arrives.")  # changes zeta's content hash
    r2 = await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k", only=["zeta"])
    assert r2["built"] == ["zeta"]
    idx2 = json.loads((out / "index.json").read_text())
    assert [e["slug"] for e in idx2] == ["alpha", "zeta"]  # still every entry, still sorted
    zeta_after = next(e for e in idx2 if e["slug"] == "zeta")
    assert zeta_after["content_hash"] != zeta_hash_before
    alpha_after = next(e for e in idx2 if e["slug"] == "alpha")
    assert alpha_after == next(e for e in idx if e["slug"] == "alpha")  # untouched


async def test_skip_restores_missing_txt(tmp_path: Path, monkeypatch):
    txt = _txt()
    monkeypatch.setattr("app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: txt.encode())
    lst = tmp_path / "list.toml"
    lst.write_text(LIST)
    out = tmp_path / "out"
    await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    (out / "tiny.txt").unlink()
    r = await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    assert r["skipped"] == ["tiny"]
    assert (out / "tiny.txt").exists()
    assert "quiet road" in (out / "tiny.txt").read_text()


async def test_progress_lines_report_start_progress_and_done_in_order(
    tmp_path: Path, monkeypatch
):
    txt = _txt()
    monkeypatch.setattr("app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: txt.encode())
    lst = tmp_path / "list.toml"
    lst.write_text(LIST)
    out = tmp_path / "out"
    lines: list[str] = []
    r = await build_gallery(
        lst, out, tmp_path / "cache", SyntheticJev(), "k", emit=lines.append
    )
    assert r["built"] == ["tiny"]
    start = next(i for i, ln in enumerate(lines) if ln.startswith("[1/1] tiny: ") and "words" in ln)
    progress = next(i for i, ln in enumerate(lines) if ln.startswith("  tiny: ") and "beats" in ln)
    done = next(
        i for i, ln in enumerate(lines)
        if ln.startswith("[1/1] tiny: done in ") and ln.endswith(" s")
    )
    assert start < progress < done


class FakeLiveJev:
    def __init__(self, model):
        self.model = model

    async def ask(self, state, questions):
        answers, _ = await SyntheticJev().ask(state, questions)
        return answers, self.model

    async def aclose(self):
        pass


async def test_skip_needs_the_exact_model_id(tmp_path: Path, monkeypatch, capsys):
    txt = _txt()
    monkeypatch.setattr("app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: txt.encode())
    lst = tmp_path / "list.toml"
    lst.write_text(LIST)
    out = tmp_path / "out"

    r1 = await build_gallery(lst, out, tmp_path / "cache", FakeLiveJev(MODEL_ID), "k")
    assert r1["built"] == ["tiny"]
    meta_path = out / "tiny.json"
    meta = json.loads(meta_path.read_text())
    assert meta["work"]["model_id"] == MODEL_ID

    r2 = await build_gallery(lst, out, tmp_path / "cache", FakeLiveJev(MODEL_ID), "k")
    assert r2["skipped"] == ["tiny"] and r2["built"] == []

    meta["work"]["model_id"] = "jev-0.1.0"  # built with an earlier model
    meta_path.write_text(json.dumps(meta))
    r3 = await build_gallery(lst, out, tmp_path / "cache", FakeLiveJev(MODEL_ID), "k")
    assert r3["built"] == ["tiny"]
    assert "requested" not in capsys.readouterr().err

    echoed = f"{MODEL_ID}-20261101"  # an echo the skip rule never matches says so
    await build_gallery(lst, tmp_path / "out2", tmp_path / "cache", FakeLiveJev(echoed), "k")
    assert f"tiny: scored by {echoed}, not the requested {MODEL_ID}\n" in capsys.readouterr().err


async def test_a_work_scored_by_another_model_is_written_and_fails_the_build(
    tmp_path: Path, monkeypatch, capsys
):
    texts = {1: _txt(), 2: _txt(" A whole new twist arrives.")}
    monkeypatch.setattr(
        "app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: texts[pg_id].encode()
    )
    lst = tmp_path / "list.toml"
    lst.write_text(TWO_LIST)
    out = tmp_path / "out"
    echoed = f"{MODEL_ID}-20261101"
    r = await build_gallery(lst, out, tmp_path / "cache", FakeLiveJev(echoed), "k")
    reason = f"scored by {echoed}, update MODEL_ID to {echoed}"
    assert r == {"built": [], "skipped": [], "failed": [
        {"slug": "zeta", "reason": reason}, {"slug": "alpha", "reason": reason},
    ]}
    for slug in ("zeta", "alpha"):
        assert json.loads((out / f"{slug}.json").read_text())["work"]["model_id"] == echoed
        assert (out / "answers" / f"{slug}.json").exists() and (out / f"{slug}.txt").exists()
    assert [e["slug"] for e in json.loads((out / "index.json").read_text())] == ["alpha", "zeta"]

    # Once MODEL_ID names the echo, the next run scores nothing.
    monkeypatch.setattr("app.gallery.MODEL_ID", echoed)
    r = await build_gallery(lst, out, tmp_path / "cache", FakeLiveJev(echoed), "k")
    assert r == {"built": [], "skipped": ["zeta", "alpha"], "failed": []}


async def test_skip_needs_the_same_analysis_settings(tmp_path: Path, monkeypatch):
    txt = _txt()
    monkeypatch.setattr("app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: txt.encode())
    lst = tmp_path / "list.toml"
    lst.write_text(LIST)
    out = tmp_path / "out"
    await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    meta_path = out / "tiny.json"
    meta = json.loads(meta_path.read_text())
    assert meta["work"]["config_hash"] == config_hash()

    monkeypatch.setattr("app.config.EVENT_MIN_BIN_GAP", 3)
    assert config_hash() != meta["work"]["config_hash"]
    r = await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    assert r["built"] == ["tiny"]
    r = await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    assert r["skipped"] == ["tiny"]

    meta = json.loads(meta_path.read_text())
    del meta["work"]["config_hash"]  # written before the field existed
    meta_path.write_text(json.dumps(meta))
    r = await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    assert r["built"] == ["tiny"]


async def test_skip_needs_a_matching_structure_hash(tmp_path: Path, monkeypatch):
    txt = _txt()
    monkeypatch.setattr("app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: txt.encode())
    lst = tmp_path / "list.toml"
    lst.write_text(LIST)
    out = tmp_path / "out"
    await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    meta_path = out / "tiny.json"
    meta = json.loads(meta_path.read_text())
    assert meta["work"]["structure_hash"]
    r = await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    assert r["skipped"] == ["tiny"]

    meta["work"]["structure_hash"] = "0" * 64  # same text, different beat or chapter bounds
    meta_path.write_text(json.dumps(meta))
    r = await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    assert r["built"] == ["tiny"]

    del meta["work"]["structure_hash"]  # written before the field existed
    meta_path.write_text(json.dumps(meta))
    r = await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    assert r["built"] == ["tiny"]


def test_structure_hash_covers_section_bounds_grouping_and_chapter_titles():
    base = Structure(
        sections=[Section(0, "PART I", 0, 20)],
        chapters=[Chapter(0, "I", 0, 20, section_idx=0)],
        beats=[Beat(0, 0, 0, 20, 4)],
        chapter_source="headings", preset="novel", word_count=4,
    )
    moved = replace(base, sections=[Section(0, "PART I", 0, 10)])
    regrouped = replace(base, chapters=[Chapter(0, "I", 0, 20, section_idx=None)])
    retitled = replace(base, chapters=[Chapter(0, "I. THE ROAD", 0, 20, section_idx=0)])
    assert len({structure_hash(x) for x in (base, moved, regrouped, retitled)}) == 4


def test_scoring_hash_covers_the_novel_length(monkeypatch):
    before = scoring_hash()
    monkeypatch.setattr("app.config.NOVEL_MIN_WORDS", 30_000)
    assert scoring_hash() != before


class _FailsLighthouseBeat(SyntheticJev):
    """Raises for the beat whose passage mentions the lighthouse: every time, or once."""

    def __init__(self, once: bool):
        self.once, self.failed = once, False

    async def ask(self, state, questions):
        if "lighthouse" in state.get("passage", "") and not (self.once and self.failed):
            self.failed = True
            raise JevError("unavailable")
        return await super().ask(state, questions)


def _lighthouse_txt() -> str:
    return _txt().replace("CHAPTER 5\n\n", "CHAPTER 5\n\nThe lighthouse keeper waved. ", 1)


async def test_transient_beat_failure_is_rescored_and_the_work_written(tmp_path, monkeypatch):
    txt = _lighthouse_txt()
    monkeypatch.setattr("app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: txt.encode())
    lst = tmp_path / "list.toml"
    lst.write_text(LIST)
    out = tmp_path / "out"
    r = await build_gallery(lst, out, tmp_path / "cache", _FailsLighthouseBeat(once=True), "k")
    assert r["built"] == ["tiny"] and r["failed"] == []
    a = json.loads((out / "tiny.json").read_text())["analysis"]
    assert a["missing_beats"] == [] and a["empty_bins"] == []


class _FailsEveryBeatOnce(SyntheticJev):
    def __init__(self):
        self.asked = set()

    async def ask(self, state, questions):
        passage = state.get("passage")
        if passage and passage not in self.asked:
            self.asked.add(passage)
            raise JevError("unavailable")
        return await super().ask(state, questions)


async def test_progress_counts_a_retried_beat_once(tmp_path, monkeypatch):
    txt = _txt()
    monkeypatch.setattr("app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: txt.encode())
    lst = tmp_path / "list.toml"
    lst.write_text(LIST)
    lines: list[str] = []
    r = await build_gallery(
        lst, tmp_path / "out", tmp_path / "cache", _FailsEveryBeatOnce(), "k", emit=lines.append
    )
    assert r["built"] == ["tiny"]
    counts = [re.search(r"(\d+)/(\d+) beats", ln).groups() for ln in lines if " beats, " in ln]
    assert counts and all(int(done) <= int(total) for done, total in counts)


def test_persistent_beat_failure_leaves_no_file_and_exits_non_zero(
    tmp_path, monkeypatch, capsys
):
    texts = {1: _lighthouse_txt(), 2: _txt()}
    monkeypatch.setattr(
        "app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: texts[pg_id].encode()
    )
    monkeypatch.setattr("app.cli.make_client", lambda *a, **k: _FailsLighthouseBeat(once=False))
    lst = tmp_path / "list.toml"
    lst.write_text(TWO_LIST)
    out = tmp_path / "out"
    code = main([
        "gallery-build", "--list", str(lst), "--out", str(out), "--cache", str(tmp_path / "cache"),
        "--quiet",
    ])
    assert code != 0
    captured = capsys.readouterr()
    assert json.loads(captured.out) == {
        "built": ["alpha"], "skipped": [], "failed": [{"slug": "zeta", "reason": "unscored beats"}]
    }
    assert re.fullmatch(
        r"\[1/2\] zeta: unscored beats \[\d+(, \d+)*\], not written\n", captured.err
    )
    assert not (out / "zeta.json").exists() and not (out / "zeta.txt").exists()
    assert (out / "alpha.json").exists() and (out / "alpha.txt").exists()
    assert [e["slug"] for e in json.loads((out / "index.json").read_text())] == ["alpha"]


@pytest.mark.parametrize("once", [True, False])
async def test_only_a_work_that_is_written_asks_for_drivers(tmp_path, monkeypatch, once):
    from app.core import pipeline
    orig, drivers = pipeline.ask_driver, []

    async def counting_driver(*a):
        drivers.append(a[-1])
        return await orig(*a)

    monkeypatch.setattr(pipeline, "ask_driver", counting_driver)
    txt = _lighthouse_txt()
    monkeypatch.setattr("app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: txt.encode())
    lst = tmp_path / "list.toml"
    lst.write_text(LIST)
    client = _FailsLighthouseBeat(once)
    r = await build_gallery(lst, tmp_path / "out", tmp_path / "cache", client, "k")
    assert (r["built"] == ["tiny"]) is once and bool(drivers) is once


async def test_full_rebuild_keeps_the_index_entry_of_a_failed_work(tmp_path, monkeypatch):
    texts = {1: _lighthouse_txt(), 2: _txt()}
    monkeypatch.setattr(
        "app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: texts[pg_id].encode()
    )
    lst = tmp_path / "list.toml"
    lst.write_text(TWO_LIST)
    out = tmp_path / "out"
    await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    idx = json.loads((out / "index.json").read_text())
    meta_path = out / "zeta.json"
    meta = json.loads(meta_path.read_text())
    meta["work"]["structure_hash"] = "0" * 64  # forces zeta's rebuild
    meta_path.write_text(json.dumps(meta))

    r = await build_gallery(lst, out, tmp_path / "cache", _FailsLighthouseBeat(once=False), "k")
    assert r == {
        "built": [], "skipped": ["alpha"], "failed": [{"slug": "zeta", "reason": "unscored beats"}]
    }
    assert meta_path.exists()
    assert json.loads((out / "index.json").read_text()) == idx


class _RecordsPassages(SyntheticJev):
    def __init__(self):
        self.passages = []

    async def ask(self, state, questions):
        self.passages.append(state.get("passage", ""))
        return await super().ask(state, questions)


def test_a_work_cut_differently_from_its_declared_layout_is_refused_before_scoring(
    tmp_path, monkeypatch, capsys
):
    texts = {1: _lighthouse_txt(), 2: _txt()}
    monkeypatch.setattr(
        "app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: texts[pg_id].encode()
    )
    client = _RecordsPassages()
    monkeypatch.setattr("app.cli.make_client", lambda *a, **k: client)
    lst = tmp_path / "list.toml"
    lst.write_text(TWO_LIST.replace("pg_id = 1\n", "pg_id = 1\nsections = 0\nchapters = 8\n"))
    out = tmp_path / "out"
    code = main([
        "gallery-build", "--mode", "synthetic", "--list", str(lst), "--out", str(out),
        "--cache", str(tmp_path / "cache"), "--quiet",
    ])
    assert code != 0
    captured = capsys.readouterr()
    assert json.loads(captured.out) == {
        "built": ["alpha"], "skipped": [], "failed": [{"slug": "zeta", "reason": "layout differs"}]
    }
    assert captured.err == (
        "[1/2] zeta: declared 0 sections, 8 chapters, found 0 sections, 9 chapters, not written\n"
    )
    assert client.passages and not any("lighthouse" in p for p in client.passages)
    assert not (out / "zeta.json").exists() and not (out / "zeta.txt").exists()


async def test_an_unchanged_work_cut_differently_from_its_declared_layout_is_refused(
    tmp_path, monkeypatch
):
    txt = _txt()
    monkeypatch.setattr("app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: txt.encode())
    lst = tmp_path / "list.toml"
    lst.write_text(TWO_LIST)
    out = tmp_path / "out"
    await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    files = {p: p.read_bytes() for p in out.rglob("*") if p.is_file()}
    lst.write_text(TWO_LIST.replace("pg_id = 1\n", "pg_id = 1\nchapters = 8\n"))
    r = await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    assert r == {
        "built": [], "skipped": ["alpha"], "failed": [{"slug": "zeta", "reason": "layout differs"}]
    }
    assert {p: p.read_bytes() for p in out.rglob("*") if p.is_file()} == files


async def test_a_work_cut_as_declared_or_without_a_declaration_builds(tmp_path, monkeypatch):
    txt = _txt()
    monkeypatch.setattr("app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: txt.encode())
    lst = tmp_path / "list.toml"
    lst.write_text(TWO_LIST.replace("pg_id = 1\n", "pg_id = 1\nsections = 0\nchapters = 9\n"))
    r = await build_gallery(lst, tmp_path / "out", tmp_path / "cache", SyntheticJev(), "k")
    assert r == {"built": ["zeta", "alpha"], "skipped": [], "failed": []}


def _tiny_gallery(tmp_path, monkeypatch, toml=LIST) -> Path:
    txt = _txt()
    monkeypatch.setattr("app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: txt.encode())
    lst = tmp_path / "list.toml"
    lst.write_text(toml)
    out = tmp_path / "out"
    assert main(["gallery-build", "--list", str(lst), "--out", str(out),
                 "--cache", str(tmp_path / "cache"), "--quiet"]) == 0
    return out


def _without_answers(out: Path) -> Path:
    for f in (out / "answers").iterdir():
        f.unlink()
    return out


def test_recurve_rewrites_only_the_stored_curves(tmp_path, monkeypatch, capsys):
    out = _without_answers(_tiny_gallery(tmp_path, monkeypatch))
    meta_path, index_path = out / "tiny.json", out / "index.json"
    fresh, fresh_index = meta_path.read_text(), index_path.read_text()
    meta = json.loads(fresh)
    meta["analysis"]["bins"]["fortune"]["shape"][0] = 9.0
    meta["analysis"]["bins"]["tension"]["band"]["detail"][1][3] = -2.0
    meta_path.write_text(json.dumps(meta))
    index = json.loads(fresh_index)
    index[0]["sparkline"][0] = 9.0
    index_path.write_text(json.dumps(index))
    capsys.readouterr()

    assert main(["gallery-recurve", "--out", str(out)]) == 0
    assert capsys.readouterr().err == "tiny: curves rewritten\n"
    assert meta_path.read_text() == fresh
    assert index_path.read_text() == fresh_index
    for b in json.loads(fresh)["analysis"]["bins"].values():
        for curve in (b["shape"], b["detail"], *b["band"]["shape"], *b["band"]["detail"]):
            assert all(0.0 <= v <= 4.0 for v in curve)


def _decimals(x, key=""):
    if isinstance(x, float):
        yield key, -Decimal(repr(x)).as_tuple().exponent
    elif isinstance(x, list):
        for v in x:
            yield from _decimals(v, key)
    elif isinstance(x, dict):
        for k, v in x.items():
            yield from _decimals(v, k if k in ("raw", "sd") else key)


def test_stored_values_are_rounded_and_a_second_recurve_changes_nothing(tmp_path, monkeypatch):
    out = _tiny_gallery(tmp_path, monkeypatch)
    meta_path, index_path = out / "tiny.json", out / "index.json"
    fresh, fresh_index = meta_path.read_text(), index_path.read_text()
    # A small value is written with an exponent, and still counts only its decimals.
    assert list(_decimals(4e-05)) == [("", 5)]
    found = list(_decimals(json.loads(fresh)))
    assert {k for k, _ in found} == {"", "raw", "sd"}
    assert all(n <= (5 if k else 3) for k, n in found)
    # A file written before rounding carries the scores at full precision.
    meta = json.loads(fresh)
    for b in meta["analysis"]["bins"].values():
        b["raw"] = [None if v is None else v + 1e-7 for v in b["raw"]]
    meta_path.write_text(json.dumps(meta))

    assert main(["gallery-recurve", "--out", str(out)]) == 0
    assert meta_path.read_text() == fresh
    assert main(["gallery-recurve", "--out", str(out)]) == 0
    assert (meta_path.read_text(), index_path.read_text()) == (fresh, fresh_index)


def test_recurve_writes_nothing_when_one_archetype_would_change(tmp_path, monkeypatch, capsys):
    out = _without_answers(_tiny_gallery(tmp_path, monkeypatch, TWO_LIST))
    alpha, zeta, index = out / "alpha.json", out / "zeta.json", out / "index.json"
    meta = json.loads(alpha.read_text())
    meta["analysis"]["bins"]["fortune"]["shape"][0] = 9.0
    alpha.write_text(json.dumps(meta))
    meta = json.loads(zeta.read_text())
    meta["analysis"]["archetype"]["caption"] = "something else"
    zeta.write_text(json.dumps(meta))
    before = {p: p.read_text() for p in (alpha, zeta, index)}
    capsys.readouterr()

    assert main(["gallery-recurve", "--out", str(out)]) == 1
    assert capsys.readouterr().err == "zeta.json: the stored archetype would change\n"
    assert {p: p.read_text() for p in (alpha, zeta, index)} == before


def _decimals_of(answers: dict) -> set[int]:
    return {n for _, n in _decimals(answers)}


def test_the_build_writes_each_passage_s_answers_beside_the_work(tmp_path, monkeypatch):
    out = _tiny_gallery(tmp_path, monkeypatch)
    meta = json.loads((out / "tiny.json").read_text())
    answers = json.loads((out / "answers" / "tiny.json").read_text())
    assert list(answers) == [str(b["idx"]) for b in meta["structure"]["beats"]]
    a = answers["0"]
    assert set(a) == {"scores", "events", "mode"}
    assert set(a["scores"]["fortune"]) == {"score", "sd"}
    assert set(a["mode"]) == {"choice", "confidence"}
    assert max(_decimals_of(answers)) <= 2
    # The stored analysis is exactly what the stored answers give.
    assert meta["analysis"]["events"] == build_analysis(
        structure_from_json(meta["structure"]), answers
    )["events"]


async def test_a_missing_answers_file_rebuilds_the_work(tmp_path, monkeypatch):
    txt = _txt()
    monkeypatch.setattr("app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: txt.encode())
    lst = tmp_path / "list.toml"
    lst.write_text(LIST)
    out = tmp_path / "out"
    await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    (out / "answers" / "tiny.json").unlink()
    r = await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    assert r["built"] == ["tiny"] and (out / "answers" / "tiny.json").exists()


def _no_scoring(monkeypatch):
    async def refuse(*a, **k):
        raise AssertionError("scored")

    monkeypatch.setattr("app.core.pipeline.score_beats", refuse)
    monkeypatch.setattr("app.core.pipeline.ask_driver", refuse)
    monkeypatch.setattr("app.core.jev.client.SyntheticJev.ask", refuse)


def test_recurve_from_answers_reproduces_the_stored_analysis(tmp_path, monkeypatch, capsys):
    out = _tiny_gallery(tmp_path, monkeypatch)
    meta_path, index_path = out / "tiny.json", out / "index.json"
    fresh, fresh_index = meta_path.read_text(), index_path.read_text()
    meta = json.loads(fresh)
    meta["analysis"]["events"] = []
    meta["analysis"]["chapters"][0]["means"]["fortune"] = 9.0
    meta_path.write_text(json.dumps(meta))
    _no_scoring(monkeypatch)
    capsys.readouterr()

    assert main(["gallery-recurve", "--out", str(out)]) == 0
    assert capsys.readouterr().err == "tiny: derived from its answers\n"
    assert (meta_path.read_text(), index_path.read_text()) == (fresh, fresh_index)


def test_recurve_after_a_threshold_change_rederives_events_and_the_fingerprint(
    tmp_path, monkeypatch, capsys
):
    out = _tiny_gallery(tmp_path, monkeypatch)
    meta_path = out / "tiny.json"
    before = json.loads(meta_path.read_text())
    answers_before = (out / "answers" / "tiny.json").read_text()
    monkeypatch.setattr("app.config.EVENT_FAINT", {k: 0.1 for k in config.EVENT_FAINT})
    _no_scoring(monkeypatch)

    assert main(["gallery-recurve", "--out", str(out)]) == 0
    after = json.loads(meta_path.read_text())
    assert len(after["analysis"]["events"]) > len(before["analysis"]["events"])
    assert after["work"]["config_hash"] == config_hash() != before["work"]["config_hash"]
    assert after["work"]["scoring_hash"] == before["work"]["scoring_hash"]
    assert after["analysis"]["bins"] == before["analysis"]["bins"]
    assert (out / "answers" / "tiny.json").read_text() == answers_before
    # The next build finds nothing to do.
    capsys.readouterr()
    assert main(["gallery-build", "--list", str(tmp_path / "list.toml"), "--out", str(out),
                 "--cache", str(tmp_path / "cache"), "--quiet"]) == 0
    assert json.loads(capsys.readouterr().out)["skipped"] == ["tiny"]


def test_recurve_refuses_a_work_whose_peak_has_no_stored_driver_pick(
    tmp_path, monkeypatch, capsys
):
    out = _tiny_gallery(tmp_path, monkeypatch, TWO_LIST)
    alpha, zeta, index = out / "alpha.json", out / "zeta.json", out / "index.json"
    meta = json.loads(zeta.read_text())
    axis, idx = meta["analysis"]["peak_targets"][0]
    del meta["analysis"]["drivers"][axis][str(idx)]
    meta["analysis"]["events"] = []
    zeta.write_text(json.dumps(meta))
    zeta_before, index_before = zeta.read_text(), json.loads(index.read_text())
    capsys.readouterr()

    assert main(["gallery-recurve", "--out", str(out)]) == 1
    assert capsys.readouterr().err == (
        f"zeta: no stored {axis} driver pick for passage {idx}, not rewritten\n"
        "alpha: derived from its answers\n"
    )
    assert zeta.read_text() == zeta_before
    assert [e for e in json.loads(index.read_text()) if e["slug"] == "zeta"] == [
        e for e in index_before if e["slug"] == "zeta"
    ]
    assert json.loads(alpha.read_text())["analysis"]["events"]


class _FortuneRises(SyntheticJev):
    """Fortune low in every gloomy passage and high in every joyful one."""

    async def ask(self, state, questions):
        answers, model = await super().ask(state, questions)
        if "fortune" in answers:
            high = "joy" in state.get("passage", "")
            p = {"3": 0.5, "4": 0.5} if high else {"0": 0.5, "1": 0.5}
            answers["fortune"] = {
                **answers["fortune"], "score": 3.5 if high else 0.5, "probabilities": p,
            }
        return answers, model


def test_recurve_reports_a_changed_shape_and_writes_it(tmp_path, monkeypatch, capsys):
    # Nine chapters of five 140-word paragraphs: gloom for four, then joy, a clear rise.
    para = {w: f"The {w} came over the town that day. " * 20 for w in ("gloom", "joy")}
    body = "\n\n".join(
        f"CHAPTER {i}\n\n" + "\n\n".join([para["gloom" if i <= 4 else "joy"]] * 5)
        for i in range(1, 10)
    )
    txt = (
        f"*** START OF THE PROJECT GUTENBERG EBOOK X ***\n\n{body}\n\n"
        "*** END OF THE PROJECT GUTENBERG EBOOK X ***"
    )
    monkeypatch.setattr("app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: txt.encode())
    monkeypatch.setattr("app.cli.make_client", lambda *a, **k: _FortuneRises())
    lst = tmp_path / "list.toml"
    lst.write_text(LIST)
    out = tmp_path / "out"
    assert main(["gallery-build", "--list", str(lst), "--out", str(out),
                 "--cache", str(tmp_path / "cache"), "--quiet"]) == 0
    meta = json.loads((out / "tiny.json").read_text())
    assert min(b["word_count"] for b in meta["structure"]["beats"]) > 250
    before = meta["analysis"]["archetype"]
    assert before["state"] == "named"
    monkeypatch.setattr("app.config.SHAPE_MIN_SD", 99.0)
    capsys.readouterr()

    assert main(["gallery-recurve", "--out", str(out)]) == 0
    err = capsys.readouterr().err
    assert err == (
        f"tiny: the shape changes from {before['caption']} to Which Way Is Up?\n"
        "tiny: derived from its answers\n"
    )
    entry = json.loads((out / "index.json").read_text())[0]
    assert entry["archetype"]["state"] == "none"


def test_nothing_takes_an_answers_file_for_a_work(tmp_path, monkeypatch, capsys):
    out = _tiny_gallery(tmp_path, monkeypatch, TWO_LIST)
    answers = {p: p.read_text() for p in (out / "answers").iterdir()}
    assert sorted(p.name for p in answers) == ["alpha.json", "zeta.json"]
    assert sorted(p.name for p in out.glob("*.json")) == ["alpha.json", "index.json", "zeta.json"]
    capsys.readouterr()
    assert main(["gallery-recurve", "--out", str(out)]) == 0
    assert capsys.readouterr().err == (
        "alpha: derived from its answers\nzeta: derived from its answers\n"
    )
    assert [e["slug"] for e in json.loads((out / "index.json").read_text())] == ["alpha", "zeta"]
    assert {p: p.read_text() for p in (out / "answers").iterdir()} == answers


def test_recurve_refuses_a_work_scored_under_other_answer_settings(tmp_path, monkeypatch, capsys):
    out = _tiny_gallery(tmp_path, monkeypatch)
    before = {p: p.read_text() for p in (out / "tiny.json", out / "index.json")}
    monkeypatch.setattr("app.config.TAIL_MAX_WORDS", 60)
    _no_scoring(monkeypatch)
    capsys.readouterr()

    assert main(["gallery-recurve", "--out", str(out)]) == 1
    assert capsys.readouterr().err == (
        "tiny: settings a recurve cannot redo have changed, run gallery-build, not rewritten\n"
    )
    assert {p: p.read_text() for p in before} == before


@pytest.mark.parametrize("change", ["drop", "add"])
def test_recurve_refuses_answers_that_do_not_match_the_stored_passages(
    tmp_path, monkeypatch, capsys, change
):
    out = _tiny_gallery(tmp_path, monkeypatch)
    answers_path = out / "answers" / "tiny.json"
    answers = json.loads(answers_path.read_text())
    if change == "drop":
        del answers[max(answers, key=int)]
    else:
        answers[str(len(answers))] = answers["0"]
    answers_path.write_text(json.dumps(answers))
    before = {p: p.read_text() for p in (out / "tiny.json", out / "index.json")}
    _no_scoring(monkeypatch)
    capsys.readouterr()

    assert main(["gallery-recurve", "--out", str(out)]) == 1
    assert capsys.readouterr().err == (
        "tiny: its answers are not one per stored passage, run gallery-build, not rewritten\n"
    )
    assert {p: p.read_text() for p in before} == before


async def test_skip_needs_the_same_answer_settings(tmp_path, monkeypatch):
    txt = _txt()
    monkeypatch.setattr("app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: txt.encode())
    lst = tmp_path / "list.toml"
    lst.write_text(LIST)
    out = tmp_path / "out"
    await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    meta_path = out / "tiny.json"
    assert json.loads(meta_path.read_text())["work"]["scoring_hash"] == scoring_hash()

    monkeypatch.setattr("app.gallery.GATE_CONFIDENCE", 0.99)
    r = await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    assert r["built"] == ["tiny"]

    meta = json.loads(meta_path.read_text())
    del meta["work"]["scoring_hash"]  # written before the field existed
    meta_path.write_text(json.dumps(meta))
    r = await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    assert r["built"] == ["tiny"]


async def test_a_build_cut_short_before_the_work_file_rebuilds_the_work(tmp_path, monkeypatch):
    txt = _txt()
    monkeypatch.setattr("app.gallery.fetch_gutenberg", lambda pg_id, cache_dir: txt.encode())
    lst = tmp_path / "list.toml"
    lst.write_text(LIST)
    out = tmp_path / "out"
    await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    monkeypatch.setattr("app.config.TAIL_MAX_WORDS", 60)
    write = Path.write_text

    def cut_after_the_answers(self, *a, **k):
        n = write(self, *a, **k)
        if self == out / "answers" / "tiny.json":
            raise KeyboardInterrupt
        return n

    monkeypatch.setattr(Path, "write_text", cut_after_the_answers)
    with pytest.raises(KeyboardInterrupt):
        await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    monkeypatch.setattr(Path, "write_text", write)
    r = await build_gallery(lst, out, tmp_path / "cache", SyntheticJev(), "k")
    assert r["built"] == ["tiny"]
