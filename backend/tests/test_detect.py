import io
import zipfile

import pytest

from app.core.errors import IngestError
from app.core.ingest import detect_format


def zip_with(names: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for n, b in names.items():
            z.writestr(n, b)
    return buf.getvalue()


def test_detects_by_content_and_extension():
    assert detect_format("a.txt", b"Hello") == "txt"
    assert detect_format("a.md", b"# Hi") == "markdown"
    assert detect_format(None, b"WEBVTT\n\n00:00.000 --> 00:01.000\nhi") == "vtt"
    assert detect_format(None, b"1\n00:00:00,000 --> 00:00:01,000\nhi\n") == "srt"
    assert detect_format("x.fountain", b"INT. HOUSE - DAY\n\nAction.") == "fountain"
    assert detect_format(None, b"Title: X\n\nINT. HOUSE - DAY\n\nAction.") == "fountain"
    assert detect_format(None, zip_with({"mimetype": b"application/epub+zip"})) == "epub"
    assert detect_format(None, zip_with({"word/document.xml": b"<w/>"})) == "docx"


def test_unknown_binary_is_unsupported():
    with pytest.raises(IngestError) as e:
        detect_format("a.pdf", b"%PDF-1.4 ...")
    assert e.value.code == "unsupported_format"


def test_scene_heading_without_title_page_is_txt():
    assert (
        detect_format(None, b"He walked in.\n\nINT. HOUSE - DAY\n\nMore.")
        == "txt"
    )


def test_bad_zip_is_corrupt():
    with pytest.raises(IngestError) as e:
        detect_format("a.docx", b"PK\x03\x04garbage-not-a-zip")
    assert e.value.code == "corrupt_file"


def test_zip_unsupported_feature_is_corrupt():
    # A well-formed zip whose central-directory "version needed to extract" byte is
    # patched past zipfile.MAX_EXTRACT_VERSION (63): zipfile.ZipFile(...).namelist()
    # raises NotImplementedError("zip file version ...") while reading the central
    # directory, before any entry is opened or decompressed.
    data = bytearray(zip_with({"a.txt": b"hello world"}))
    cd = data.find(b"PK\x01\x02")
    data[cd + 6] = 99
    with pytest.raises(IngestError) as e:
        detect_format("a.docx", bytes(data))
    assert e.value.code == "corrupt_file"
