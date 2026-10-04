"""Single-process app: API + worker + sweeper. Run with exactly one uvicorn worker."""

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import events, health, key, preview, session, share, works
from app.api.errors import (
    ApiError,
    IngestError,
    api_error_handler,
    ingest_error_handler,
    unhandled_error_handler,
    validation_error_handler,
)
from app.db import make_pool, run_migrations
from app.pubsub import PubSub
from app.security import Crypto, install_access_scrub, install_redaction
from app.settings import Settings
from app.sweeper import sweep_loop
from app.worker import Worker


class NosniffStaticFiles(StaticFiles):
    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response


def create_app(settings: Settings, *, start_worker: bool = True) -> FastAPI:
    install_redaction()
    install_access_scrub()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        app.state.crypto = Crypto(settings.server_secret)
        app.state.pubsub = PubSub()
        app.state.pool = make_pool(settings.database_url)
        await app.state.pool.open()
        tasks: list[asyncio.Task] = []
        try:
            await run_migrations(app.state.pool)
            app.state.worker = Worker(app)
            if start_worker:
                tasks.append(asyncio.create_task(app.state.worker.run(), name="worker"))
                tasks.append(asyncio.create_task(sweep_loop(app), name="sweeper"))
            yield
        finally:
            for t in tasks:
                t.cancel()
            worker = getattr(app.state, "worker", None)
            job_tasks = list(worker.running.values()) if worker else []
            for t in job_tasks:
                t.cancel()
            await asyncio.gather(*tasks, *job_tasks, return_exceptions=True)
            await app.state.pool.close()

    app = FastAPI(
        title="Shapes of Stories",
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(GZipMiddleware, minimum_size=2048)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=False,
        max_age=600,
    )
    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(IngestError, ingest_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
    app.include_router(health.router)
    app.include_router(key.router)
    app.include_router(preview.router)
    app.include_router(session.router)
    app.include_router(works.router)
    app.include_router(share.router)
    app.include_router(events.router)

    if settings.static_dir and Path(settings.static_dir).is_dir():
        static = Path(settings.static_dir).resolve()
        app.mount("/assets", NosniffStaticFiles(directory=static / "assets"), name="assets")
        index = static / "index.html"
        # Same values as frontend/public/_headers.
        index_headers = {
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
            "Content-Security-Policy": (
                "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; "
                "font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; "
                "frame-ancestors 'none'; base-uri 'self'"
            ),
        }

        @app.get("/{path:path}", include_in_schema=False)
        async def spa(path: str):
            if path.startswith("api/"):
                raise ApiError(404, "not_found")
            candidate = (static / path).resolve()
            # samefile, not ==, so /INDEX.HTML on a case-insensitive file system matches too.
            if candidate.is_file() and index.is_file() and candidate.samefile(index):
                return FileResponse(index, headers=index_headers)
            # resolve() also follows symlinks, so anything outside static_dir is rejected.
            if path and candidate.is_relative_to(static) and candidate.is_file():
                headers = {"X-Content-Type-Options": "nosniff"}
                if path.startswith("gallery/"):
                    # Matches frontend/public/_headers, so readers see a rebuilt gallery at once.
                    headers["Cache-Control"] = "public, max-age=0, must-revalidate"
                return FileResponse(candidate, headers=headers)
            return FileResponse(index, headers=index_headers)

    return app


def app_from_env() -> FastAPI:
    return create_app(Settings.from_env())
