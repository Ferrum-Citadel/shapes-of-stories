import io
import os
import zipfile

import pytest
import pytest_asyncio
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from app.db import make_pool, run_migrations
from app.settings import Settings

TEST_DB = os.environ.get("TEST_DATABASE_URL")
TABLES = ["share_links", "beats", "jobs", "works", "sessions", "rate_limits"]


def big(n: int) -> str:
    return " ".join(["word"] * n)


def gutenberg_wrap(body: str, title="Test Book", author="A. Writer") -> str:
    return (
        f"The Project Gutenberg eBook of {title}, by {author}\n\n"
        f"This eBook is for the use of anyone.\n\n"
        f"Title: {title}\nAuthor: {author}\n\n"
        f"*** START OF THE PROJECT GUTENBERG EBOOK {title.upper()} ***\n\n"
        f"{body}\n\n"
        f"*** END OF THE PROJECT GUTENBERG EBOOK {title.upper()} ***\n\n"
        f"License text here.\n"
    )


def make_epub(
    chapters: list[tuple[str, str]],
    front: str | None = None,
    drm=False,
    nav: str | None = None,
    extra_items: list[tuple[str, str, str, bytes]] | None = None,
    inject_toc_type: bool = True,
) -> bytes:
    """chapters: [(heading, body_html)] ; front: html marked epub:type=frontmatter;
    nav: html for a nav document (manifest item with properties="nav");
    extra_items: [(id, href, media_type, bytes)] written, manifested, and spined as-is;
    inject_toc_type: auto-add epub:type="toc" to a bare <nav> (set False to build a
    non-EPUB3-compliant nav on purpose)."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("mimetype", "application/epub+zip")
        z.writestr(
            "META-INF/container.xml",
            '<?xml version="1.0"?>'
            '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">'
            '<rootfiles><rootfile full-path="OEBPS/content.opf" '
            'media-type="application/oebps-package+xml"/></rootfiles></container>',
        )
        items, spine = [], []
        if nav:
            # EPUB 3 requires epub:type="toc" on the <nav> element, so inject it
            # when the caller didn't supply one.
            if inject_toc_type and "epub:type" not in nav:
                nav = nav.replace("<nav>", '<nav epub:type="toc">', 1)
            z.writestr("OEBPS/nav.xhtml", nav)
            items.append(
                '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" '
                'properties="nav"/>'
            )
            spine.append('<itemref idref="nav"/>')
        if front:
            z.writestr(
                "OEBPS/front.xhtml",
                '<html xmlns:epub="http://www.idpf.org/2007/ops">'
                f'<body epub:type="frontmatter">{front}</body></html>',
            )
            items.append('<item id="front" href="front.xhtml" media-type="application/xhtml+xml"/>')
            spine.append('<itemref idref="front"/>')
        for i, (h, body) in enumerate(chapters):
            z.writestr(f"OEBPS/c{i}.xhtml", f"<html><body><h2>{h}</h2>{body}</body></html>")
            items.append(f'<item id="c{i}" href="c{i}.xhtml" media-type="application/xhtml+xml"/>')
            spine.append(f'<itemref idref="c{i}"/>')
        for item_id, href, media_type, item_data in extra_items or []:
            z.writestr(f"OEBPS/{href}", item_data)
            items.append(f'<item id="{item_id}" href="{href}" media-type="{media_type}"/>')
            spine.append(f'<itemref idref="{item_id}"/>')
        z.writestr(
            "OEBPS/content.opf",
            '<package xmlns="http://www.idpf.org/2007/opf" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/" version="3.0">'
            "<metadata><dc:title>An EPUB</dc:title><dc:creator>E. Author</dc:creator></metadata>"
            f"<manifest>{''.join(items)}</manifest><spine>{''.join(spine)}</spine></package>",
        )
        if drm:
            z.writestr(
                "META-INF/encryption.xml",
                "<encryption><EncryptedData><CipherData>"
                '<CipherReference URI="OEBPS/c0.xhtml"/></CipherData></EncryptedData>'
                "</encryption>",
            )
    return buf.getvalue()


_CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" '
    'ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/word/document.xml" '
    'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    '<Override PartName="/word/styles.xml" '
    'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    "</Types>"
)
_PACKAGE_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" '
    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
    'Target="word/document.xml"/>'
    "</Relationships>"
)
_DOCUMENT_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" '
    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
    'Target="styles.xml"/>'
    "</Relationships>"
)


def make_docx(paras: list[tuple[str | None, str]]) -> bytes:
    """paras: [(style or None, text)]"""
    W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    styles = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles {W}>'
        '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>'
        '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/></w:style>'
        "</w:styles>"
    )

    def para_elem(s, t):
        style_part = f'<w:pPr><w:pStyle w:val="{s}"/></w:pPr>' if s else ""
        return f'<w:p>{style_part}<w:r><w:t xml:space="preserve">{t}</w:t></w:r></w:p>'

    body = "".join(para_elem(s, t) for s, t in paras)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", _CONTENT_TYPES)
        z.writestr("_rels/.rels", _PACKAGE_RELS)
        z.writestr("word/_rels/document.xml.rels", _DOCUMENT_RELS)
        z.writestr(
            "word/document.xml",
            f"<w:document {W}><w:body>{body}</w:body></w:document>",
        )
        z.writestr("word/styles.xml", styles)
    return buf.getvalue()


@pytest_asyncio.fixture
async def pool():
    if not TEST_DB:
        pytest.skip("TEST_DATABASE_URL not set")
    p = make_pool(TEST_DB)
    await p.open()
    await run_migrations(p)
    async with p.connection() as conn:
        await conn.execute("truncate " + ", ".join(TABLES) + " cascade")
    yield p
    await p.close()


def test_settings(**over):
    return Settings(
        database_url=TEST_DB,
        server_secret="test-secret",
        jev_mode="synthetic",
        cors_origins=["http://localhost:5173"],
        **over,
    )


@pytest_asyncio.fixture
async def app(pool):
    from app.main import create_app

    a = create_app(test_settings(), start_worker=False)
    async with LifespanManager(a):
        yield a


@pytest_asyncio.fixture
async def client(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def session(client):
    r = await client.post("/api/session")
    return {"X-Session": r.json()["session_id"]}
