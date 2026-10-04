# Calibration fixtures

`python -m app.cli calibrate` scores these labelled spans and compares Jev's answers with the labels; [docs/gallery.md](../../docs/gallery.md) explains how to run it and read the report. The `.sample.csv` files are small schema examples for the tests, not calibration data.

| File | Rows | One row is |
| --- | --- | --- |
| `passages.csv` | 341 | a span scored on one axis, labelled with a level from 0 to 4 |
| `events.csv` | 106 | a passage flagged 0 or 1 for each of the nine event types |
| `drivers.csv` | 114 | a passage and an axis, labelled with the paragraph that drives it |

Every file starts with `work_slug,start_cp,end_cp`: the work and the span's code-point offsets in `frontend/public/gallery/<work_slug>.txt`. Every file ends with `split`, `dev` or `test`; an empty value counts for both. The other columns:

- `passages.csv`: `axis`, `level`, `rationale` (what happens in the span) and `source` (where it is in the book).
- `events.csv`: one column per event type, then `source`.
- `drivers.csv`: `expected_paragraph_idx`, the driving paragraph's position among the span's paragraphs from 0, and `accepted_paragraph_idxs`, that paragraph followed by up to two others that carry the axis as well, joined with `|`. A pick that lands on any of them is a hit.

## How the rows are made

Every row was labelled by Claude Fable 5.1, Anthropic's language model, while the project was built, except the whole pace and wonder passages below; no person checked the labels row by row. Claude chose each span, read it in the Project Gutenberg text against the question text in `backend/app/core/jev/questions.py` and set the label, never from the scores being calibrated. A `source` marked `(public summary)` names a plot fact that public summaries of the book state; Claude gave it from its own knowledge of the plot, without consulting a summary. The calibration figures therefore measure agreement with Claude's reading, not with human readers. Each split holds about half of every file.

`passages.csv` holds two kinds of span. 300 short windows, five to seven per level per axis, each start at the paragraph holding a well-known line and run over whole paragraphs to at least 600 code points. 41 whole passages for pace and wonder, about 800 words each, have a `source` ending in `; whole passage`; these two axes cannot be judged from a hundred words. Their levels come from two independent readings by separate Claude Opus 5.5 sessions, the second without sight of the first, and only passages both readings put at the same level are kept.

Each event and driver row is one passage as `gallery-build` cut the work when the row was made. A later change to the heading or packing rules may cut the work differently; the row stays a labelled span all the same.

The event flags read the question text literally across the whole span, with these rules for the cases that recur:

| Event | Counts | Does not count |
| --- | --- | --- |
| `reveal` | a secret, identity, twist, discovery or true purpose comes out | news of an outcome that was never hidden |
| `death` | a death happens, or is reported or discovered, in the span | a death remembered or mourned from earlier |
| `arrival_departure` | someone arrives or leaves and the scene changes because of it | an entrance that leaves the scene as it was |
| `location_change` | the setting moves, even from one room to another | a place only told about, remembered or seen from afar |
| `confrontation` | an argument, fight, threat or standoff, including any attack | |
| `reconciliation` | characters make peace, forgive, apologise or reunite | |
| `decision` | a stated resolve or a choice the story turns on | a violent act or a revelation alone |
| `betrayal` | a betrayal plotted, carried out, uncovered or reported | one recalled from long ago |
| `injury_violence` | someone is hurt or attacked on the page | violence reported from long ago |

One row is known to be wrong: `frankenstein,118963,119709,wonder,4` cites chapter 10 but lies in chapter 7.

## Adding a row

1. Run `gallery-build` (synthetic mode is enough) so `frontend/public/gallery/<work_slug>.txt` matches the current text preparation.
2. Take the offsets from that file. For an event or driver row, use a passage's `start_cp` and `end_cp` from `structure.beats` in `frontend/public/gallery/<work_slug>.json`.
3. Label the span by reading it, following the rules above, and give it a `source`. Say in the pull request whether a person or a model labelled it.
4. Put it in `dev` or `test` so the two stay balanced per axis or event type.
5. Check that it loads: `uv run python -m app.cli calibrate --mode synthetic --texts-dir ../frontend/public/gallery --fixtures ../fixtures/calibration --out /tmp/cal`, from `backend/`.

The offsets depend on the exact output of text preparation. A change to it shifts them, so every row of an affected work must be anchored again.
