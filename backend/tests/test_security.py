import logging

from app.security import (
    Crypto,
    RedactingFilter,
    compress,
    decompress,
    install_redaction,
    new_token,
)


def test_token_and_crypto_roundtrip():
    assert len(new_token()) == 22 and new_token() != new_token()
    c = Crypto("dev-secret")
    ct, nonce = c.encrypt(b"hello")
    assert ct != b"hello" and c.decrypt(ct, nonce) == b"hello"
    assert Crypto("other").encrypt(b"hello")[0] != ct
    text = "War and peace " * 10000
    assert decompress(compress(text)) == text and len(compress(text)) < len(text.encode()) / 5


def test_redaction_filter():
    rec = logging.LogRecord(
        "x",
        logging.INFO,
        "",
        0,
        "key sk-abcdefghijklmnop used; X-Jev-Key: sk-zzzzzzzzzzzz",
        None,
        None,
    )
    RedactingFilter().filter(rec)
    assert "sk-" not in rec.getMessage() and rec.getMessage().count("[redacted]") == 2

    # filters on ancestor loggers don't apply to records propagated
    # from a descendant logger (e.g. "sos.worker"), so redaction must survive
    # even when seen by a handler on the parent "sos" logger.
    install_redaction()
    records: list[str] = []

    class _Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record.getMessage())

    handler = _Capture()
    sos_logger = logging.getLogger("sos")
    sos_logger.setLevel(logging.INFO)
    sos_logger.addHandler(handler)
    try:
        logging.getLogger("sos.worker").info("key sk-abcdefghijklmnop")
    finally:
        sos_logger.removeHandler(handler)
    assert records and "sk-" not in records[0]
