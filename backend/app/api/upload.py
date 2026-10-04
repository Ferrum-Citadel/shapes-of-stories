import os

from fastapi import Request

from app import config
from app.api.errors import ApiError
from app.core.errors import IngestError


async def read_upload(request: Request) -> tuple[bytes, str]:
    """Raw request body, never multipart, so no user text is ever spooled to disk. Filename
    comes from the optional X-Filename header (basename only, capped at 255 chars)."""
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > config.UPLOAD_CAP_BYTES:
        raise IngestError("over_upload_cap", bytes=int(cl), cap=config.UPLOAD_CAP_BYTES)
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > config.UPLOAD_CAP_BYTES:
            raise IngestError("over_upload_cap", bytes=size, cap=config.UPLOAD_CAP_BYTES)
        chunks.append(chunk)
    data = b"".join(chunks)
    if not data:
        raise ApiError(400, "missing_input")
    raw_name = request.headers.get("x-filename")
    filename = os.path.basename(raw_name)[:255] if raw_name else "paste.txt"
    return data, filename
