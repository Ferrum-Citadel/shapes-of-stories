"""Plain text and Markdown, plus the heading and break detectors."""

import re
from dataclasses import replace

from markdown_it import MarkdownIt

from app.core.ingest.boilerplate import (
    _CHAPTER_WORD,
    _CONTENTS,
    _L1,
    _L2,
    _NUMERAL,
    _prose_follows,
    _roman_to_int,
    entry_number,
    strip_boilerplate,
)
from app.core.ingest.model import PG_FOOTER, PG_HEADER, Heading, Parsed, Stripped
from app.core.text import decode, normalize, paragraph_spans, word_count

_PG_START = re.compile(r"\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*", re.I)
# Older files also close the text with an "End of Project Gutenberg's <title>" line, the
# last before the end marker.
_PG_END = re.compile(
    r"\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*"
    r"|^End of (the )?Project Gutenberg's [^\n]*(?=\s*(?:\*\*\* ?END OF|\Z))",
    re.I | re.M,
)
_PG_TITLE = re.compile(r"^Title:\s*(.+)$", re.M)
_PG_AUTHOR = re.compile(r"^Author:\s*(.+)$", re.M)

_BARE_NUMERAL = re.compile(_NUMERAL + r"\b")
_TITLED_NUMERAL = re.compile(_NUMERAL + r"[.:]?\s+\S")
# The heading of a first chapter ("I", "Chapter I.", "CHAPTER 1", "Chapter One"); a bare
# numeral only as the whole title, not "One Week Later".
FIRST_CHAPTER = re.compile(_CHAPTER_WORD + r"\s+(?:I|1|(?i:ONE))(?!\w)|(?:I|1)\.?$")
# A play's bare stage lines, which open or close an act rather than title one.
_STAGE_LINE = re.compile(r"(?:SCENE|ACT DROP|TABLEAU|CURTAIN)$")
_LONG_L2 = re.compile(r"(?:CHAPTER|CHAP\.|LETTER|STAVE)\s+" + _NUMERAL + r"[.:]\s")
BREAK = re.compile(r"^(\*\s*\*\s*\*|\*{3,}|#|-{3,}|_{3,}|~{3,})$")
# 3+ blank lines are an explicit break: mark it with a "* * *" paragraph before normalize()
# collapses them; the marker stays in the text and word count.
_MANY_BLANKS = re.compile(r"\r?\n(?:[ \t]*\r?\n){3,}")


def strip_gutenberg(text: str) -> tuple[str, list[Stripped], str | None, str | None]:
    stripped, title, author = [], None, None
    m = _PG_START.search(text)
    if m:
        head = text[: m.start()]
        title = (_PG_TITLE.search(head) or [None, None])[1]
        author = (_PG_AUTHOR.search(head) or [None, None])[1]
        stripped.append(Stripped(PG_HEADER, word_count(head) + word_count(m.group(0))))
        text = text[m.end() :]
    m = _PG_END.search(text)
    if m:
        stripped.append(Stripped(PG_FOOTER, word_count(text[m.start() :])))
        text = text[: m.start()]
    return (
        text.strip(),
        stripped,
        title.strip() if title else None,
        author.strip() if author else None,
    )


def _keyword_level(first: str) -> int | None:
    """Heading level of a chapter keyword line (PART, CHAPTER, ...); never the
    bare-numeral form of `_L2`, or a title-page address (156 CHARING CROSS ROAD /
    LONDON) would become a heading."""
    if _L1.match(first):
        return 1
    if _L2.match(first) and not _BARE_NUMERAL.match(first):
        return 2
    return None


_ROMAN_LINE = re.compile(r"[IVXLC]+\.?")
# Punctuation a short capitals title may hold: an honorific's full stop and a
# possessive's apostrophe ("SEARCH FOR MR. HYDE", "DR. LANYON'S NARRATIVE"), not a
# contraction ("DON'T").
_IN_TITLE = re.compile(r"\b(?:MRS?|DR|ST)\.(?= )|(?<=[A-Z])'S\b")
# A keyword and its number running on into lowercase prose ("Chapter VII was the one...").
_RUNS_ON = re.compile(r"\S+\s+\S+\s+[a-z]")


def _title_like(words: list[str]) -> bool:
    """At least a quarter of the words capitalised: a title ("Of the Less Erroneous
    Pictures of Whales", "A churchyard; in it a Monument belonging to the Capulets."), not a
    sentence of prose ("The rain had not stopped for three days, and Ellen was...")."""
    return 4 * sum(w.lstrip("\"'(")[:1].isupper() for w in words) >= len(words)


def _numbered_run(text: str, headings: list[Heading], numbered: list[Heading]) -> list[Heading]:
    """The two-line "I." / "THE EVE OF THE WAR." or "I" / "The Black Spot" headings, kept
    only as a whole: each must have prose after it, and together they must count up from
    I, at least three of them, restarting at I only after a level-1 heading (PART, BOOK,
    VOLUME, ACT); in a run of five or more, one numeral after the first that is off the
    count is a misprint when the next one resumes it (Treasure Island prints XVII as
    "XXVII"). They are chapters only in a book without
    its own: none when the text already has three chapter-level headings or one falls
    among them. Anything else (a pronoun on its own line, a short numbered list,
    numbered poems or articles inside a chapter) drops them all."""
    every = sorted(headings + numbered, key=lambda h: h.start_cp)
    if len(numbered) < 3 or not all(_prose_follows(text, h, every) for h in numbered):
        return []
    chapters = [h.start_cp for h in headings if h.level == 2]
    lo, hi = numbered[0].start_cp, numbered[-1].start_cp
    if len(chapters) >= 3 or any(lo < c < hi for c in chapters):
        return []
    seq, restart = [], False  # (numeral, after a level-1 heading)
    for h in every:
        if h.level == 1:
            restart = True
        elif h in numbered:
            seq.append((_roman_to_int(h.title.split()[0].rstrip(".")), restart))
            restart = False
    expected = 1
    for i, (n, restart) in enumerate(seq):
        if restart and n == 1:
            expected = 1
        elif n != expected and not (
            0 < i and len(seq) >= 5 and i + 1 < len(seq) and seq[i + 1][0] == expected + 1
        ):
            return []
        expected += 1
    return numbered


def _continuing(text: str, headings: list[Heading], wrapped: list[Heading]) -> list[Heading]:
    """The long or wrapped keyword headings ("CHAPTER 56. Of the Less Erroneous Pictures of
    Whales, and the True" / "Pictures of Whaling Scenes.") with prose after them whose
    number is one after the found heading of their level before them, or one before the
    found heading after them; each one kept counts for the next, so a run of them grows
    from a heading found the ordinary way. A prose line opening with a keyword and a
    number never fits the count, and a contents entry has no prose after it."""
    every = sorted(headings + wrapped, key=lambda h: h.start_cp)
    kept, pending = [], [h for h in wrapped if _prose_follows(text, h, every)]
    while pending:
        nums = sorted(
            (h.start_cp, h.level, n)
            for h in headings + kept
            if (n := entry_number(h.title)) is not None
        )
        fits = []
        for h in pending:
            n = entry_number(h.title)
            before = [m for cp, lvl, m in nums if lvl == h.level and cp < h.start_cp]
            after = [m for cp, lvl, m in nums if lvl == h.level and cp > h.start_cp]
            # a number the nearest found heading already has is prose, not a second chapter
            if n not in before[-1:] + after[:1] and (
                (before and before[-1] == n - 1) or (after and after[0] == n + 1)
            ):
                fits.append(h)
        if not fits:
            break
        kept += fits
        pending = [h for h in pending if h not in fits]
    return kept


def heading_candidates(text: str) -> list[Heading]:
    out, numbered, wrapped = [], [], []
    prev = None  # start of the paragraph before this one
    for a, b in paragraph_spans(text):
        under_heading = bool(out) and out[-1].start_cp == prev and out[-1].level == 2
        prev = a
        line = text[a:b]
        lines = line.split("\n")
        if len(lines) == 2 and len(lines[0]) <= 60:
            # a chapter keyword and its title on consecutive lines arrive as one paragraph;
            # the title under a bare numeral may run long, its run guards it, but a
            # mixed-case one must not end a sentence ("I." / "He lied to me.")
            first, second = (x.strip() for x in lines)
            if (
                _ROMAN_LINE.fullmatch(first)
                and second.lstrip("\"'")[:1].isupper()
                and (second.isupper() or not second.endswith((".", "!", "?")))
            ):
                numbered.append(Heading(2, f"{first} {second}", a, joined=True))
                continue
            if len(second) <= 60:
                if level := _keyword_level(first):
                    out.append(Heading(level, f"{first} {second}", a, joined=True))
                continue
        s = line.strip()
        if "\n" in line or len(line) > 60:
            first = lines[0].strip()
            level = _keyword_level(first)
            if "\n" not in line and _LONG_L2.match(s) and s.isupper() and len(s) <= 100:
                # A long one-line title (Heidi has two) counts only in capitals, after a
                # numeral and its full stop, and up to 100 characters.
                out.append(Heading(2, s, a))
            elif (
                level
                and len(lines) <= 4
                and entry_number(first) is not None
                and not _RUNS_ON.match(first)
                and _title_like(" ".join(lines).split()[2:])
            ):
                title = " ".join(x.strip() for x in lines)
                wrapped.append(Heading(level, title, a, joined="\n" in line))
            continue
        if _L1.match(s):
            out.append(Heading(1, s, a))
        elif _L2.match(s):
            out.append(Heading(2, s, a))
        elif (
            # a titled line straight under a chapter heading is that chapter's title
            not under_heading
            and not _STAGE_LINE.match(s)
            and len(s.split()) <= 8
            and s[0].isalpha()
            and not re.search(r'[.!?,;:"\']', _IN_TITLE.sub("", s) if s.isupper() else s)
            and (s.isupper() or s.istitle())
        ):
            out.append(Heading(3, s, a))
    out = sorted(out + _continuing(text, out, wrapped), key=lambda h: h.start_cp)
    if (
        out
        and out[-1].level == 3
        and out[-1].title.casefold() == "conclusion"
        and any(h.level == 2 for h in out)
    ):
        # a closing "Conclusion" after the last chapter is a chapter of its own
        out[-1] = replace(out[-1], level=2)
    if sum(bool(re.match(_CHAPTER_WORD, h.title)) for h in out) >= 3:
        # A book headed by its own chapter keywords: a numeral with words after it on the
        # same line is a numbered sentence or list item ("I. A Fast-Fish belongs to the party").
        out = [h for h in out if not _TITLED_NUMERAL.match(h.title)]
    return sorted(out + _numbered_run(text, out, numbered), key=lambda h: h.start_cp)


def typographic_breaks(text: str) -> list[int]:
    spans = paragraph_spans(text)
    breaks = []
    for i in range(len(spans) - 1):
        a, b = spans[i]
        if BREAK.match(text[a:b].strip()):
            breaks.append(spans[i + 1][0])
    return breaks


# An illustrated edition's caption: "[Illustration]", "[Illustration: ...]" or "[Picture: ...]",
# over several lines and holding one level of brackets of its own, closing within a few
# hundred characters (the longest known runs to 338), so an unclosed one is left alone.
# Captions on lines of their own go with the blank lines around them, which keep their
# longest run.
_CAPTION_BODY = r"\[(?:Illustration|Picture)(?::(?:[^\[\]]|\[[^\[\]]{0,200}\]){0,500})?\]"
_CAPTION = re.compile(
    # A whitespace run is tried once, from its start: from every line of it, a long run of
    # blank lines would cost time quadratic in its length.
    rf"(?P<pre>\A\s*|(?<=\S)\s+)(?P<line>{_CAPTION_BODY}(?:\s*{_CAPTION_BODY})*)"
    rf"(?P<post>[ \t\r]*(?:\n\s*|\Z))|{_CAPTION_BODY}"
)
_END_MARK = re.compile(r"(?:THE END|FINIS)\.?", re.I)


def _last_keyword_line(body: str) -> int:
    pos, last = 0, -1
    for line in body.split("\n"):
        if _keyword_level(line.strip()):
            last = pos
        pos += len(line) + 1
    return last


def _strip_captions(body: str) -> str:
    """Remove captions, keeping only the paragraphs in them that head a page -- a numbered
    chapter heading, a contents heading, or an end marker with no chapter heading after it
    -- which some editions print inside the picture ("[Illustration: ...\\n\\nChapter I.]")."""
    last_heading: list[int] = []

    def ends_book(pos: int) -> bool:
        if not last_heading:
            last_heading.append(_last_keyword_line(body))
        return pos > last_heading[0]

    def keep(m: re.Match) -> str:
        if not m["line"]:
            return ""
        if m.start() and "\n" not in m["pre"]:
            # after text on its line: removed with the space around it left as it was
            return m["pre"] + m["post"]
        paras = (
            " ".join(p.split())
            for c in re.findall(_CAPTION_BODY, m["line"])
            for p in re.split(r"\n\s*\n", c[1:-1].partition(":")[2])
        )
        kept = [
            p
            for p in paras
            if entry_number(p) is not None
            or _CONTENTS.match(p)
            or (_END_MARK.fullmatch(p) and ends_book(m.start()))
        ]
        if kept:
            return m["pre"] + "\n\n".join(kept) + m["post"]
        return max(m["pre"], m["post"], key=lambda s: s.count("\n"))

    return _CAPTION.sub(keep, body)


def parse_txt(data: bytes) -> Parsed:
    raw = decode(data)
    body, stripped, title, author = strip_gutenberg(raw)
    words = word_count(body)
    body = _strip_captions(body)
    if removed := words - word_count(body):
        stripped.append(Stripped("illustration captions", removed))
    body = _MANY_BLANKS.sub("\n\n* * *\n\n", body)
    text = normalize(body)
    return strip_boilerplate(
        Parsed(
            text=text,
            format="txt",
            title=title,
            author=author,
            headings=heading_candidates(text),
            breaks=typographic_breaks(text),
            stripped=stripped,
        )
    )


def _inline_text(token) -> str:
    """Join an `inline` token's children into plain text: text and code_inline content,
    soft/hard breaks as a space; markup tokens (em_open, strong_open, ...) contribute
    nothing, which is how the markup gets stripped."""
    out = []
    for c in token.children or []:
        if c.type in ("text", "code_inline"):
            out.append(c.content)
        elif c.type in ("softbreak", "hardbreak"):
            out.append(" ")
    return "".join(out)


def parse_markdown(data: bytes) -> Parsed:
    raw = decode(data)
    raw = _MANY_BLANKS.sub("\n\n* * *\n\n", raw)
    tokens = MarkdownIt("commonmark").parse(raw)
    blocks: list[tuple[int | None, str]] = []  # (heading level or None, raw block text)
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t.type == "heading_open":
            title = _inline_text(tokens[i + 1])
            # A run of markup delimiters with nothing to wrap (e.g. "***") parses as
            # literal text, not as empty emphasis; treat it as no title instead of
            # surfacing it as a real heading.
            level = None if BREAK.match(title.strip()) else (1 if t.tag == "h1" else 2)
            blocks.append((level, "" if level is None else title))
            i += 3
        elif t.type == "paragraph_open":
            blocks.append((None, _inline_text(tokens[i + 1])))
            i += 3
        elif t.type == "hr":
            blocks.append((None, "* * *"))
            i += 1
        elif t.type in ("fence", "code_block"):
            blocks.append((None, t.content))
            i += 1
        else:
            i += 1
    parts, headings, pos = [], [], 0
    for level, raw_text in blocks:
        text = normalize(raw_text)
        if not text:
            continue
        if level:
            headings.append(Heading(level, text, pos))
        parts.append(text)
        pos += len(text) + 2
    text = "\n\n".join(parts)
    return strip_boilerplate(
        Parsed(text=text, format="markdown", headings=headings, breaks=typographic_breaks(text))
    )
