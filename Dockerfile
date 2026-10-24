# Stage 1: build the SPA (same-origin API for self-hosting)
FROM node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
ENV VITE_API_BASE=""
RUN npm run build

# Stage 2: API + worker + static fallback
FROM python:3.14-slim@sha256:0514bc76712d64f8bb48adcb95b1ab0d88c69fee95d62fe4c18ee948bee9b1e1 AS app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 UV_COMPILE_BYTECODE=1
COPY --from=ghcr.io/astral-sh/uv:0.11.29@sha256:eb2843a1e56fd9e30c7276ce1a52cba86e64c7b385f5e3279a0e08e02dd058fc /uv /usr/local/bin/uv
RUN useradd -m -u 10001 sos
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev
COPY backend/app ./app
COPY --from=web /web/dist /app/static
ENV PATH="/app/.venv/bin:$PATH" STATIC_DIR=/app/static PORT=8000
USER sos
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD python -c "import os,urllib.request,sys; p=os.environ.get('PORT','8000'); sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{p}/api/health', timeout=4).status==200 else 1)"
CMD ["python", "-m", "app"]
