**What and why** (link the issue if there is one):

**How you tested it**:

- [ ] Backend gates: `uv run pytest -q` with `TEST_DATABASE_URL` set, `uv run ruff check .`
- [ ] Frontend gates: `npm test`, `npm run lint`, `npm run format:check`, `npm run build`
- [ ] `docker build -t sos:ci .`, if the Dockerfile or a dependency changed
- [ ] `npm run e2e`, if a flow it covers changed
