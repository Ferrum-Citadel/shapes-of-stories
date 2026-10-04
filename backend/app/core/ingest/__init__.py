import io
import re
import zipfile
from collections.abc import Callable

from app import config
from app.core.errors import IngestError
from app.core.ingest.model import Cue, Format, Heading, Parsed, Stripped  # re-export

__all__ = ["Cue", "Format", "Heading", "Parsed", "Stripped", "detect_format", "parse"]

_SRT = re.compile(rb"^\s*\d+\s*\n\d\d:\d\d:\d\d,\d{3} --> ")
_FOUNTAIN_SCENE = re.compile(rb"(?im)^(INT|EXT|EST|INT\./EXT|INT/EXT|I/E)[. ]")
_TITLE_PAGE = re.compile(rb"^[A-Za-z][A-Za-z ]*:[ \t]")


def detect_format(filename: str | None, data: bytes) -> Format:
    ext = (
        filename.rsplit(".", 1)[-1].lower()
        if filename and "." in filename
        else ""
    )
    if data[:2] == b"PK":
        try:
            names = set(zipfile.ZipFile(io.BytesIO(data)).namelist())
        except Exception:
            raise IngestError("corrupt_file", reason="bad zip") from None
        if "mimetype" in names or "META-INF/container.xml" in names or ext == "epub":
            return "epub"
        if "word/document.xml" in names or ext == "docx":
            return "docx"
        raise IngestError("unsupported_format", extension=ext or "zip")
    head = data[:4096]
    if head.lstrip().startswith(b"WEBVTT") or ext == "vtt":
        return "vtt"
    if _SRT.match(head) or ext == "srt":
        return "srt"
    if ext == "fountain":
        return "fountain"
    if (
        ext in ("", "txt")
        and _TITLE_PAGE.match(head.lstrip())
        and _FOUNTAIN_SCENE.search(head)
    ):
        return "fountain"
    if ext in ("md", "markdown"):
        return "markdown"
    if ext in ("", "txt", "text"):
        is_utf16 = head[:2] in (b"\xff\xfe", b"\xfe\xff")
        if not is_utf16 and (b"\x00" in head or (ext == "" and _looks_binary(head))):
            raise IngestError("unsupported_format", extension=ext or "binary")
        return "txt"
    raise IngestError("unsupported_format", extension=ext)


def _looks_binary(head: bytes) -> bool:
    if head.startswith(b"%PDF"):
        return True
    printable = sum(
        1
        for b in head
        if 32 <= b < 127 or b in (9, 10, 13) or b >= 128
    )
    return printable / max(1, len(head)) < 0.9


def check_zip(data: bytes) -> None:
    """Reject an archive whose declared entry sizes (individually or summed) exceed the
    upload cap, before any entry is inflated."""
    z = zipfile.ZipFile(io.BytesIO(data))
    total = 0
    for info in z.infolist():
        if info.file_size > config.UPLOAD_CAP_BYTES:
            raise IngestError("over_upload_cap", bytes=info.file_size, cap=config.UPLOAD_CAP_BYTES)
        total += info.file_size
    if total > config.UPLOAD_CAP_BYTES:
        raise IngestError("over_upload_cap", bytes=total, cap=config.UPLOAD_CAP_BYTES)


def read_capped(z: zipfile.ZipFile, name: str) -> bytes:
    info = z.getinfo(name)
    if info.file_size > config.UPLOAD_CAP_BYTES:
        raise IngestError("over_upload_cap", bytes=info.file_size, cap=config.UPLOAD_CAP_BYTES)
    with z.open(name) as f:
        data = f.read(config.UPLOAD_CAP_BYTES + 1)
    if len(data) > config.UPLOAD_CAP_BYTES:
        raise IngestError("over_upload_cap", bytes=len(data), cap=config.UPLOAD_CAP_BYTES)
    return data


def parse(data: bytes, filename: str | None = None) -> Parsed:
    fmt = detect_format(filename, data)
    parsed = _PARSERS[fmt](data)
    if not parsed.text.strip():
        raise IngestError("empty_text")
    return parsed


from app.core.ingest.docx import parse_docx  # noqa: E402
from app.core.ingest.epub import parse_epub  # noqa: E402
from app.core.ingest.fountain import parse_fountain  # noqa: E402
from app.core.ingest.subtitles import parse_srt, parse_vtt  # noqa: E402
from app.core.ingest.txt import parse_markdown, parse_txt  # noqa: E402

_PARSERS: dict[str, Callable[[bytes], Parsed]] = {
    "txt": parse_txt, "markdown": parse_markdown, "docx": parse_docx, "epub": parse_epub,
    "fountain": parse_fountain, "srt": parse_srt, "vtt": parse_vtt,
}
