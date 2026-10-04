# Shapes of Stories: notes for coding agents

Facts an agent cannot infer from the code. Setup and the contribution flow are in CONTRIBUTING.md; the gallery build and calibration are in docs/gallery.md.

## Layout

- `backend/`: FastAPI service, worker and CLI (`python -m app.cli`), Python managed with uv (`backend/.venv`). The analysis lives in `backend/app/core/`: `ingest/` (file formats, headings, front and back matter), `structure.py` (chapters and passages), `jev/` (the questions and the model client), `curves/` (binning, smoothing, events, shape).
- `frontend/`: React 19, Vite, TypeScript, Tailwind 4. `frontend/public/gallery/` holds the built gallery data and is never edited by hand; `frontend/public/questions.json` is generated.
- `gallery/list.toml`: the gallery works with the sections and chapters each must cut into. `fixtures/calibration/`: labelled spans that `calibrate` scores.

## Commands

- Backend: `cd backend && uv sync`; `TEST_DATABASE_URL=postgresql://postgres:sos@localhost:5433/sos_test uv run pytest -q` (the database tests skip without the variable, and CI fails on any skip); `uv run ruff check .`.
- Frontend: Node 24 (`frontend/.nvmrc`); `npm ci`, `npm test`, `npm run lint`, `npm run format:check`, `npm run build`. `npm run e2e` starts its own frontend on 5190 and needs a backend started with `JEV_MODE=synthetic` on 8001; never run it against a backend in live mode.
- `JEV_MODE=live` sends passages to TypeSafe and costs money (about $0.21 per million words; the 50-work gallery is about $1.20). Synthetic mode is free and deterministic; use it for everything except a deliberate paid run, and say the cost before starting one.
- Gallery data comes only from `python -m app.cli gallery-build`; `gallery-recurve` re-derives it offline from the stored per-passage answers. Tests pin the stored files to the code: a change that moves passages or scoring settings needs a rebuild, a change to derived settings needs a recurve.
- `python -m app.cli questions-json` regenerates `frontend/public/questions.json`; a backend test checks it byte for byte.

## Conventions

- Conventional Commits, `type(scope): summary`, scopes `core`, `jev`, `curves`, `server`, `web`, `ops`, `gallery`, `docs`, `calibration`. A commit made with an AI coding assistant carries the trailer `Assisted-by: <assistant>`.
- Comments give the reason in one sentence or are absent. No vendor or model names other than TypeSafe and Jev in code, tests or docs (the README's attribution line is the one exception). Docs describe readings and readers, never who or what did a reading.
- Prettier `printWidth` 100 and ruff `line-length` 100.
- The gallery build and a reader's upload run the same `analyze_work`; tests compare the two paths. A change made for one must hold for the other.
- A reader's text and key exist only in the in-flight job row and are deleted on completion. Never log passage text or keys, and never add storage for them.

## Gotchas

- Passages never cross a chapter start; a chapter or scene group under 250 words merges into a neighbour; a paragraph longer than a passage is cut at sentence ends, so a passage may start or end inside a paragraph. The backend (`text.passage_paragraph_spans`) and the frontend (`lib/text.ts`, `paragraphsOf`) count a passage's paragraphs by the same rule; driver quotes depend on it.
- Heading rules in `backend/app/core/ingest/` are guarded by `tests/test_upload_headings.py`: a new rule must not turn dialogue, lists, letter signatures or shouted lines in a manuscript into chapters. Front and back matter rules that cut text must report what they cut in the preview.
- Jev judges each level of a Score question on its own and reads literally: level texts describe situations, not degrees, and the question set version changes whenever a question text changes.
