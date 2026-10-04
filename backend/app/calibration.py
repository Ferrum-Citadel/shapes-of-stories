"""Calibration: score labelled passages and compare with reference labels."""
import csv
import math
import sys
from pathlib import Path

import numpy as np
from scipy.stats import spearmanr

from app import config
from app.core.jev.answers import normalize_answers
from app.core.jev.limiter import LIMITER
from app.core.jev.questions import AXES, EVENTS
from app.core.jev.scorer import DRIVER_CONFIDENCE, Q_PLAIN, ask_driver
from app.core.jev.state import build_state
from app.core.text import chunk_texts, driver_chunks, passage_paragraph_spans, tail

DRIVER_GATES = (0.5, 0.6, 0.7, 0.8, 0.9)
EVENT_THRESHOLDS = tuple(round(0.50 + 0.05 * i, 2) for i in range(9))  # 0.50 .. 0.90
ROWS_FIELDS = [
    "file", "work_slug", "start_cp", "end_cp", "split",
    "kind", "name", "reference", "prediction", "confidence", "accepted", "chunk",
]


def stderr_emit(line: str) -> None:
    print(line, file=sys.stderr, flush=True)


def spearman(xs: list[float], ys: list[float]) -> float:
    stat = spearmanr(xs, ys).statistic
    return 0.0 if math.isnan(stat) else stat


def bootstrap_spearman_ci(
    xs: list[float], ys: list[float], *, n_resamples: int = 1000, seed: int = 0
) -> tuple[float, float]:
    """95% percentile-bootstrap CI for the Spearman correlation of paired (xs, ys)."""
    rng = np.random.default_rng(seed)
    xs_a, ys_a = np.asarray(xs), np.asarray(ys)
    n = len(xs_a)
    stats = np.empty(n_resamples)
    for i in range(n_resamples):
        idx = rng.integers(0, n, n)
        stats[i] = spearman(xs_a[idx], ys_a[idx])
    lo, hi = np.percentile(stats, [2.5, 97.5])
    return float(lo), float(hi)


def confusion_counts(pairs: list[tuple[float, bool]], threshold: float) -> tuple[int, int, int]:
    """tp/fp/fn for binary (probability, gold) pairs at a threshold. True negatives untracked."""
    tp = fp = fn = 0
    for prob, gold in pairs:
        pred = prob >= threshold
        if pred and gold:
            tp += 1
        elif pred:
            fp += 1
        elif gold:
            fn += 1
    return tp, fp, fn


def precision_recall_f1(
    tp: int, fp: int, fn: int
) -> tuple[float | None, float | None, float | None]:
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    if precision is None or recall is None:
        f1 = None
    elif precision + recall == 0:
        f1 = 0.0
    else:
        f1 = 2 * precision * recall / (precision + recall)
    return precision, recall, f1


def _level_confusion(pairs: list[tuple[float, float]]) -> tuple[list[list[int]], float | None]:
    """5x5 confusion (rows=reference level, cols=predicted level, rounded/clipped) plus MAE."""
    m = [[0] * 5 for _ in range(5)]
    errs = []
    for ref, pred in pairs:
        errs.append(abs(ref - pred))
        r = min(4, max(0, round(ref)))
        p = min(4, max(0, round(pred)))
        m[r][p] += 1
    mae = round(sum(errs) / len(errs), 3) if errs else None
    return m, mae


def _split_of(row: dict) -> str:
    return row.get("split") or ""


def _keep_split(row: dict, split: str) -> bool:
    """A missing/empty `split` value counts for every split; `all` keeps everything."""
    return split == "all" or _split_of(row) in ("", split)


def _rows(path: Path, split: str):
    with open(path, newline="", encoding="utf-8") as f:
        return [r for r in csv.DictReader(f) if _keep_split(r, split)]


def write_rows(rows: list[dict], path: Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=ROWS_FIELDS)
        w.writeheader()
        w.writerows(rows)


async def _score(client, key_hash, text, a, b):
    await LIMITER.acquire(key_hash)
    t = tail(text, 0, a, config.TAIL_MAX_WORDS)
    raw, model = await client.ask(build_state("novel", "", t, text[a:b]), Q_PLAIN)
    return normalize_answers(raw, model)


async def _calibrate_axes(rows, scored, step, out_rows) -> dict:
    axes: dict[str, dict] = {}
    by_axis: dict[str, tuple[list, list]] = {ax: ([], []) for ax in AXES}
    for r in rows:
        step(f"{r['work_slug']} {r['axis']}")
        ans = await scored(r["work_slug"], int(r["start_cp"]), int(r["end_cp"]))
        level = float(r["level"])
        score_ans = ans["scores"][r["axis"]]
        by_axis[r["axis"]][0].append(level)
        by_axis[r["axis"]][1].append(score_ans["score"])
        out_rows.append({
            "file": "passages", "work_slug": r["work_slug"], "start_cp": r["start_cp"],
            "end_cp": r["end_cp"], "split": _split_of(r), "kind": "axis", "name": r["axis"],
            "reference": level, "prediction": score_ans["score"],
            "confidence": score_ans["confidence"],
        })
    for ax, (h, m) in by_axis.items():
        if len(h) >= 3:
            confusion, mae = _level_confusion(list(zip(h, m, strict=True)))
            lo, hi = bootstrap_spearman_ci(h, m)
            axes[ax] = {
                "n": len(h), "spearman": round(spearman(h, m), 3),
                "ci": [round(lo, 3), round(hi, 3)], "confusion": confusion, "mae": mae,
            }
    return axes


async def _calibrate_events(rows, scored, step, out_rows) -> tuple[dict, dict]:
    ev: dict[str, dict] = {}
    sweeps: dict[str, dict] = {}
    ev_pairs: dict[str, list[tuple[float, bool]]] = {e: [] for e in EVENTS}
    for r in rows:
        step(f"{r['work_slug']} events")
        ans = await scored(r["work_slug"], int(r["start_cp"]), int(r["end_cp"]))
        for e in EVENTS:
            prob = ans["events"][e]
            gold = r[e] == "1"
            ev_pairs[e].append((prob, gold))
            out_rows.append({
                "file": "events", "work_slug": r["work_slug"], "start_cp": r["start_cp"],
                "end_cp": r["end_cp"], "split": _split_of(r), "kind": "event", "name": e,
                "reference": int(gold), "prediction": prob, "confidence": "",
            })
    for e in EVENTS:
        pairs = ev_pairs[e]
        positives = sum(1 for _, gold in pairs if gold)
        faint, strong = config.EVENT_FAINT[e], config.EVENT_STRONG[e]
        sweep_rows = []
        best = None
        for t in EVENT_THRESHOLDS:
            tp, fp, fn = confusion_counts(pairs, t)
            precision, recall, f1 = precision_recall_f1(tp, fp, fn)
            current = abs(t - strong) < 1e-9
            sweep_rows.append({
                "threshold": t,
                "precision": round(precision, 3) if precision is not None else None,
                "recall": round(recall, 3) if recall is not None else None,
                "f1": round(f1, 3) if f1 is not None else None,
                "current": current,
            })
            if precision is not None and precision >= 0.8 and f1 is not None:
                if best is None or f1 > best["f1"]:
                    best = {"threshold": t, "f1": f1}
            if current:
                ev[e] = {
                    "strong": strong, "tp": tp, "fp": fp, "fn": fn,
                    "precision": round(precision, 3) if precision is not None else None,
                }
        sweeps[e] = {
            "positives": positives, "faint": faint, "strong": strong,
            "rows": sweep_rows, "best": best,
        }
    return ev, sweeps


async def _calibrate_drivers(rows, client, key_hash, text_of, step, out_rows) -> dict:
    hits, n = 0, len(rows)
    n_options: list[int] = []
    # per row: (picked chunk holds an accepted paragraph, confidence, picked chunk is next to
    # the chunk holding the expected paragraph)
    driver_recs: list[tuple[bool, float, bool]] = []
    for r in rows:
        step(f"{r['work_slug']} {r['axis']}")
        t = text_of(r["work_slug"])
        a, b = int(r["start_cp"]), int(r["end_cp"])
        spans = passage_paragraph_spans(t, a, b)
        chunks = driver_chunks(t, spans)
        c_idx, conf = await ask_driver(client, key_hash, chunk_texts(t, spans, chunks), r["axis"])
        expected = int(r["expected_paragraph_idx"])
        # expected first, then up to two alternates; absent/empty column means expected only
        raw_accepted = r.get("accepted_paragraph_idxs") or str(expected)
        accepted = [int(x) for x in raw_accepted.split("|")]
        picked = chunks[c_idx] if c_idx is not None else None
        ok = picked is not None and any(picked[0] <= p <= picked[1] for p in accepted)
        exp_chunk = next((i for i, (x, y) in enumerate(chunks) if x <= expected <= y), None)
        adjacent = c_idx is not None and exp_chunk is not None and abs(c_idx - exp_chunk) == 1
        n_options.append(len(chunks))
        hits += int(ok and conf >= DRIVER_CONFIDENCE)
        driver_recs.append((ok, conf, adjacent))
        out_rows.append({
            "file": "drivers", "work_slug": r["work_slug"], "start_cp": r["start_cp"],
            "end_cp": r["end_cp"], "split": _split_of(r), "kind": "driver", "name": r["axis"],
            "reference": expected, "prediction": picked[0] if picked else "",
            "confidence": conf, "accepted": "|".join(map(str, accepted)),
            "chunk": f"{picked[0]}-{picked[1]}" if picked else "",
        })

    gates = []
    for g in DRIVER_GATES:
        shown = [ok for ok, c, _ in driver_recs if c >= g]
        g_hits = sum(shown)
        gates.append({
            "gate": g,
            "coverage": round(len(shown) / n, 3) if n else None,
            "hit_rate": round(g_hits / n, 3) if n else None,
            "precision": round(g_hits / len(shown), 3) if shown else None,
        })
    adjacent_rate = round(sum(adj for _, _, adj in driver_recs) / n, 3) if n else None
    return {
        "n": n, "hits": hits, "gate": DRIVER_CONFIDENCE,
        "rate": round(hits / n, 3) if n else None,
        "gates": gates, "adjacent_rate": adjacent_rate,
        "mean_options": round(sum(n_options) / n, 1) if n else None,
    }


async def run_calibration(
    client, key_hash: str, texts_dir: Path, fixtures_dir: Path, *, emit=None, split: str = "all"
) -> dict:
    emit = emit or stderr_emit
    texts: dict[str, str] = {}

    def text_of(slug):
        if slug not in texts:
            texts[slug] = (texts_dir / f"{slug}.txt").read_text(encoding="utf-8")
        return texts[slug]

    cache: dict[tuple, dict] = {}

    async def scored(slug, a, b):
        k = (slug, a, b)
        if k not in cache:
            cache[k] = await _score(client, key_hash, text_of(slug), a, b)
        return cache[k]

    passage_rows = _rows(fixtures_dir / "passages.csv", split)
    event_rows = _rows(fixtures_dir / "events.csv", split)
    driver_rows = _rows(fixtures_dir / "drivers.csv", split)
    total = len(passage_rows) + len(event_rows) + len(driver_rows)
    row_n = 0

    def step(label):
        nonlocal row_n
        row_n += 1
        emit(f"[{row_n}/{total}] {label}")

    out_rows: list[dict] = []
    axes = await _calibrate_axes(passage_rows, scored, step, out_rows)
    emit(f"axes: {len(passage_rows)} rows, {len(axes)} scored")
    ev, sweeps = await _calibrate_events(event_rows, scored, step, out_rows)
    emit(f"events: {len(event_rows)} rows")
    drivers = await _calibrate_drivers(driver_rows, client, key_hash, text_of, step, out_rows)
    emit(f"drivers: {drivers['n']} rows, {drivers['hits']} hits")
    return {
        "split": split,
        "counts": {
            "passages": len(passage_rows), "events": len(event_rows), "drivers": len(driver_rows),
        },
        "axes": axes,
        "events": ev,
        "sweeps": sweeps,
        "drivers": drivers,
        "rows": out_rows,
    }


def render_report(res: dict, qset: str, model: str) -> str:
    c = res["counts"]
    lines = [
        f"# Calibration report — question set {qset}, model {model}",
        "",
        f"Split: {res['split']} — passages: {c['passages']}, events: {c['events']}, "
        f"drivers: {c['drivers']}",
        "",
        "## Axes (Spearman vs reference, 95% CI from 1,000 bootstrap resamples)",
        "",
        "| axis | n | spearman | 95% CI | mae |",
        "| --- | --- | --- | --- | --- |",
    ]
    lines += [
        f"| {ax} | {v['n']} | {v['spearman']} | [{v['ci'][0]}, {v['ci'][1]}] | {v['mae']} |"
        for ax, v in res["axes"].items()
    ]
    lines.append("")
    for ax, v in res["axes"].items():
        lines += [f"### {ax} confusion (rows=reference level, cols=predicted level)", ""]
        lines += ["| ref\\pred | 0 | 1 | 2 | 3 | 4 |", "| --- | --- | --- | --- | --- | --- |"]
        lines += [
            f"| {i} | " + " | ".join(str(x) for x in row) + " |"
            for i, row in enumerate(v["confusion"])
        ]
        lines.append("")
    lines += [
        "## Events (precision at each type's strong threshold)",
        "",
        "| event | strong | tp | fp | fn | precision |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    lines += [
        f"| {e} | {c['strong']:.2f} | {c['tp']} | {c['fp']} | {c['fn']} | {c['precision']} |"
        for e, c in res["events"].items()
    ]
    lines += ["", "## Event threshold sweep", ""]
    for e, sw in res["sweeps"].items():
        lines += [
            f"### {e} (reference positives: {sw['positives']}; "
            f"faint {sw['faint']:.2f}, strong {sw['strong']:.2f})",
            "",
        ]
        lines += ["| threshold | precision | recall | f1 |", "| --- | --- | --- | --- |"]
        for row in sw["rows"]:
            mark = " (current)" if row["current"] else ""
            lines.append(
                f"| {row['threshold']:.2f}{mark} | {row['precision']} | "
                f"{row['recall']} | {row['f1']} |"
            )
        best = sw["best"]
        best_line = f"threshold {best['threshold']:.2f}" if best else "none"
        lines += ["", f"best F1 with precision >= 0.8: {best_line}", ""]
    d = res["drivers"]
    lines += [
        f"## Drivers: {d['hits']}/{d['n']} hits at the production gate {d['gate']} "
        f"(rate {d['rate']})",
        "",
        "| confidence gate | coverage | hit rate | precision among shown |",
        "| --- | --- | --- | --- |",
    ]
    lines += [
        f"| {g['gate']} | {g['coverage']} | {g['hit_rate']} | "
        f"{'' if g['precision'] is None else g['precision']} |"
        for g in d["gates"]
    ]
    lines += [
        "",
        f"mean options per driver row: {d['mean_options']}",
        "",
        "adjacent rate (picked chunk next to the chunk holding the expected paragraph): "
        f"{d['adjacent_rate']}",
        "",
    ]
    return "\n".join(lines)
