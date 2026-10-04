import logging

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.errors import IngestError

log = logging.getLogger("sos")

_INGEST_STATUS = {
    "over_upload_cap": 413,
    "over_word_cap": 413,
    "unsupported_format": 415,
    "drm_protected": 415,
    "not_english": 422,
    "empty_text": 400,
    "corrupt_file": 400,
}


class ApiError(Exception):
    def __init__(self, status: int, code: str, **detail):
        super().__init__(code)
        self.status, self.code, self.detail = status, code, detail


async def api_error_handler(request: Request, exc: ApiError):
    return JSONResponse({"error": exc.code, "detail": exc.detail}, status_code=exc.status)


async def ingest_error_handler(request: Request, exc: IngestError):
    return JSONResponse(
        {"error": exc.code, "detail": exc.detail},
        status_code=_INGEST_STATUS.get(exc.code, 400),
    )


async def validation_error_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        {"error": "bad_request", "detail": {"errors": jsonable_encoder(exc.errors())}},
        status_code=422,
    )


async def unhandled_error_handler(request: Request, exc: Exception):
    log.exception("unhandled error")
    return JSONResponse({"error": "internal", "detail": {}}, status_code=500)
