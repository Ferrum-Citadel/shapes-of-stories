# The gallery and calibration

The gallery is the 50 public-domain works in `gallery/list.toml`, analyzed ahead of time. For each work the build writes the analysis (`<slug>.json`), the prepared text (`<slug>.txt`) and the rounded per-passage answers (`answers/<slug>.json`) to `frontend/public/gallery/`, plus an `index.json` for the gallery page; the site serves them as static files. These files come only from the build or from recurve, and tests pin them to the code. Setup and the tests are in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Rebuild the gallery

Maintainers rebuild on GitHub: Actions → **gallery** → Run workflow. Leave `only` empty to rebuild all 50 works, or give space-separated slugs. The workflow uses the repository's TypeSafe key, costs about $1.20 for all 50 works (5.2 million words) and commits the result to `main`.

Contributors build locally with their own key, from `backend/`:

```bash
TYPESAFE_API_KEY=... uv run python -m app.cli gallery-build --mode live --list ../gallery/list.toml --out ../frontend/public/gallery --cache ../gallery/cache
```

`--only <slug> ...` limits the run and `--quiet` hides the progress lines on stderr. `--mode synthetic` builds the same files offline with the stub, which is enough to check a change to text preparation or structure; never commit a synthetic build.

The build skips a work when nothing it depends on has changed. Each stored analysis carries six fingerprints, and a difference in any one rescores the work:

| Field | Changes when |
| --- | --- |
| `content_hash` | the prepared text changes |
| `structure_hash` | a chapter, section or passage boundary moves, or a chapter is retitled |
| `question_set_version` | the question set is bumped |
| `model_id` | `MODEL_ID` in `backend/app/core/jev/questions.py` changes |
| `scoring_hash` | a setting that changes the answers: passage sizes, the context sent with each passage, the driver chunk size |
| `config_hash` | a setting derived from the answers: smoothing, shape and event thresholds, peaks, the driver gate, `ANALYSIS_VERSION` |

Both hashes are computed in `backend/app/gallery.py`. When the way the analysis is derived changes without touching a setting, bump `ANALYSIS_VERSION` in `backend/app/core/curves/analysis.py`.

The build refuses a work and writes nothing for it in two cases: passages stay unscored after a retry (`unscored beats`), or the cut differs from the `sections` and `chapters` declared for the work in `gallery/list.toml` (`layout differs`). The layout check runs in synthetic mode too, so when a heading rule moves a cut on purpose, update the counts with it. A refused work keeps its old files; the build finishes the other works, names the refused ones on stderr even with `--quiet`, lists them under `failed` in the JSON on stdout and exits non-zero.

When Jev reports a model other than `MODEL_ID`, the work is still written, since it was paid for, but listed as failed with the reported model. Set `MODEL_ID` to that model before the next run, or the work is scored again every time.

## Recurve

`gallery-recurve` derives every stored analysis again from the stored answers, without scoring, so a change under `config_hash` costs nothing. From `backend/`:

```bash
uv run python -m app.cli gallery-recurve --out ../frontend/public/gallery
```

A work whose shape changes is written and reported on stderr. Recurve refuses a work, leaves its files and exits non-zero when its `scoring_hash` has changed, when its answers are not one per stored passage, or when a new peak needs a driver pick that was never asked. Those works need `gallery-build`.

## Bump the question set

Any change to a question's text needs a new question set version; the current one is `q5`.

1. Edit `backend/app/core/jev/questions.py` and bump `QUESTION_SET_VERSION`, for example `"q5"` to `"q6"`.
2. Run a calibration on `dev` and compare it with the previous set's report, then run it once on `test`.
3. Rebuild the whole gallery.
4. From `backend/`, regenerate the frontend's copy: `uv run python -m app.cli questions-json --out ../frontend/public/questions.json`. A backend test fails until it matches.

Results scored under an earlier set keep their version, and the app tells the reader that uploading the text again scores it with the current questions. A resumed upload whose answers came from another set or model starts again from the first passage.

## Run a calibration

`calibrate` scores the spans Claude labelled in `fixtures/calibration/` ([described here](../fixtures/calibration/README.md)) and compares Jev's answers with the labels. From `backend/`:

```bash
TYPESAFE_API_KEY=... uv run python -m app.cli calibrate --mode live --split dev --texts-dir ../frontend/public/gallery --fixtures ../fixtures/calibration --out ../docs/calibration
```

The report goes to stdout and to `<out>/<date>-<question set>-<split>.md` (no split suffix for `--split all`). Reports stay out of the repository: `docs/calibration/` is ignored by git. `--rows-out rows.csv` also writes every scored row, without passage text, for a spreadsheet.

Tune on `dev`, report on `test`. Adjust thresholds and wording against the dev split only, then run `--split test` once for the number you quote. A threshold read off the test split no longer tells you how well it generalizes.

## Read a calibration report

**Axes.** For each axis: the Spearman correlation between labels and scores with a 95% bootstrap interval, the mean absolute error, and a 5×5 table of reference level against predicted level.

**Events.** For each event type: precision, recall and F1 at thresholds from 0.50 to 0.90, with the current strong threshold marked and a line giving the best F1 at precision ≥ 0.8. To set a type's value in `EVENT_STRONG` (`backend/app/config.py`), take that line from the dev report; when several thresholds tie, take the middle of the plateau. Keep the type's `EVENT_FAINT` value a step or two below. The report never changes `config.py`.

**Drivers.** For each peak one chunk of the passage is picked (consecutive paragraphs, at least 80 words) as what drives the axis. A pick is a hit when the chunk holds one of the row's accepted paragraphs. For each gate from 0.5 to 0.9 the table gives coverage (the share of rows at or above the gate), hit rate and precision among the rows shown. The site shows a driver at `DRIVER_CONFIDENCE`, 0.6, in `backend/app/core/jev/scorer.py`.
