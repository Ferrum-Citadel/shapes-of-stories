# Shapes of Stories

**The emotional arc of a story, drawn from its text.**

[![CI](https://github.com/Ferrum-Citadel/shapes-of-stories/actions/workflows/ci.yml/badge.svg)](https://github.com/Ferrum-Citadel/shapes-of-stories/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Ferrum-Citadel/shapes-of-stories/badge)](https://scorecard.dev/viewer/?uri=github.com/Ferrum-Citadel/shapes-of-stories)
[![codecov](https://codecov.io/gh/Ferrum-Citadel/shapes-of-stories/graph/badge.svg)](https://codecov.io/gh/Ferrum-Citadel/shapes-of-stories)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/hero-dark.png">
  <img alt="A chart of Great Expectations over the length of the book: the fortune curve with its named shape, the event beads under it, and the ten layers to switch between." src="docs/images/hero.png" width="100%">
</picture>

Give it a novel, a screenplay or a transcript. It reads the whole thing in passages of about 800 words and scores each on ten qualities: fortune, tension, mystery, humor, warmth, romance, wonder, dread, sorrow and pace. It marks the events (a death, a reveal, a reconciliation) and names the shape of the fortune curve when it clearly has one: tragedy, rags to riches, man in a hole, and the other classics. Click any point to see the passage behind it. Compare two works, share a kept analysis by link, or save a poster of it.

The gallery holds fifty public-domain works, from _A Midsummer Night's Dream_ to _The Count of Monte Cristo_, scored and ready to browse. Your own text needs your own key.

## Why it exists

Kurt Vonnegut drew story shapes on a blackboard; researchers later found a handful of recurring arcs across thousands of novels by tracking word sentiment. Both approaches measure the mood of the words. This project asks a different question: how are things _going for the characters_, passage by passage, as a careful reader would judge it.

It began as a way to find out what [TypeSafe's Jev](https://typesafe.ai) can do. Jev is not a chatbot. It answers small, typed questions about a piece of text (pick one option, give a probability, place this on a described scale), fast and cheaply, and returns numbers rather than prose. A story, read a passage at a time, turned out to be a good test: hundreds of judgments that have to agree with each other, with a reference reading, and with themselves on a second run.

## How it works

1. **Prepare.** The text is cleaned of front and back matter, cut into chapters from its own headings, and packed into passages at paragraph breaks that never cross a chapter start (a paragraph too long for one passage is cut at a sentence end); a chapter too short to stand alone joins its neighbor.
2. **Ask.** Each passage goes to Jev with the same twenty questions: ten scales of 0–4 where every level is described as a situation ("a burst of action or a run of quick turns takes up part of the passage"), nine yes/no event questions, and one about the writing mode; the first passage also answers what kind of text this is. One more question per quality peak picks the paragraph that drives it.
3. **Draw.** Scores are placed on a 100-point timeline, smoothed with a Whittaker–Henderson filter so trends show without invented bumps, and the fortune curve is compared with six shape templates. A shape is named only when the fit is clear; otherwise the chart says so.

The same code scores the gallery and a visitor's upload. Every value that shapes a score or a curve, every question text and every stored gallery file is pinned to the code by tests.

## What I learned about Jev

Measured on my calibration runs: a few hundred passages from the Project Gutenberg texts, labeled by Anthropic's Claude models (Fable 5.1, and Opus 5.5 for the whole pace and wonder passages), then scored by Jev and compared. No person checked the labels row by row, so the figures below are agreement with Claude's reading, not with human readers; [how the labels were made](fixtures/calibration/README.md#how-the-rows-are-made).

- **Describe situations, not degrees.** Jev judges each level of a scale on its own and reads literally. "Breathless: action or rapid turns run through almost the whole passage" works; "very fast" does not. Rewording pace this way took its agreement with the labels on whole passages from a saturated top end to a Spearman correlation of 0.97.
- **Length matters.** On short labeled excerpts, agreement with the labels runs from 0.8 to 0.95 (Spearman) across the ten qualities; on whole passages of 600 to 1,300 words, where pace and wonder were also labeled, both reach 0.97. Under about 280 words agreement collapses, so a full-length text is never cut into passages shorter than 250 words.
- **It is steady.** Scoring the same works twice moves a curve point by about 0.03 on a 0–4 scale. Works can be compared with each other.
- **Fortune is not sentiment.** Where the named shape disagreed with the shape expected for the book (taken from Reagan et al.'s published arcs, or written by Claude from the plot before the work was scored), the curve was usually right about where in the book a turn falls, and the expectation wrong. _The Great Gatsby_ is a plateau and a fall, not a rise and fall.
- **It is cheap.** The whole fifty-work gallery, 5.2 million words, costs about $1.20 to score.

## Caveats

- Scores are a model's reading, calibrated against a few hundred passages labeled by Claude, not by people. They are consistent and defensible, not ground truth.
- Shapes are named from the fortune curve only, and only when the fit is clear. Many fine books have no clear shape, and the chart says so rather than forcing one.
- The gallery is English, and the question texts were tuned on English prose and plays.
- Texts under about 8,000 words are cut into smaller passages so a curve has enough points; the scores are less certain there.

## Run it

```bash
cp .env.example .env     # set SERVER_SECRET to 32 random bytes, base64, and JEV_MODE=live
docker compose up
```

Open http://localhost:8000. The image serves the frontend and the API together. Visitors supply their own TypeSafe key in the browser; the server holds none. Rebuilding the gallery is a separate command with its own key, see [docs/gallery.md](docs/gallery.md). Behind a reverse proxy or tunnel, set `FORWARDED_ALLOW_IPS` in `.env` to the Compose network's subnet so the per-address upload limit counts visitors rather than the proxy.

## Develop

You need [uv](https://docs.astral.sh/uv/), Node 24 and Docker. uv installs the Python pinned in `backend/.python-version`, and `nvm install` reads `frontend/.nvmrc`.

```bash
cd backend && uv python install && uv sync
cd ../frontend && nvm install && npm ci
docker run -d --name sos-pg -p 5433:5432 -e POSTGRES_PASSWORD=sos postgres:18
docker exec sos-pg createdb -U postgres sos_test   # once pg_isready answers
uvx pre-commit install --hook-type pre-commit --hook-type commit-msg
```

`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` runs both halves with reload, the frontend at http://localhost:5173; set `JEV_MODE=synthetic` in `.env` so nothing calls TypeSafe while you work. The gates CI runs, from `backend/` and from `frontend/`:

```bash
TEST_DATABASE_URL=postgresql://postgres:sos@localhost:5433/sos_test uv run pytest -q && uv run ruff check . && uv run ruff format --check .
npm test && npm run lint && npm run format:check && npm run build
```

The tests empty every table in the database they are given, so point them only at `sos_test`. The pre-commit hooks run the same linters before each commit and check the message against Conventional Commits. Building the gallery, changing the questions and running a calibration are in [docs/gallery.md](docs/gallery.md).

## Privacy

A visitor's text and key are held encrypted only while the analysis runs. The key is deleted the moment the run ends; the text is deleted too, or kept for up to a day after a failure so the run can be resumed. Results are deleted an hour after the run ends unless kept, and nothing kept includes the text. A share link shows the curves, events and chapter titles to anyone who has it, never the text or the key.

## Credits and license

Sources, fonts, dependencies and the research behind the shapes are listed in [CREDITS.md](CREDITS.md). MIT license, see [LICENSE](LICENSE). Built with [Claude Code](https://claude.com/claude-code).
