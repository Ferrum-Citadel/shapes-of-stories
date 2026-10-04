import io
import re

import docx

from app.core.errors import IngestError
from app.core.ingest.boilerplate import strip_boilerplate
from app.core.ingest.container import check_zip
from app.core.ingest.model import Heading, Parsed
from app.core.text import normalize

_HEADING = re.compile(r"^heading\s*(\d)$", re.I)


def parse_docx(data: bytes) -> Parsed:
    check_zip(data)
    try:
        document = docx.Document(io.BytesIO(data))
    except Exception:
        raise IngestError("corrupt_file", reason="docx structure") from None
    parts, headings, title, pos = [], [], None, 0
    for paragraph in document.paragraphs:
        text = normalize(paragraph.text)
        if not text:
            continue
        style_name = paragraph.style.name if paragraph.style is not None else ""
        if style_name.lower() == "title" and title is None:
            title = text
            continue
        m = _HEADING.match(style_name)
        if m:
            headings.append(Heading(1 if m.group(1) == "1" else 2, text, pos))
        parts.append(text)
        pos += len(text) + 2
    return strip_boilerplate(
        Parsed(text="\n\n".join(parts), format="docx", title=title, headings=headings)
    )
