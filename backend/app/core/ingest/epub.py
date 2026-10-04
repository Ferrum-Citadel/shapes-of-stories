import io
import posixpath
import re
import warnings
import zipfile
from collections.abc import Iterator
from urllib.parse import unquote

import lxml.html
from bs4 import BeautifulSoup, NavigableString, Tag, XMLParsedAsHTMLWarning
from lxml import etree

from app.core.errors import IngestError
from app.core.ingest import check_zip, read_capped
from app.core.ingest.boilerplate import strip_boilerplate
from app.core.ingest.model import PG_FOOTER, PG_HEADER, Heading, Parsed, Stripped
from app.core.text import normalize, word_count

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

_SKIP_TYPES = ("frontmatter", "backmatter", "toc", "titlepage", "copyright-page",
               "landmarks", "colophon")
_HEAD_LEVEL = {"h1": 1, "h2": 2, "h3": 2}
_TEXT_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote", "div"]
_BLOCK_TAGS = [*_TEXT_TAGS, "td", "th"]
_NS = {
    "c": "urn:oasis:names:tc:opendocument:xmlns:container",
    "opf": "http://www.idpf.org/2007/opf",
    "dc": "http://purl.org/dc/elements/1.1/",
}
_XHTML = "application/xhtml+xml"
# A title page's credit line: "by Franz Kafka", "Translated by David Wyllie".
_BYLINE = re.compile(r"(?:translated\s+)?by\s+\S.{0,50}", re.I)
Block = tuple[int | None, str]


def _has_skip_type(tag) -> bool:
    et = tag.get("epub:type", "") if tag else ""
    return any(t in et for t in _SKIP_TYPES)


def _is_pg_boilerplate(tag) -> bool:
    """Project Gutenberg's header and license: id pg-header/pg-footer, class pg-boilerplate
    (or the older pgheader), naming Gutenberg so a book's own "pgheader" class is kept."""
    classes = tag.get("class") or []
    return (
        tag.get("id") in ("pg-header", "pg-footer")
        or bool({"pg-boilerplate", "pgheader"} & set(classes))
    ) and "gutenberg" in tag.get_text().casefold()


def _words(tag) -> int:
    return word_count(tag.get_text(" ", strip=True))


def _collect_blocks(elem) -> Iterator[Block | int]:
    """Yield (heading level or None, text) blocks under elem in document order, and for
    Project Gutenberg's boilerplate its word count in its place."""
    if _is_pg_boilerplate(elem):
        yield _words(elem)
        return
    if elem.name in _BLOCK_TAGS and elem.find(_TEXT_TAGS) is None:
        text = elem.get_text()  # no separator: keeps "Second <i>para</i>." as "Second para."
        if text.strip():
            yield (_HEAD_LEVEL.get(elem.name), text)
        return
    if elem.name in _BLOCK_TAGS or elem.name == "body":
        direct = "".join(str(c) for c in elem.children if isinstance(c, NavigableString))
        if direct.strip():
            yield (_HEAD_LEVEL.get(elem.name), direct)
    for child in elem.children:
        if isinstance(child, Tag):
            yield from _collect_blocks(child)


def _xml(raw: bytes):
    # recover keeps package files with a stray "&" or HTML entity readable; none are resolved.
    return etree.fromstring(raw, etree.XMLParser(recover=True, resolve_entities=False))


def _text(parent, tag: str) -> str | None:
    el = parent.find(tag, _NS)
    return None if el is None else el.text


def _read_book(z: zipfile.ZipFile) -> tuple[str | None, str | None, list[tuple[bytes, bool]]]:
    """Return title, author and the (raw content, is nav) of each spine document in order."""
    container = _xml(z.read("META-INF/container.xml"))
    opf_path = next(
        (
            rf.get("full-path")
            for rf in container.iterfind(".//c:rootfile", _NS)
            if rf.get("media-type") == "application/oebps-package+xml"
        ),
        "",
    )
    opf = _xml(z.read(posixpath.normpath(opf_path)))
    opf_dir = posixpath.dirname(opf_path)
    metadata = opf.find("opf:metadata", _NS)
    items = {}
    for it in opf.find("opf:manifest", _NS).iterfind("opf:item", _NS):
        if it.get("href"):
            path = posixpath.normpath(
                posixpath.join(opf_dir, unquote(it.get("href").partition("#")[0]))
            )
            props = (it.get("properties") or "").split()
            items.setdefault(it.get("id"), (path, it.get("media-type"), props))

    nav = next((p for p, mt, props in items.values() if mt == _XHTML and "nav" in props), None)
    # EPUB 3 requires the nav document to hold a toc nav, so one without it is malformed.
    if nav is not None and not lxml.html.document_fromstring(
        z.read(nav), parser=lxml.html.HTMLParser(encoding="utf-8")
    ).xpath("//nav[@*='toc']"):
        raise ValueError("nav document without a toc")

    docs, seen = [], set()
    for ref in opf.find("opf:spine", _NS).iterfind("opf:itemref", _NS):
        item = items.get(ref.get("idref"))
        # A document listed twice is read once, so a repeated spine cannot multiply the work.
        if item is not None and item[1] == _XHTML and item[0] not in seen:
            seen.add(item[0])
            docs.append((z.read(item[0]), "nav" in item[2]))
    return _text(metadata, "dc:title"), _text(metadata, "dc:creator"), docs


def _cut_title_page(blocks: list[Block], title: str | None) -> tuple[list[Block], int]:
    """Drop a Gutenberg title page: title and credit headings that come before the first
    prose, each followed by another heading so a chapter "By the River" stays."""
    norm_title = (title or "").strip().casefold()
    out, cut, opened = [], 0, False
    for i, (level, t) in enumerate(blocks):
        heading_next = i + 1 < len(blocks) and blocks[i + 1][0] is not None
        if level and not opened and heading_next and (
            _BYLINE.fullmatch(t) or t.casefold() == norm_title
        ):
            cut += word_count(t)
            continue
        opened = opened or not level or not heading_next
        out.append((level, t))
    return out, cut


def parse_epub(data: bytes) -> Parsed:
    check_zip(data)
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
        if "META-INF/encryption.xml" in z.namelist():
            enc = read_capped(z, "META-INF/encryption.xml").decode("utf-8", "replace")
            if ".xhtml" in enc or ".htm" in enc:  # ".htm" also matches .html
                raise IngestError("drm_protected")
    except (KeyError, zipfile.BadZipFile):
        raise IngestError("corrupt_file", reason="epub structure") from None

    try:
        title, author, docs = _read_book(z)
    except Exception:
        raise IngestError("corrupt_file", reason="epub structure") from None

    paragraphs, stripped = [], []
    for content, is_nav in docs:
        soup = BeautifulSoup(content, "lxml")
        for br in soup.find_all("br"):
            br.replace_with("\n")
        if is_nav:
            n = _words(soup)
            if n:
                stripped.append(Stripped("epub front/back matter", n))
            continue

        body = soup.body
        if body and _has_skip_type(body):
            n = _words(body)
            if n:
                stripped.append(Stripped("epub front/back matter", n))
            continue

        if body:
            skip_words = 0
            for section in body.find_all("section"):
                if section.decomposed:
                    continue
                if _has_skip_type(section):
                    skip_words += _words(section)
                    section.decompose()
            if skip_words:
                stripped.append(Stripped("epub front/back matter", skip_words))
            for tag in body.find_all(["script", "style"]):
                tag.decompose()
            paragraphs.extend(_collect_blocks(body))

    blocks: list[Block] = []
    pg: dict[str, int] = {}
    for item in paragraphs:
        if isinstance(item, int):
            # Gutenberg's header is its first block, ahead of the work's words; later ones are
            # its license.
            label = PG_FOOTER if pg or blocks else PG_HEADER
            pg[label] = pg.get(label, 0) + item
        elif t := normalize(item[1]):
            blocks.append((item[0], t))
    stripped += [Stripped(label, n) for label, n in pg.items()]
    # A work's title and credits count as a title page only in a Gutenberg text, as in
    # strip_boilerplate: a manuscript's first chapter may carry the book's name.
    if PG_HEADER in pg:
        blocks, title_page = _cut_title_page(blocks, title)
        if title_page:
            stripped.append(Stripped("title page", title_page))

    text_parts, pos, headings = [], 0, []
    for level, t in blocks:
        if level:
            headings.append(Heading(level, t, pos))
        text_parts.append(t)
        pos += len(t) + 2
    text = "\n\n".join(text_parts)
    return strip_boilerplate(
        Parsed(
            text=text,
            format="epub",
            title=title,
            author=author,
            headings=headings,
            stripped=stripped,
        )
    )
