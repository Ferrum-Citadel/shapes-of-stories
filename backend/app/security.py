import hashlib
import logging
import os
import re
import secrets
import zlib

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

REDACTED = "[redacted]"
_KEY_RE = re.compile(r"sk-[A-Za-z0-9_\-]{8,}")


def new_token() -> str:
    return secrets.token_urlsafe(16)


class Crypto:
    def __init__(self, secret: str):
        self._aes = AESGCM(hashlib.sha256(secret.encode()).digest())

    def encrypt(self, data: bytes) -> tuple[bytes, bytes]:
        nonce = os.urandom(12)
        return self._aes.encrypt(nonce, data, None), nonce

    def decrypt(self, ct: bytes, nonce: bytes) -> bytes:
        return self._aes.decrypt(nonce, ct, None)


def compress(text: str) -> bytes:
    return zlib.compress(text.encode("utf-8"), 6)


def decompress(b: bytes) -> str:
    return zlib.decompress(b).decode("utf-8")


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        clean = _KEY_RE.sub(REDACTED, msg)
        if clean != msg:
            record.msg, record.args = clean, None
        return True


def install_redaction() -> None:
    # Logger filters miss records propagated from child loggers, so redact at record creation.
    factory = logging.getLogRecordFactory()
    if getattr(factory, "_sos_redacts", False):
        return
    redact = RedactingFilter()

    def _factory(*args: object, **kwargs: object) -> logging.LogRecord:
        record = factory(*args, **kwargs)
        redact.filter(record)
        return record

    _factory._sos_redacts = True
    logging.setLogRecordFactory(_factory)


_EVENTS_QUERY = re.compile(r"^(/api/works/[^/?]+/events)\?.*$")


class AccessScrub(logging.Filter):
    # An event stream's query carries the ticket that opens it, so the access line drops it.
    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) > 2 and isinstance(args[2], str):
            path = _EVENTS_QUERY.sub(r"\1", args[2])
            if path != args[2]:
                record.args = (*args[:2], path, *args[3:])
        return True


_SCRUB = AccessScrub()


def install_access_scrub() -> None:
    logging.getLogger("uvicorn.access").addFilter(_SCRUB)
