import io
import zipfile

import pytest

from app import config
from app.core.errors import IngestError
from app.core.ingest import parse
from tests.conftest import make_docx


def test_docx_paragraphs_and_heading_styles():
    data = make_docx(
        [
            ("Title", "My Draft"),
            ("Heading1", "Chapter 1"),
            (None, "First para."),
            (None, "Second para."),
            ("Heading1", "Chapter 2"),
            (None, "Third."),
        ]
    )
    p = parse(data, "d.docx")
    assert p.title == "My Draft"
    assert p.text.split("\n\n") == [
        "Chapter 1",
        "First para.",
        "Second para.",
        "Chapter 2",
        "Third.",
    ]
    assert [(h.level, h.title) for h in p.headings] == [(1, "Chapter 1"), (1, "Chapter 2")]


def test_docx_line_breaks_and_tabs_separate_words():
    W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    para = (
        "<w:p><w:r><w:t>First line</w:t></w:r>"
        "<w:r><w:br/></w:r>"
        "<w:r><w:t>Second line</w:t></w:r>"
        "<w:r><w:tab/></w:r>"
        "<w:r><w:t>Third</w:t></w:r></w:p>"
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" '
        'ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/>'
        "</Relationships>"
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", rels)
        z.writestr(
            "word/document.xml",
            f"<w:document {W}><w:body>{para}</w:body></w:document>",
        )
    data = buf.getvalue()
    p = parse(data, "d.docx")
    assert p.text == "First line\nSecond line Third"


def test_docx_over_cap_entry_is_rejected(monkeypatch):
    monkeypatch.setattr(config, "UPLOAD_CAP_BYTES", 500)
    data = make_docx([(None, "x" * 2500)])
    with pytest.raises(IngestError) as e:
        parse(data, "d.docx")
    assert e.value.code == "over_upload_cap"


def test_malformed_docx_package_is_typed_error():
    W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", b"<Types/>")
        z.writestr(
            "word/document.xml",
            f"<w:document {W}><w:body><w:p><w:r><w:t>Hi</w:t></w:r></w:p></w:body></w:document>",
        )
    data = buf.getvalue()
    with pytest.raises(IngestError) as e:
        parse(data, "d.docx")
    assert e.value.code == "corrupt_file"
