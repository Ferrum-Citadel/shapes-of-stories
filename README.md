<h1 align="center">Shapes of Stories</h1>

<p align="center"><strong>The emotional arc of a story, drawn from its text.</strong></p>

<p align="center">
  <a href="https://github.com/Ferrum-Citadel/shapes-of-stories/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Ferrum-Citadel/shapes-of-stories/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/Ferrum-Citadel/shapes-of-stories"><img alt="OpenSSF Scorecard" src="https://api.scorecard.dev/projects/github.com/Ferrum-Citadel/shapes-of-stories/badge"></a>
  <a href="https://codecov.io/gh/Ferrum-Citadel/shapes-of-stories"><img alt="codecov" src="https://codecov.io/gh/Ferrum-Citadel/shapes-of-stories/graph/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/hero-dark.png">
  <img alt="A chart of Great Expectations over the length of the book: the fortune curve with its named shape, the event beads under it, and the ten layers to switch between." src="docs/images/hero.png" width="100%">
</picture>

Hand it a novel, a screenplay or a transcript. It reads the whole thing about 800 words at a time and asks of every passage what a thoughtful reader would: how are things going for these people right now? Back come ten curves (fortune, tension, mystery, humor, warmth, romance, wonder, dread, sorrow and pace), the events marked along the way (a death, a reveal, a reconciliation), and, when the fortune curve clearly matches one of the classic shapes, its name. _The Great Gatsby_ turns out to be a plateau and a fall. The chart says so.

- **Click any point** and read the passage behind it.
- **Switch between the ten layers**, or put two works side by side.
- **Wander the gallery**: fifty public-domain works, from _A Midsummer Night's Dream_ to _The Count of Monte Cristo_, scored and waiting.
- **Keep an analysis**, share it by link, or save it as a poster.

The gallery is free to browse. Your own texts need your own [TypeSafe](https://typesafe.ai) key.

## Why I built it

Kurt Vonnegut drew story shapes on a blackboard. Decades later, researchers found a handful of recurring arcs across thousands of novels by tracking the sentiment of the words. I love both, and both bothered me a little: a sad word in a happy scene is still a sad word. I wanted the other reading, the one a person does. Not "how do these words feel" but "how are things going for the characters", passage by passage.

What made it possible is Jev, TypeSafe's model. Jev is not a chatbot. You ask it small, typed questions about a piece of text (pick one option, give a probability, place this on a described scale) and it answers with numbers, fast and for pennies. A novel read in 800-word slices turned out to be a wonderful stress test: hundreds of judgments that have to agree with each other, with a reference reading, and with themselves when you run them again.

## How it works

1. **Prepare.** Front and back matter go. Chapters come from the text's own headings. Passages are packed at paragraph breaks and never cross a chapter start; a paragraph too long for one passage is cut at a sentence end, and a chapter too short to stand alone joins its neighbor.
2. **Ask.** Every passage gets the same twenty questions: ten scales of 0 to 4 where each level describes a situation, not a degree ("a burst of action or a run of quick turns takes up part of the passage"), nine yes/no event questions, and one about the writing mode. The first passage also says what kind of text this is, and one more question per quality peak picks the paragraph that drives it.
3. **Draw.** Scores land on a 100-point timeline and are smoothed with a Whittaker–Henderson filter, so trends show without invented bumps. The fortune curve is matched against six templates: Rags to Riches, Tragedy, Man in a Hole, Icarus, Cinderella and Oedipus. A shape is named only when the fit is clear. Otherwise the chart says so, and that is an honest answer too.

The gallery and your upload run through the very same code, and every tuned value, every question text and every stored gallery file is pinned to the code by a test.

## What I learned about Jev

Measured on my calibration runs: a few hundred passages from Project Gutenberg texts, labeled by Anthropic's Claude models (Fable 5.1, and Opus 5.5 for the whole pace and wonder passages), then scored by Jev and compared. Nobody checked the labels row by row, so the figures below are agreement with Claude's reading, not with human readers; here is [how the labels were made](fixtures/calibration/README.md#how-the-rows-are-made).

- **Describe situations, not degrees.** Jev judges each level of a scale on its own and reads literally. "Breathless: action or rapid turns run through almost the whole passage" works; "very fast" does not. Rewording pace this way took its agreement with the labels on whole passages from a saturated top end to a Spearman correlation of 0.97.
- **Length matters.** On short labeled excerpts, agreement runs from 0.8 to 0.95 (Spearman) across the ten qualities; on whole passages of 600 to 1,300 words, where pace and wonder were also labeled, both reach 0.97. Under about 280 words agreement collapses, so a full-length text is never cut into passages shorter than 250 words.
- **It is steady.** Scoring the same works twice moves a curve point by about 0.03 on a 0 to 4 scale. Works can be compared with each other.
- **Fortune is not sentiment.** Where the named shape disagreed with the shape expected for the book (taken from Reagan et al.'s published arcs, or written by Claude from the plot before the work was scored), the curve was usually right about where in the book a turn falls, and the expectation wrong.
- **It is cheap.** The whole gallery, 5.2 million words, costs about $1.20 to score. Less than the coffee.

## Caveats

- Scores are a model's reading, calibrated against a few hundred passages labeled by Claude, not by people. They are consistent and defensible, not ground truth.
- Shapes are named from the fortune curve only, and only when the fit is clear. Many fine books have no clear shape, and the chart says so rather than forcing one.
- The gallery is English, and the question texts were tuned on English prose and plays.
- Texts under about 8,000 words are cut into smaller passages so a curve has enough points; the scores are less certain there.

## Run it

```bash
cp .env.example .env   # SERVER_SECRET: 32 random bytes, base64. JEV_MODE=live
docker compose up
```

Open http://localhost:8000. One image serves the frontend and the API together. Visitors bring their own TypeSafe key in the browser; the server never holds one. Rebuilding the gallery is a separate command with its own key, see [docs/gallery.md](docs/gallery.md). Behind a reverse proxy or tunnel, set `FORWARDED_ALLOW_IPS` in `.env` to the Compose network's subnet so the per-address upload limit counts visitors rather than the proxy; behind Cloudflare, set `CLIENT_IP_HEADER=CF-Connecting-IP` instead.

<details>
<summary><strong>Develop</strong></summary>

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

</details>

## Privacy

Your text and key are held encrypted only while the analysis runs. The key is deleted the moment the run ends; so is the text, unless a run failed, in which case it is kept for up to a day so you can resume. Results are deleted an hour after the run ends unless you keep them, and nothing kept includes the text. A share link shows the curves, events and chapter titles to anyone who has it, never the text or the key.

## Credits and license

Sources, fonts, dependencies and the research behind the shapes are listed in [CREDITS.md](CREDITS.md). MIT license, see [LICENSE](LICENSE). Built with [Claude Code](https://claude.com/claude-code).
