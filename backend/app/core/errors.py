class IngestError(Exception):
    """Typed, user-facing ingest failure. `code` is stable API vocabulary."""

    def __init__(self, code: str, **detail):
        super().__init__(code)
        self.code = code
        self.detail = detail
