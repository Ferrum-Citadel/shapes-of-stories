# Contributing

Shapes of Stories has a FastAPI backend in `backend/` and a React frontend in `frontend/`. Building the gallery, changing the questions and running a calibration are in [docs/gallery.md](docs/gallery.md).

## Set up

You need [uv](https://docs.astral.sh/uv/), Node 24 and Docker. uv installs the Python version pinned in `backend/.python-version`, and `nvm install` reads `frontend/.nvmrc`.

```bash
cd backend && uv python install && uv sync
cd ../frontend && nvm install && npm ci
```

Start Postgres 18 on port 5433 and create a database for the tests:

```bash
docker run -d --name sos-pg -p 5433:5432 -e POSTGRES_PASSWORD=sos postgres:18
until docker exec sos-pg pg_isready -U postgres; do sleep 1; done
docker exec sos-pg createdb -U postgres sos_test
```

The tests empty every table in the database they are given, so point them only at `sos_test`.

## Run the app

Start the backend from `backend/` and the frontend from `frontend/`, each in its own shell. The app is at <http://localhost:5173> and sends API calls to the backend on port 8000.

```bash
DATABASE_URL=postgresql://postgres:sos@localhost:5433/postgres SERVER_SECRET=dev JEV_MODE=synthetic CORS_ORIGINS=http://localhost:5173 uv run python -m app
npm run dev
```

`JEV_MODE=synthetic` scores with a deterministic offline stub, so nothing calls TypeSafe or costs money. To run both halves in Docker instead, reloading as you edit:

```bash
cp .env.example .env   # set SERVER_SECRET, and JEV_MODE=synthetic
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

## Gates

CI runs these on every pull request. Backend, from `backend/` (without `TEST_DATABASE_URL` the database tests are skipped, and CI fails on a skipped test):

```bash
TEST_DATABASE_URL=postgresql://postgres:sos@localhost:5433/sos_test uv run pytest -q
uv run ruff check .
```

Frontend, from `frontend/`:

```bash
npm test && npm run lint && npm run format:check && npm run build
```

When a change touches the Dockerfile or a dependency, also run `docker build -t sos:ci .` from the repository root. The end-to-end suite runs in Chromium against its own frontend on port 5190, which Playwright starts; start the synthetic backend above with `PORT=8001` and `CORS_ORIGINS=http://localhost:5190`. Run it from `frontend/` when a change touches a flow it covers:

```bash
npx playwright install chromium
npm run e2e
```

## Propose a change

Open an issue first for anything larger than a small fix, so the approach is agreed before the work starts. Branch from `main`, run the gates, and open a pull request against `main` with the template filled in. A change to a tuned value, a question or a fixture says what evidence supports it, usually a calibration report.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`, where the subject states what is true after the change ("fix(server): tickets stay out of the access log"). The types are `feat`, `fix`, `refactor`, `perf`, `style`, `test`, `docs`, `build`, `chore` and `ci`; `style` is for formatting alone, and a visual change is a `feat` or a `fix`. Leave the scope out when a change spans several.

| Scope | Covers |
| --- | --- |
| `core` | text preparation and structure |
| `jev` | the questions and scoring |
| `curves` | smoothing, shapes and events |
| `server` | the API, jobs and storage |
| `web` | the frontend |
| `ops` | Docker, CI and deployment |
| `gallery` | the gallery list, build and data |
| `calibration` | the fixtures |
| `docs` | documentation |

A commit made with an AI coding assistant carries an `Assisted-by:` trailer naming the tool.
