import io
import time
import zipfile

import pytest

from app import config
from app.core.errors import IngestError
from app.core.ingest import Stripped, parse
from tests.conftest import make_epub


def test_epub_spine_order_headings_and_front_matter():
    data = make_epub(
        [
            ("Chapter One", "<p>First para.</p><p>Second <i>para</i>.</p>"),
            ("Chapter Two", "<p>Third.</p>"),
        ],
        front="<p>Copyright 1999</p>",
    )
    p = parse(data, "b.epub")
    assert p.title == "An EPUB" and p.author == "E. Author"
    assert "Copyright" not in p.text and p.stripped[0].label == "epub front/back matter"
    assert [(h.level, h.title) for h in p.headings] == [(2, "Chapter One"), (2, "Chapter Two")]
    assert p.text.split("\n\n") == [
        "Chapter One",
        "First para.",
        "Second para.",
        "Chapter Two",
        "Third.",
    ]
    assert all(p.text[h.start_cp :].startswith(h.title) for h in p.headings)


def test_drm_rejected():
    with pytest.raises(IngestError) as e:
        parse(make_epub([("C", "<p>x</p>")], drm=True), "b.epub")
    assert e.value.code == "drm_protected"


def test_backmatter_section_inside_chapter_is_skipped_but_chapter_kept():
    body = '<p>Story.</p><section epub:type="backmatter"><p>Footnote.</p></section>'
    data = make_epub([("Chapter", body)])
    p = parse(data, "b.epub")
    assert "Story." in p.text
    assert "Footnote." not in p.text
    assert p.stripped == [Stripped("epub front/back matter", 1)]


def test_nav_document_is_skipped():
    data = make_epub([("One", "<p>Body.</p>")], nav="<nav><ol><li>One</li></ol></nav>")
    p = parse(data, "b.epub")
    assert p.text.split("\n\n") == ["One", "Body."]
    assert p.stripped[0].label == "epub front/back matter"


def test_image_in_spine_is_never_read():
    data = make_epub(
        [("Chapter One", "<p>First para.</p>")],
        extra_items=[("img1", "img1.jpg", "image/jpeg", b"\xff\xd8JPEGDATA")],
    )
    p = parse(data, "b.epub")
    assert "JPEGDATA" not in p.text
    assert p.text.split("\n\n") == ["Chapter One", "First para."]


def test_epub_over_cap_entry_is_rejected(monkeypatch):
    monkeypatch.setattr(config, "UPLOAD_CAP_BYTES", 500)
    data = make_epub([("Chapter", f"<p>{'x' * 2500}</p>")])
    with pytest.raises(IngestError) as e:
        parse(data, "b.epub")
    assert e.value.code == "over_upload_cap"


def test_corrupt_container_is_typed_error():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("mimetype", "application/epub+zip")
        z.writestr("META-INF/container.xml", b"<<<not xml")
    with pytest.raises(IngestError) as e:
        parse(buf.getvalue(), "b.epub")
    assert e.value.code == "corrupt_file"


def test_nav_without_toc_type_is_typed_error():
    data = make_epub(
        [("One", "<p>Body.</p>")],
        nav="<nav><ol><li>One</li></ol></nav>",
        inject_toc_type=False,
    )
    with pytest.raises(IngestError) as e:
        parse(data, "b.epub")
    assert e.value.code == "corrupt_file"


def test_br_inside_paragraph_separates_lines():
    data = make_epub([("Chapter", "<p>Line one.<br/>Line two.</p>")])
    p = parse(data, "b.epub")
    assert "Line one.\nLine two." in p.text


def test_nested_blocks_are_not_duplicated():
    body = "<blockquote><p>Quoted line here.</p></blockquote><ul><li><p>Item para.</p></li></ul>"
    data = make_epub([("Chapter", body)])
    p = parse(data, "b.epub")
    assert p.text.split("\n\n") == ["Chapter", "Quoted line here.", "Item para."]


def _raw_epub(opf_path: str, manifest: str, spine: str, files: dict[str, str],
              title="An EPUB") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("mimetype", "application/epub+zip")
        z.writestr(
            "META-INF/container.xml",
            '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">'
            f'<rootfiles><rootfile full-path="{opf_path}" '
            'media-type="application/oebps-package+xml"/></rootfiles></container>',
        )
        z.writestr(
            opf_path,
            '<package xmlns="http://www.idpf.org/2007/opf" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/" version="3.0">'
            f"<metadata><dc:title>{title}</dc:title></metadata>"
            f"<manifest>{manifest}</manifest><spine>{spine}</spine></package>",
        )
        for name, content in files.items():
            z.writestr(name, content)
    return buf.getvalue()


def test_hrefs_resolve_from_the_package_folder_and_skip_non_documents():
    data = _raw_epub(
        "pkg/book.opf",
        '<item id="c" href="../Text/Chapter%201.xhtml" media-type="application/xhtml+xml"/>'
        '<item id="h" href="../Text/old.html" media-type="text/html"/>',
        '<itemref idref="missing"/><itemref idref="h"/><itemref idref="c"/>',
        {
            "Text/Chapter 1.xhtml": "<html><body><h2>One</h2><p>Body.</p></body></html>",
            "Text/old.html": "<html><body><p>Not a spine document.</p></body></html>",
        },
    )
    p = parse(data, "b.epub")
    assert p.title == "An EPUB" and p.author is None
    assert p.text.split("\n\n") == ["One", "Body."]


def test_package_file_with_a_stray_ampersand_still_reads():
    data = _raw_epub(
        "content.opf",
        '<item id="c" href="c.xhtml" media-type="application/xhtml+xml"/>',
        '<itemref idref="c"/>',
        {"c.xhtml": "<html><body><p>Body.</p></body></html>"},
        title="Tom & Jerry",
    )
    assert parse(data, "b.epub").text == "Body."


def test_repeated_spine_entries_read_the_document_once():
    data = _raw_epub(
        "content.opf",
        '<item id="c" href="c.xhtml" media-type="application/xhtml+xml"/>'
        '<item id="same" href="c.xhtml" media-type="application/xhtml+xml"/>',
        '<itemref idref="c"/>' * 5000 + '<itemref idref="same"/>',
        {"c.xhtml": f"<html><body><h2>One</h2>{'<p>Body.</p>' * 200}</body></html>"},
    )
    start = time.perf_counter()
    p = parse(data, "b.epub")
    assert time.perf_counter() - start < 2
    assert p.text.split("\n\n") == ["One"] + ["Body."] * 200


def test_first_manifest_item_wins_for_a_repeated_id():
    data = _raw_epub(
        "content.opf",
        '<item id="a" href="a.xhtml" media-type="application/xhtml+xml"/>'
        '<item id="a" href="z.xhtml" media-type="application/xhtml+xml"/>',
        '<itemref idref="a"/>',
        {
            "a.xhtml": "<html><body><p>Ay.</p></body></html>",
            "z.xhtml": "<html><body><p>Zed.</p></body></html>",
        },
    )
    assert parse(data, "b.epub").text == "Ay."


def test_href_fragment_is_ignored_and_item_without_href_is_skipped():
    data = _raw_epub(
        "content.opf",
        '<item id="x" media-type="application/xhtml+xml"/>'
        '<item id="c" href="c.xhtml#top" media-type="application/xhtml+xml"/>',
        '<itemref idref="x"/><itemref idref="c"/>',
        {"c.xhtml": "<html><body><p>Body.</p></body></html>"},
    )
    assert parse(data, "b.epub").text == "Body."


def test_loose_text_and_table_cells_are_kept():
    body = "<div>Loose text.<p>Para inside.</p></div><table><tr><td>Cell one.</td></tr></table>"
    data = make_epub([("Chapter", body)])
    p = parse(data, "b.epub")
    for chunk in ("Loose text.", "Para inside.", "Cell one."):
        assert p.text.count(chunk) == 1


_PG_HEADER = (
    '<h2 id="pg-header-heading">The Project Gutenberg eBook of Metamorphosis</h2>'
    "<div>This eBook is for the use of anyone anywhere.</div>"
    "<p><strong>Title</strong>: Metamorphosis</p><p><strong>Author</strong>: Franz Kafka</p>"
    "<div><span>*** START OF THE PROJECT GUTENBERG EBOOK METAMORPHOSIS ***</span></div>"
)
_PG_FOOTER = (
    "<div><span>*** END OF THE PROJECT GUTENBERG EBOOK METAMORPHOSIS ***</span></div>"
    '<h2 id="pg-footer-heading">THE FULL PROJECT GUTENBERG LICENSE</h2>'
    "<div>PLEASE READ THIS BEFORE YOU DISTRIBUTE OR USE THIS WORK</div>"
)
_TITLE_PAGE = (
    "<h1>Metamorphosis</h1><h2>by Franz Kafka</h2><h3>Translated by David Wyllie</h3><hr/>"
)
_STORY = "<p>One morning Gregor Samsa woke from troubled dreams.</p>"


def _gutenberg_epub(docs: list[str], ext: str) -> bytes:
    names = [f"OEBPS/5200-h-{i}.htm.{ext}" for i in range(len(docs))]
    return _raw_epub(
        "OEBPS/content.opf",
        '<item id="wrap" href="wrap0000.xhtml" media-type="application/xhtml+xml"/>'
        + "".join(
            f'<item id="d{i}" href="{n.removeprefix("OEBPS/")}" '
            'media-type="application/xhtml+xml"/>'
            for i, n in enumerate(names)
        ),
        '<itemref idref="wrap"/>' + "".join(f'<itemref idref="d{i}"/>' for i in range(len(docs))),
        {
            "OEBPS/wrap0000.xhtml": '<html><body><div><svg><image/></svg></div></body></html>',
            **{n: f"<html><body>{d}</body></html>" for n, d in zip(names, docs, strict=True)},
        },
        title="Metamorphosis",
    )


def _assert_gutenberg_structure(p):
    assert [(h.level, h.title) for h in p.headings] == [(2, "I"), (2, "II"), (2, "III")]
    assert p.text.startswith("I\n\nOne morning")
    assert "Gutenberg" not in p.text and "Kafka" not in p.text and "Wyllie" not in p.text
    assert p.stripped == [
        Stripped("Project Gutenberg header", 31),
        Stripped("Project Gutenberg footer", 24),
        Stripped("title page", 8),
    ]


def test_gutenberg_current_layout_header_title_page_and_licence_are_cut():
    data = _gutenberg_epub(
        [
            f'<header class="pg-boilerplate pgheader" id="pg-header">{_PG_HEADER}</header>'
            + _TITLE_PAGE,
            f"<h2>I</h2>{_STORY}",
            f"<h2>II</h2>{_STORY}",
            f"<h2>III</h2>{_STORY}",
            f'<footer class="pg-boilerplate pgheader" id="pg-footer">{_PG_FOOTER}</footer>',
        ],
        "xhtml",
    )
    _assert_gutenberg_structure(parse(data, "b.epub"))


def test_gutenberg_older_layout_with_the_licence_inside_the_last_chapter():
    data = _gutenberg_epub(
        [
            f'<div class="pgmonospaced pgheader">{_PG_HEADER}</div>{_TITLE_PAGE}',
            f"<h2>I</h2>{_STORY}",
            f"<h2>II</h2>{_STORY}",
            f'<h2>III</h2>{_STORY}<div class="pgmonospaced pgheader">{_PG_FOOTER}</div>',
        ],
        "html",
    )
    _assert_gutenberg_structure(parse(data, "b.epub"))


_PG_HEADER_ELEMENT = f'<header class="pg-boilerplate" id="pg-header">{_PG_HEADER}</header>'
_PROSE = "<p>They walked by the river until the light went.</p>"


@pytest.mark.parametrize(
    ("title", "body", "headings"),
    [
        ("A Book", f"<h1>A Book</h1><h2>One</h2>{_PROSE}", ["A Book", "One"]),
        ("Tales", f"<h1>By Night</h1><h2>1</h2>{_PROSE}", ["By Night", "1"]),
        ("The Lottery", f"<h1>The Lottery</h1><h2>I</h2>{_PROSE}", ["The Lottery", "I"]),
        (
            "A Book",
            f"<h1>A Book</h1><h2>BY ANNE AUTHOR</h2><h2>By the River</h2>{_PROSE}",
            ["A Book", "BY ANNE AUTHOR", "By the River"],
        ),
    ],
)
def test_title_page_rule_leaves_a_book_without_a_gutenberg_header_alone(title, body, headings):
    data = _raw_epub(
        "content.opf",
        '<item id="c" href="c.xhtml" media-type="application/xhtml+xml"/>',
        '<itemref idref="c"/>',
        {"c.xhtml": f"<html><body>{body}</body></html>"},
        title=title,
    )
    p = parse(data, "b.epub")
    assert [h.title for h in p.headings] == headings
    assert p.stripped == []


def test_gutenberg_title_page_is_cut_but_chapters_that_look_like_credits_stay():
    data = _gutenberg_epub(
        [
            _PG_HEADER_ELEMENT + _TITLE_PAGE,
            f"<h2>By the River</h2>{_PROSE}<h2>Translated Letters</h2>{_PROSE}",
        ],
        "xhtml",
    )
    p = parse(data, "b.epub")
    assert [h.title for h in p.headings] == ["By the River", "Translated Letters"]
    assert Stripped("title page", 8) in p.stripped


def test_gutenberg_title_page_window_closes_at_the_first_prose():
    data = _gutenberg_epub(
        [_PG_HEADER_ELEMENT + _PROSE, f"<h1>By Night</h1><h2>1</h2>{_PROSE}"],
        "xhtml",
    )
    p = parse(data, "b.epub")
    assert [h.title for h in p.headings] == ["By Night", "1"]
    assert all(s.label != "title page" for s in p.stripped)


def test_pg_class_without_gutenberg_text_is_story():
    data = make_epub([("One", '<div class="pgheader"><p>The story starts here.</p></div>')])
    p = parse(data, "b.epub")
    assert "The story starts here." in p.text and p.stripped == []
