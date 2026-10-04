import asyncio
import csv
import os
import subprocess
import sys
from pathlib import Path

from app import config
from app.calibration import (
    _score,
    bootstrap_spearman_ci,
    confusion_counts,
    precision_recall_f1,
    render_report,
    run_calibration,
    spearman,
    write_rows,
)
from app.core.jev.client import SyntheticJev
from app.core.jev.scorer import DRIVER_CONFIDENCE
from app.core.text import tail


def _events_header():
    return (
        "reveal,death,arrival_departure,location_change,confrontation,"
        "reconciliation,decision,betrayal,injury_violence"
    ).split(",")


def test_spearman_with_ties():
    assert abs(spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1.0) < 1e-9
    assert abs(spearman([1, 2, 3, 4], [40, 30, 20, 10]) + 1.0) < 1e-9
    assert abs(spearman([1, 1, 2, 3], [1, 2, 2, 3]) - 0.8) < 0.15


def test_run_calibration_on_samples(tmp_path: Path):
    texts = tmp_path / "texts"
    texts.mkdir()
    body = "\n\n".join([f"Para {i}. " + "Some words here. " * 40 for i in range(20)])
    (texts / "sample.txt").write_text(body)
    fx = tmp_path / "cal"
    fx.mkdir()
    with open(fx / "passages.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow("work_slug,start_cp,end_cp,axis,level,rationale,source".split(","))
        for i, lvl in enumerate([0, 2, 4, 1, 3]):
            w.writerow(["sample", i * 300, i * 300 + 600, "tension", lvl, "r", "s"])
    with open(fx / "events.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["work_slug", "start_cp", "end_cp", *_events_header(), "source"])
        w.writerow(["sample", 0, 600, *([0] * 9), "s"])
        w.writerow(["sample", 600, 1200, 1, *([0] * 8), "s"])
    with open(fx / "drivers.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow("work_slug,start_cp,end_cp,axis,expected_paragraph_idx".split(","))
        w.writerow(["sample", 0, 900, "tension", 0])
    res = asyncio.run(run_calibration(SyntheticJev(), "k", texts, fx))
    assert res["axes"]["tension"]["n"] == 5 and -1 <= res["axes"]["tension"]["spearman"] <= 1
    assert set(res["events"]) >= {"reveal", "death"} and res["drivers"]["n"] == 1
    md = render_report(res, "q3", "synthetic")
    assert "tension" in md and "| reveal" in md


def test_score_tail_is_empty_at_offset_zero_and_real_for_later_passages():
    text = (
        "Opening line of the book here. Another early sentence follows. "
        "A third sentence completes the opening. "
    ) * 3 + "\n\n" + ("Middle words go here to pad the text out nicely. " * 40)
    captured = []

    class Recording(SyntheticJev):
        async def ask(self, state, questions):
            captured.append(state)
            return await super().ask(state, questions)

    client = Recording()
    asyncio.run(_score(client, "k", text, 0, 30))
    asyncio.run(_score(client, "k", text, 400, 440))

    assert captured[0]["previous_passage_tail"] == ""
    expected_tail = tail(text, 0, 400, config.TAIL_MAX_WORDS)
    assert expected_tail != ""
    assert captured[1]["previous_passage_tail"] == expected_tail


def test_driver_calibration_sends_no_state(tmp_path: Path):
    texts = tmp_path / "texts"
    texts.mkdir()
    body = "\n\n".join([f"Para {i}. " + "Some words here. " * 40 for i in range(20)])
    (texts / "sample.txt").write_text(body)
    fx = tmp_path / "cal"
    fx.mkdir()
    with open(fx / "passages.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow("work_slug,start_cp,end_cp,axis,level,rationale,source".split(","))
    with open(fx / "events.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["work_slug", "start_cp", "end_cp", *_events_header(), "source"])
    with open(fx / "drivers.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow("work_slug,start_cp,end_cp,axis,expected_paragraph_idx".split(","))
        w.writerow(["sample", 0, 1378, "tension", 0])       # two whole paragraphs from offset 0
        w.writerow(["sample", 1380, 2758, "tension", 0])    # two whole paragraphs, later offset

    captured = []

    class Recording(SyntheticJev):
        async def ask(self, state, questions):
            captured.append(state)
            return await super().ask(state, questions)

    asyncio.run(run_calibration(Recording(), "k", texts, fx))

    assert captured == [{}, {}]


def test_calibrate_defaults_to_synthetic_mode_without_a_key(tmp_path: Path):
    texts = tmp_path / "texts"
    texts.mkdir()
    (texts / "sample.txt").write_text("Some words here. " * 40)
    fx = tmp_path / "cal"
    fx.mkdir()
    with open(fx / "passages.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow("work_slug,start_cp,end_cp,axis,level,rationale,source".split(","))
        w.writerow(["sample", 0, 300, "tension", 2, "r", "s"])
    with open(fx / "events.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["work_slug", "start_cp", "end_cp", *_events_header(), "source"])
        w.writerow(["sample", 0, 300, *([0] * 9), "s"])
    with open(fx / "drivers.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow("work_slug,start_cp,end_cp,axis,expected_paragraph_idx".split(","))
    env = os.environ.copy()
    env.pop("TYPESAFE_API_KEY", None)
    out = tmp_path / "report"
    subprocess.run(
        [
            sys.executable, "-m", "app.cli", "calibrate",
            "--texts-dir", str(texts), "--fixtures", str(fx), "--out", str(out),
        ],
        capture_output=True,
        text=True,
        env=env,
        check=True,
    )
    assert list(out.iterdir())


def test_calibrate_live_without_key_exits_2():
    env = os.environ.copy()
    env.pop("TYPESAFE_API_KEY", None)
    result = subprocess.run(
        [
            sys.executable, "-m", "app.cli", "calibrate",
            "--mode", "live", "--texts-dir", "x", "--fixtures", "y",
        ],
        capture_output=True,
        text=True,
        env=env,
    )
    assert result.returncode == 2
    assert "missing_api_key" in result.stderr


def test_split_filters_rows_and_reports_counts(tmp_path: Path):
    texts = tmp_path / "texts"
    texts.mkdir()
    body = "\n\n".join([f"Para {i}. " + "Some words here. " * 40 for i in range(20)])
    (texts / "sample.txt").write_text(body)
    fx = tmp_path / "cal"
    fx.mkdir()
    with open(fx / "passages.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow("work_slug,start_cp,end_cp,axis,level,rationale,source,split".split(","))
        w.writerow(["sample", 0, 600, "tension", 0, "r", "s", "dev"])
        w.writerow(["sample", 600, 1200, "tension", 2, "r", "s", "test"])
        w.writerow(["sample", 1200, 1800, "tension", 4, "r", "s", "dev"])
    with open(fx / "events.csv", "w", newline="") as f:  # no split column
        w = csv.writer(f)
        w.writerow(["work_slug", "start_cp", "end_cp", *_events_header(), "source"])
        w.writerow(["sample", 0, 600, *([0] * 9), "s"])
        w.writerow(["sample", 600, 1200, 1, *([0] * 8), "s"])
    with open(fx / "drivers.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow("work_slug,start_cp,end_cp,axis,expected_paragraph_idx".split(","))

    res_dev = asyncio.run(run_calibration(SyntheticJev(), "k", texts, fx, split="dev"))
    assert res_dev["counts"] == {"passages": 2, "events": 2, "drivers": 0}
    res_all = asyncio.run(run_calibration(SyntheticJev(), "k", texts, fx, split="all"))
    assert res_all["counts"] == {"passages": 3, "events": 2, "drivers": 0}

    md = render_report(res_dev, "q3", "synthetic")
    assert "Split: dev" in md and "passages: 2" in md and "events: 2" in md


def test_rows_out_has_expected_columns_and_count_and_no_passage_text(tmp_path: Path):
    texts = tmp_path / "texts"
    texts.mkdir()
    body = "\n\n".join(
        [f"Para {i}. SENTINELWORD " + "Some words here. " * 40 for i in range(20)]
    )
    (texts / "sample.txt").write_text(body)
    fx = tmp_path / "cal"
    fx.mkdir()
    with open(fx / "passages.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow("work_slug,start_cp,end_cp,axis,level,rationale,source".split(","))
        w.writerow(["sample", 0, 600, "tension", 0, "r", "s"])
        w.writerow(["sample", 600, 1200, "tension", 2, "r", "s"])
    with open(fx / "events.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["work_slug", "start_cp", "end_cp", *_events_header(), "source"])
        w.writerow(["sample", 0, 600, *([0] * 9), "s"])
    with open(fx / "drivers.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow("work_slug,start_cp,end_cp,axis,expected_paragraph_idx".split(","))
        w.writerow(["sample", 0, 900, "tension", 0])

    res = asyncio.run(run_calibration(SyntheticJev(), "k", texts, fx))
    out = tmp_path / "rows.csv"
    write_rows(res["rows"], out)
    with open(out, newline="") as f:
        r = csv.DictReader(f)
        assert r.fieldnames == [
            "file", "work_slug", "start_cp", "end_cp", "split",
            "kind", "name", "reference", "prediction", "confidence", "accepted", "chunk",
        ]
        rows = list(r)
    assert len(rows) == 2 + 9 * 1 + 1
    assert not any("SENTINELWORD" in v for row in rows for v in row.values())
    driver_rows = [row for row in rows if row["kind"] == "driver"]
    assert [row["accepted"] for row in driver_rows] == ["0"]
    # a 123-word paragraph, then the row's first 35 words of the next one fold into its chunk
    assert [row["chunk"] for row in driver_rows] == ["0-1"]
    assert all(row["chunk"] == "" for row in rows if row["kind"] != "driver")


class _Picks(SyntheticJev):
    """Answers every driver question with one fixed paragraph and confidence."""

    def __init__(self, pick: int, conf: float):
        super().__init__()
        self.pick, self.conf = pick, conf

    async def ask(self, state, questions):
        if "driver" in questions:
            return {"driver": {"choice": f"c{self.pick}", "confidence": self.conf}}, "synthetic"
        return await super().ask(state, questions)


# 20 paragraphs of 122 words (one chunk each) and of 29 words (chunks of three)
_LONG_PARAS = "\n\n".join([f"Para {i}. " + "Some words here. " * 40 for i in range(20)])
_SHORT_PARAS = "\n\n".join([f"Para {i}. " + "Some words here. " * 9 for i in range(20)])


def _drivers_only(
    tmp_path: Path, header: str, row: list, body: str = _LONG_PARAS
) -> tuple[Path, Path]:
    texts = tmp_path / "texts"
    texts.mkdir()
    (texts / "sample.txt").write_text(body)
    fx = tmp_path / "cal"
    fx.mkdir()
    with open(fx / "passages.csv", "w", newline="") as f:
        csv.writer(f).writerow("work_slug,start_cp,end_cp,axis,level,rationale,source".split(","))
    with open(fx / "events.csv", "w", newline="") as f:
        csv.writer(f).writerow(["work_slug", "start_cp", "end_cp", *_events_header(), "source"])
    with open(fx / "drivers.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header.split(","))
        w.writerow(["sample", 0, len(body), *row])
    return texts, fx


def test_driver_pick_of_an_alternate_is_a_hit_but_not_adjacent(tmp_path: Path):
    texts, fx = _drivers_only(
        tmp_path, "work_slug,start_cp,end_cp,axis,expected_paragraph_idx,accepted_paragraph_idxs",
        ["tension", 0, "0|4"],
    )
    res = asyncio.run(run_calibration(_Picks(4, 0.85), "k", texts, fx))
    d = res["drivers"]
    assert d["hits"] == 1 and d["adjacent_rate"] == 0.0
    assert [g["hit_rate"] for g in d["gates"]] == [1.0, 1.0, 1.0, 1.0, 0.0]
    assert [g["precision"] for g in d["gates"]] == [1.0, 1.0, 1.0, 1.0, None]
    assert [r["accepted"] for r in res["rows"]] == ["0|4"]


def test_driver_file_without_accepted_column_accepts_only_the_expected_paragraph(tmp_path: Path):
    header = "work_slug,start_cp,end_cp,axis,expected_paragraph_idx"
    texts, fx = _drivers_only(tmp_path, header, ["tension", 0])
    miss = asyncio.run(run_calibration(_Picks(4, 0.85), "k", texts, fx))
    hit = asyncio.run(run_calibration(_Picks(0, 0.85), "k", texts, fx))
    assert miss["drivers"]["hits"] == 0 and hit["drivers"]["hits"] == 1
    assert miss["rows"][0]["accepted"] == hit["rows"][0]["accepted"] == "0"


def test_driver_hit_and_adjacency_are_judged_by_chunk(tmp_path: Path):
    # 29-word paragraphs chunk in threes: (0-2), (3-5), ..., (15-17), and the two left over
    # fold into the last chunk (15-19): six options
    header = "work_slug,start_cp,end_cp,axis,expected_paragraph_idx"
    texts, fx = _drivers_only(tmp_path, header, ["tension", 1], body=_SHORT_PARAS)
    hit = asyncio.run(run_calibration(_Picks(0, 0.85), "k", texts, fx))  # chunk 0-2 holds 1
    assert hit["drivers"]["hits"] == 1 and hit["drivers"]["adjacent_rate"] == 0.0
    assert hit["drivers"]["mean_options"] == 6.0
    assert hit["rows"][0]["prediction"] == 0 and hit["rows"][0]["chunk"] == "0-2"
    assert "mean options per driver row: 6.0" in render_report(hit, "q4", "synthetic")

    (tmp_path / "b").mkdir()
    texts, fx = _drivers_only(
        tmp_path / "b", header + ",accepted_paragraph_idxs", ["tension", 4, "4|5"],
        body=_SHORT_PARAS,
    )
    miss = asyncio.run(run_calibration(_Picks(0, 0.85), "k", texts, fx))  # 0-2 is next to 3-5
    assert miss["drivers"]["hits"] == 0 and miss["drivers"]["adjacent_rate"] == 1.0
    assert [g["hit_rate"] for g in miss["drivers"]["gates"]] == [0.0, 0.0, 0.0, 0.0, 0.0]


def test_drivers_table_states_the_gate_and_precision_among_shown(tmp_path: Path):
    header = "work_slug,start_cp,end_cp,axis,expected_paragraph_idx"
    texts, fx = _drivers_only(tmp_path, header, ["tension", 0])
    res = asyncio.run(run_calibration(_Picks(0, 0.85), "k", texts, fx))
    md = render_report(res, "q4", "synthetic")
    assert f"## Drivers: 1/1 hits at the production gate {DRIVER_CONFIDENCE}" in md
    assert "| confidence gate | coverage | hit rate | precision among shown |" in md
    assert "| 0.5 | 1.0 | 1.0 | 1.0 |" in md and "| 0.9 | 0.0 | 0.0 |  |" in md
    assert "mean options per driver row: 20.0" in md


def test_bootstrap_ci_deterministic_and_brackets_point_estimate():
    xs = list(range(12))
    ys = [0, 1, 2, 3, 5, 4, 6, 7, 9, 8, 10, 11]
    point = spearman(xs, ys)
    lo1, hi1 = bootstrap_spearman_ci(xs, ys, seed=0)
    lo2, hi2 = bootstrap_spearman_ci(xs, ys, seed=0)
    assert (lo1, hi1) == (lo2, hi2)
    assert lo1 <= point <= hi1


def test_threshold_sweep_precision_recall_at_two_thresholds():
    pairs = [(0.9, True), (0.6, True), (0.4, False), (0.8, False)]
    tp, fp, fn = confusion_counts(pairs, 0.5)
    assert (tp, fp, fn) == (2, 1, 0)
    precision, recall, _f1 = precision_recall_f1(tp, fp, fn)
    assert precision == 2 / 3 and recall == 1.0

    tp, fp, fn = confusion_counts(pairs, 0.85)
    assert (tp, fp, fn) == (1, 0, 1)
    precision, recall, _f1 = precision_recall_f1(tp, fp, fn)
    assert precision == 1.0 and recall == 0.5


def test_calibrate_cli_with_split_and_rows_out(tmp_path: Path):
    texts = tmp_path / "texts"
    texts.mkdir()
    (texts / "sample.txt").write_text("Some words here. " * 60)
    fx = tmp_path / "cal"
    fx.mkdir()
    with open(fx / "passages.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow("work_slug,start_cp,end_cp,axis,level,rationale,source,split".split(","))
        w.writerow(["sample", 0, 300, "tension", 2, "r", "s", "dev"])
        w.writerow(["sample", 300, 600, "tension", 3, "r", "s", "test"])
    with open(fx / "events.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["work_slug", "start_cp", "end_cp", *_events_header(), "source"])
        w.writerow(["sample", 0, 300, *([0] * 9), "s"])
    with open(fx / "drivers.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow("work_slug,start_cp,end_cp,axis,expected_paragraph_idx".split(","))
    env = os.environ.copy()
    env.pop("TYPESAFE_API_KEY", None)
    out_dir = tmp_path / "report"
    rows_out = tmp_path / "rows.csv"
    subprocess.run(
        [
            sys.executable, "-m", "app.cli", "calibrate",
            "--texts-dir", str(texts), "--fixtures", str(fx),
            "--out", str(out_dir), "--split", "dev", "--rows-out", str(rows_out),
        ],
        capture_output=True,
        text=True,
        env=env,
        check=True,
    )
    reports = list(out_dir.iterdir())
    assert reports and reports[0].name.endswith("-dev.md")
    assert rows_out.exists()


def test_sweep_marks_each_types_own_strong_threshold(tmp_path: Path, monkeypatch):
    monkeypatch.setitem(config.EVENT_STRONG, "death", 0.9)
    texts = tmp_path / "texts"
    texts.mkdir()
    (texts / "sample.txt").write_text("Some words here. " * 60)
    fx = tmp_path / "cal"
    fx.mkdir()
    with open(fx / "passages.csv", "w", newline="") as f:
        csv.writer(f).writerow("work_slug,start_cp,end_cp,axis,level,rationale,source".split(","))
    with open(fx / "events.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["work_slug", "start_cp", "end_cp", *_events_header(), "source"])
        w.writerow(["sample", 0, 300, *([0] * 9), "s"])
    with open(fx / "drivers.csv", "w", newline="") as f:
        csv.writer(f).writerow("work_slug,start_cp,end_cp,axis,expected_paragraph_idx".split(","))

    res = asyncio.run(run_calibration(SyntheticJev(), "k", texts, fx))
    current = {
        e: [r["threshold"] for r in sw["rows"] if r["current"]] for e, sw in res["sweeps"].items()
    }
    assert current["death"] == [0.9] and current["reveal"] == [0.8]
    md = render_report(res, "q4", "synthetic")
    assert "### death (reference positives: 0; faint 0.40, strong 0.90)" in md
    assert "| 0.90 (current) |" in md and "| 0.80 (current) |" in md
