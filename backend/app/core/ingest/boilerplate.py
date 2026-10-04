"""Front and back matter stripping. Front matter is only ever stripped behind a
recognized block -- a Project Gutenberg header or a table of contents; a plain
upload with neither starts at its first paragraph, prologue included. Behind one,
the story starts where the contents listing says (its first entry's later
occurrence), else at the first chapter-like heading that has body text, walking back
over immediately preceding coarser headings that have none (e.g. a lone PART above
CHAPTER I); a heading read from two lines needs a paragraph of at least 30 words
before the next heading of its own level or coarser, since a contents entry listed
that way is followed only by more entries; a contents list whose blurbs run to 30
words or more can still be taken for the story start. Back matter starts at a
marker heading or marker line ("FOOTNOTES:") near the end, or earlier at a
publisher's catalogue in the last tenth of the text; marks pointing into a cut notes
section go with it. All offsets are rebased onto the trimmed text. Skipped
(with a warning) if it would remove more than the cap."""

import re
from dataclasses import replace

from app import config
from app.core.ingest.model import PG_HEADER, Heading, Parsed, Stripped
from app.core.text import paragraph_spans, word_count

# Numerals for headings are uppercase Roman or Arabic only (never case-insensitive):
# a case-insensitive roman class would turn ordinary sentences starting with "I" or
# "Civil..." into false heading matches.
_NUMERAL = r"(?:[IVXLC]+|\d{1,3})"
_SPELLED = (
    r"(?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE"
    r"|FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH"
    r"|ELEVENTH|TWELFTH|LAST)"
)
_L1 = re.compile(
    r"^(?:(?i:PART|BOOK|VOLUME|ACT)\b[\s.:\-]*(?:(?i:THE)\s+)?"
    r"(?:" + _NUMERAL + r"|(?i:" + _SPELLED + r"))\b.*"
    # the ordinal first ("FIRST ACT") only in capitals and as the whole line
    r"|" + _SPELLED + r"\s+(?:PART|BOOK|VOLUME|ACT)\.?)$"
)
_CHAPTER_WORD = r"(?i:CHAPTER|CHAP\.|LETTER|STAVE)"
_L2 = re.compile(
    r"^(?:" + _CHAPTER_WORD + r"\s+\S.*"
    # a play's scenes are its chapters, under its acts; a scene needs its number and a
    # stop after it ("SCENE II. A Street."), or "Scene 1 was shot..." would be one
    r"|(?i:SCENE)\s+" + _NUMERAL + r"(?:[.:].*)?"
    r"|" + _NUMERAL + r"[.:]?(?:\s+[A-Z][^\n.!?,;]{0,58}\.?)?"
    r"|(?i:PROLOGUE|EPILOGUE|INTRODUCTION)\b.*"
    # "THE PROLOGUE" etc. as a standalone heading (no trailing text, unlike the bare
    # form above): a table-of-contents entry like "THE PROLOGUE." must not match here,
    # or the boilerplate stripper would treat that TOC line as the real heading.
    r"|(?i:THE)\s+(?i:PROLOGUE|EPILOGUE|INTRODUCTION))$"
)
# "THE END" only on its own: "THE END OF THE MANUSCRIPT" opens A Connecticut Yankee's closing
# frame.
_BACK = re.compile(
    r"^(THE END(?!\s+\w)|FINIS|APPENDI(X|CES)|GLOSSARY|NOTES|INDEX|AFTERWORD|ABOUT THE AUTHOR|"
    r"ALSO BY|ACKNOWLEDGE?MENTS|FOOTNOTES|TRANSCRIBER'?S? NOTES?)\b",
    re.I,
)
# Illustrated Gutenberg editions caption the contents page as an image.
_CONTENTS = re.compile(r"^(\[Illustration:\s*)?(TABLE OF )?CONTENTS\b", re.I)
# Listed parts that are front matter, not story, even when the contents opens with them.
_FRONT_ENTRY = re.compile(r"^(THE\s+)?(PREFACE|FOREWORD|DEDICATION)\b", re.I)
# Behind a Gutenberg header an editor's "INTRODUCTION" before CHAPTER I is front matter too,
# even headed like a chapter; a manuscript's "Introduction" is as often its opening chapter.
_GUTENBERG_FRONT = re.compile(r"^(THE\s+)?(PREFACE|FOREWORD|DEDICATION|INTRODUCTION)\b", re.I)
_NON_WORD = re.compile(r"[^0-9a-z]+")


def _body_words(text: str, start: int, end: int) -> int:
    """Word count of text[start:end] after the heading's own paragraph."""
    _, _, rest = text[start:end].partition("\n\n")
    return word_count(rest)


# Body words that separate a real frame narrative from a title repeated before a break
# marker; untuned.
_TITLE_REPEAT_MIN_WORDS = 20


def _story_start_heading(p: Parsed) -> Heading | None:
    """A level-3 heading repeating the work's own title, after a table of contents or a
    preface, with prose before the first chapter: some Gutenberg texts (e.g.
    The Turn of the Screw) head the opening prose -- a prologue or frame narrative -- with
    the title again instead of a chapter keyword, so it never reaches `chapter_like` on
    its own. When only a break follows the title and the opening has a titled heading of
    its own (A Connecticut Yankee's "A WORD OF EXPLANATION"), that heading is returned.
    Gated on the exact title match, a preceding contents listing or preface, and a
    paragraph of prose in the body: a bare title heading with nothing before it is an
    ordinary title page, a title repeated with only a break marker before the real first
    chapter is decoration (Treasure Island, Dracula), and one over a half-title, an
    imprint or a dedication is not a story opening."""
    if not p.title:
        return None
    norm_title = p.title.strip().casefold()
    seen = False  # a contents listing, or a preface (the title page is behind it)
    headings = p.headings
    for i, h in enumerate(headings):
        if h.level <= 2:
            continue
        title = h.title.strip()
        if _CONTENTS.match(title) or _FRONT_ENTRY.match(title):
            seen = True
        elif seen and title.casefold() == norm_title:
            end = next((x.start_cp for x in headings[i + 1 :] if x.level <= 2), len(p.text))
            # an opening has prose; a half-title, an imprint or a dedication does not
            paras = p.text[h.start_cp : end].split("\n\n")[1:]
            if not any(word_count(x) >= _PROSE_MIN_WORDS for x in paras):
                continue
            # The title over a break, then the opening's own heading: start at that heading.
            nxt = headings[i + 1] if i + 1 < len(headings) else h
            if nxt.level == 3 and _body_words(p.text, h.start_cp, nxt.start_cp) <= (
                _TITLE_REPEAT_MIN_WORDS
            ):
                return nxt
            return h
    return None


_ROMAN_VALUES = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def _roman_to_int(s: str) -> int | None:
    total, prev = 0, 0
    for ch in reversed(s.upper()):
        val = _ROMAN_VALUES.get(ch)
        if val is None:
            return None
        total += -val if val < prev else val
        prev = max(prev, val)
    return total or None


# A numbered entry (CHAPTER/CHAP./LETTER/PART/BOOK/VOLUME/ACT + a Roman or Arabic
# numeral), used only to tell a contents listing's own count (1, 2, 3, ...) from the
# real chapters restarting it -- see _contents_run_end.
_NUMBERED_ENTRY = re.compile(
    r"^(?i:CHAPTER|CHAP\.|LETTER|SCENE|PART|BOOK|VOLUME|ACT)\b[\s.:\-]*(?:(?i:THE)\s+)?"
    r"([IVXLC]+|\d{1,3})\b"
)


def entry_number(line: str) -> int | None:
    m = _NUMBERED_ENTRY.match(line)
    if not m:
        return None
    tok = m.group(1)
    return int(tok) if tok.isdigit() else _roman_to_int(tok)


def _lines_from(text: str, pos: int):
    """Yield (stripped_line, start_cp) for each non-blank physical line from pos."""
    n = len(text)
    while pos < n:
        end = text.find("\n", pos)
        if end == -1:
            end = n
        line = text[pos:end].strip()
        if line:
            yield line, pos
        pos = end + 1


def _contents_run_end(p: Parsed, chapter_like: list[Heading], old_start: int) -> int | None:
    """Where the story starts when the table of contents is a run of chapter-like lines
    (wrapped or packed) that `heading_candidates` cannot see whole: the entries count up
    and the first later entry that restarts the count is the real first chapter. Two
    guards: most of the run's entries must be missing from `chapter_like`, otherwise the
    listing was already seen whole; and `old_start` must fall at or before the run's
    last entry, otherwise the caller has already resolved this and must not be
    overridden."""
    contents = next((h for h in p.headings if _CONTENTS.match(h.title.strip())), None)
    if contents is None:
        return None
    text = p.text
    nl = text.find("\n", contents.start_cp)
    pos = nl + 1 if nl != -1 else len(text)
    marks = [
        (start, line)
        for line, start in _lines_from(text, pos)
        if _L1.match(line) or _L2.match(line)
    ]
    if len(marks) < 3:
        return None
    last_num = entry_number(marks[0][1])
    if last_num is None:
        return None
    run_end = 1
    while run_end < len(marks):
        num = entry_number(marks[run_end][1])
        if num is None or num <= last_num:
            break
        last_num = num
        run_end += 1
    if run_end < 3 or run_end >= len(marks):
        return None
    chapter_like_positions = {h.start_cp for h in chapter_like}
    missing = sum(1 for start, _ in marks[:run_end] if start not in chapter_like_positions)
    if missing <= run_end / 2:
        return None
    if old_start > marks[run_end - 1][0]:
        return None
    return marks[run_end][0]


def _key(s: str) -> str:
    """Case-, punctuation- and whitespace-insensitive form for matching a contents
    entry against the heading it names: "Stave I: Marley's Ghost" / "STAVE I:
    MARLEY'S GHOST", "THE PROLOGUE." / "THE PROLOGUE", "CHAPTER I. Down the
    Rabbit-Hole" / "CHAPTER I.\\nDown the Rabbit-Hole"."""
    return _NON_WORD.sub(" ", s.casefold()).strip()


def _contents_entry_start(
    text: str,
    spans: list[tuple[int, int]],
    contents: int,
    title: str | None,
    front: re.Pattern[str],
) -> int | None:
    """Where the story starts according to the table of contents at `contents`: the
    first later paragraph that repeats the first listed entry (or pair of short
    paragraphs -- Little Women heads a chapter "I." / "PLAYING PILGRIMS." where its
    contents says "I. PLAYING PILGRIMS"). Entries are the short physical lines after
    the Contents heading, up to the first line of prose, each also tried joined with
    the line after it (Treasure Island lists "PART ONE" / "The Old Buccaneer" and heads
    the part "PART ONE--The Old Buccaneer"); lines not starting with a letter or digit
    ("* * *", "--To My Readers--", "[Illustration: ...]"), `front` entries (a preface)
    and an entry naming the work's `title` (The Odyssey lists "THE ODYSSEY" above BOOK I)
    are passed over. None when no entry recurs
    (wrapped or page-numbered listings), leaving the heading rules to decide.
    Known limit: the scan runs on past the listing into the story's own leading headings
    when nothing matched; a heading there that recurs later (a second volume
    restarting at CHAPTER I) would over-strip, caught only by the size cap."""
    nl = text.find("\n", contents)
    if nl == -1:
        return None
    later = [(a, b) for a, b in spans if a > contents]
    keys = [_key(text[a:b]) for a, b in later]
    seen: dict[str, list[int]] = {}
    for i, (a, b) in enumerate(later):
        seen.setdefault(keys[i], []).append(a)
        if i + 1 < len(later) and b - a <= 60 and later[i + 1][1] - later[i + 1][0] <= 60:
            seen.setdefault(f"{keys[i]} {keys[i + 1]}", []).append(a)
    lines = list(_lines_from(text, nl + 1))
    title_key = _key(title) if title else None
    for i, (line, pos) in enumerate(lines):
        if len(line) > 60:
            return None
        if not line[0].isalnum() or front.match(line) or _key(line) == title_key:
            continue
        keys = [_key(line)]
        if i + 1 < len(lines):
            keys.append(_key(f"{line} {lines[i + 1][0]}"))
        hit = next((a for k in keys for a in seen.get(k, ()) if a > pos), None)
        if hit is not None:
            return hit
    return None


# Paragraph words that separate a chapter's opening from a contents entry or its blurb;
# untuned.
_PROSE_MIN_WORDS = 30


def _prose_follows(text: str, h: Heading, headings: list[Heading]) -> bool:
    """Whether a paragraph of at least _PROSE_MIN_WORDS words follows the heading before
    the next heading of its own level or coarser: a two-line contents entry has only
    more short entries or a one-line blurb after it, while a chapter's first paragraph,
    hard-wrapped or not, runs longer. Finer headings in between (a titled sub-heading
    under the first chapter) do not end the search."""
    end = next(
        (x.start_cp for x in headings if x.start_cp > h.start_cp and x.level <= h.level),
        len(text),
    )
    _, _, rest = text[h.start_cp : end].partition("\n\n")
    return any(word_count(para) >= _PROSE_MIN_WORDS for para in rest.split("\n\n"))


# A listing's page column header, or an entry ending in its page number.
_PAGE_HEADER = re.compile(r"PAGES?\.?", re.I)
_PAGE_ENTRY = re.compile(r".*\S\s+\d{1,3}")


def _listing_line(s: str) -> bool:
    s = s.strip()
    return short_line(s) and bool(
        _PAGE_HEADER.fullmatch(s) or (_PAGE_ENTRY.fullmatch(s) and not _NUMBERED_ENTRY.match(s))
    )


def _front_matter_end(
    text: str, chapter_like: list[Heading], headings: list[Heading], front: re.Pattern[str] | None
) -> int:
    chapter_like = [h for h in chapter_like if not (front and front.match(h.title))]
    if not chapter_like:
        return 0
    bounds = [h.start_cp for h in chapter_like[1:]] + [len(text)]
    bodies = [_body_words(text, h.start_cp, b) for h, b in zip(chapter_like, bounds, strict=True)]
    with_body = [
        i
        for i, (h, w) in enumerate(zip(chapter_like, bodies, strict=True))
        if (_prose_follows(text, h, headings) if h.joined else w >= 1)
    ]
    b_idx = with_body[0] if with_body else 0
    b_level = chapter_like[b_idx].level
    # Empty headings of its level counting up to it from 1 make it a listing's last entry (a
    # play's scenes listed "ACT I." to "ACT III.", the first-night cast after the last),
    # unless the next heading goes on with the count.
    n = entry_number(chapter_like[b_idx].title)
    nxt = next((i for i in with_body if i > b_idx), None)
    if (
        n
        and n > 1
        and b_idx >= n - 1
        and nxt is not None
        and all(
            chapter_like[b_idx - k].level == b_level
            and bodies[b_idx - k] == 0
            and entry_number(chapter_like[b_idx - k].title) == n - k
            for k in range(1, n)
        )
        and entry_number(chapter_like[nxt].title) != n + 1
    ):
        b_idx = nxt
        b_level = chapter_like[b_idx].level
    idx = b_idx
    while idx > 0 and chapter_like[idx - 1].level < b_level and bodies[idx - 1] == 0:
        idx -= 1
    return chapter_like[idx].start_cp


# What a publisher's list of other books carries, by kind: a price, a book format, a
# binding, a credit, an imprint.
_CATALOGUE = re.compile(
    r"(?P<price>\$\s?\d|\b\d+\s+cents\b)|(?P<format>\b(?:4|8|12|16|18|24|32)mo\b|\b[48]vo\b)"
    r"|(?P<binding>\bcloth\b)|(?P<credit>\bIllustrated by\b|\bby the same author\b)"
    r"|(?P<imprint>\bPublishers?\b)",
    re.I,
)
# Marker paragraphs a catalogue needs, and the most words between two of them; untuned
# beyond Little Women, whose catalogue has 55 markers never more than 56 words apart.
_CATALOGUE_MIN_MARKERS = 8
_CATALOGUE_GAP_WORDS = 100


def short_line(s: str) -> bool:
    s = s.strip()
    return "\n" not in s and len(s) <= 60


def _break_mark(s: str) -> bool:
    return short_line(s) and not any(c.isalnum() for c in s)


def _catalogue_heading(s: str) -> bool:
    """A break mark or a short line in capitals ("THE LITTLE WOMEN SERIES."), the kind
    of line that heads a catalogue; a signature line in title case is not one."""
    s = s.strip()
    return _break_mark(s) or (short_line(s) and s[0].isalnum() and s.isupper())


def _catalogue_start(text: str, spans: list[tuple[int, int]]) -> int | None:
    """Where a publisher's catalogue at the back of the book starts: the last run of
    paragraphs carrying a catalogue marker, each within _CATALOGUE_GAP_WORDS words of the
    next, at least _CATALOGUE_MIN_MARKERS long, naming a book format and at least one
    other kind of marker, and starting in the last tenth of the text, together with the
    headings and break marks just before it. After the run may come only short lines (an
    address) and then the end of the text or a back-matter heading such as transcriber's
    notes, which go with it. None otherwise, so a story whose ending
    mentions prices, cloth or a publisher, or a list of books inside the story, is
    untouched."""
    kinds = {
        i: k
        for i, (a, b) in enumerate(spans)
        if (k := {m.lastgroup for m in _CATALOGUE.finditer(text[a:b])})
    }
    marks = list(kinds)
    if len(marks) < _CATALOGUE_MIN_MARKERS:
        return None
    first = len(marks) - 1
    while (
        first > 0
        and word_count(text[spans[marks[first - 1]][1] : spans[marks[first]][0]])
        <= _CATALOGUE_GAP_WORDS
    ):
        first -= 1
    run_kinds = set().union(*(kinds[i] for i in marks[first:]))
    if len(marks) - first < _CATALOGUE_MIN_MARKERS or len(run_kinds) < 2:
        return None
    if "format" not in run_kinds:
        return None
    for a, b in spans[marks[-1] + 1 :]:
        line = text[a:b].strip().split("\n", 1)[0]
        if len(line) <= 60 and _BACK.match(line):
            break
        if "\n" in text[a:b].strip() or len(line) > 60:
            return None
    paras = [text[a:b] for a, b in spans]
    i = marks[first]
    while i > 0 and _catalogue_heading(paras[i - 1]):
        i -= 1
    # A short title-case line over the catalogue's capitals heading ("Louisa M. Alcott's
    # Writings") goes too, but only behind a break mark: a signature has prose above it.
    if 1 < i < marks[first] and short_line(paras[i - 1]) and _break_mark(paras[i - 2]):
        i -= 2
    start = spans[i][0]
    return start if start > 0.9 * len(text) else None


_NOTES_LINE = re.compile(r"(?:FOOT)?NOTES[.:]?|TRANSCRIBER'?S? NOTES?[.:]?", re.I)
_LABEL = re.compile(r"[\[{]\d{1,3}[a-z]?[\]}]")
# A note's label at the start of a paragraph: "[1] ...", "[454a] ...", "{287} ...".
_NOTE_LABEL = re.compile(r"(?:\A|\n\n)[\[{](\d{1,3}[a-z]?)[\]}]")


_BRACKET_MARK = re.compile(r"[ \t]?\[(\d{1,3}[a-z]?)\]|[ \t]\{(\d{1,3}[a-z]?)\}")
_GLUED_NUMBER = re.compile(r"(?<!\d)(\d{1,3}[a-z]?)(?!\w)")
# What a glued mark follows: a letter, a closing bracket or an italics mark ("courts].49",
# "_La savate!_26"), then at most a stop and a quote.
_GLUED_AFTER = re.compile(r"(?:[^\W\d_]|[\]_])(?:[.,;:!?'\")]|[.,;:!?]['\"])?\Z")


def _label_key(label: str) -> tuple[int, str]:
    digits = label.rstrip("abcdefghijklmnopqrstuvwxyz")
    return int(digits), label[len(digits) :]


def _note_marks(text: str, back: str) -> list[tuple[int, int]]:
    """Spans in `text` of the marks pointing at the notes labeled in the cut `back` matter:
    bracketed ("stang, [301]", "strong,[1]"), braced after a space (" {287}", not the
    subscript in "C_{2}"), or a bare number glued to a word, a bracket or an italics mark,
    after at most a stop and a quote ("East.1", "Byron5", "deluge.'1", "courts].49").
    Glued numbers count only in a book that marks its notes that way: no bracketed or
    braced mark in the text, glued numbers for at least half of the notes, strictly
    increasing in reading order; otherwise they are words ("No.1", "M25", "CO2") and stay."""
    labels = set(_NOTE_LABEL.findall(back))
    if not labels:
        return []
    marks = [m.span() for m in _BRACKET_MARK.finditer(text) if (m[1] or m[2]) in labels]
    glued = [
        m
        for m in _GLUED_NUMBER.finditer(text)
        if m[1] in labels and _GLUED_AFTER.search(text, max(0, m.start() - 3), m.start())
    ]
    keys = [_label_key(m[1]) for m in glued]
    if (
        not marks
        and 2 * len(glued) >= len(labels)
        and all(a < b for a, b in zip(keys, keys[1:], strict=False))
    ):
        marks = [m.span() for m in glued]
    return sorted(marks)


def strip_boilerplate(p: Parsed) -> Parsed:
    text, total = p.text, word_count(p.text)
    if total == 0:
        return p
    chapter_like = [h for h in p.headings if h.level <= 2]
    extra = _story_start_heading(p)
    if extra is not None:
        chapter_like = sorted([*chapter_like, extra], key=lambda h: h.start_cp)
    spans = paragraph_spans(text)
    contents = next((a for a, b in spans if _CONTENTS.match(text[a:b].strip())), None)
    # The work's title and an introduction count as front matter only in a Gutenberg text: a
    # manuscript's first chapter may carry the book's name or be its "Introduction".
    gutenberg = any(s.label == PG_HEADER for s in p.stripped)
    start = (
        None
        if contents is None
        else _contents_entry_start(
            text,
            spans,
            contents,
            p.title if gutenberg else None,
            _GUTENBERG_FRONT if gutenberg else _FRONT_ENTRY,
        )
    )
    if start is not None:
        if extra is not None and extra.start_cp < start:
            start = extra.start_cp
    elif contents is None and not gutenberg:
        start = 0
    else:
        start = _front_matter_end(
            text, chapter_like, p.headings, _GUTENBERG_FRONT if gutenberg else None
        )
        contents_run_end = _contents_run_end(p, chapter_like, start)
        if contents_run_end is not None and contents_run_end > start:
            start = contents_run_end
    if start and _PAGE_HEADER.fullmatch(text[start:].split("\n", 1)[0].strip()):
        # A start on a listing's page column header (Scarlet Letter's list of illustrations,
        # headed "PAGE" like its contents) moves past the listing and the breaks after it; a
        # line with prose under it is a heading ("Day 1"), not an entry.
        following = [(a, b) for a, b in spans if a >= start]
        for (a, b), (c, d) in zip(following, [*following[1:], (0, 0)], strict=True):
            if _break_mark(text[a:b]):
                continue
            if not _listing_line(text[a:b]) or word_count(text[c:d]) >= _PROSE_MIN_WORDS:
                start = a
                break
    end = len(text)
    # A notes heading with punctuation ("FOOTNOTES:", "Footnotes.") is no heading candidate;
    # it counts when a labeled note ("[1] ...", "{287} ...") follows it.
    markers = {
        a
        for (a, b), (c, _) in zip(spans, spans[1:], strict=False)
        if _NOTES_LINE.fullmatch(text[a:b].strip()) and _LABEL.match(text, c)
    }
    for a in sorted(markers | {h.start_cp for h in p.headings}):
        line = text[a:].split("\n", 1)[0]
        if a > 0.85 * len(text) and _BACK.match(line.strip()):
            end = a
            break
    if word_count(text[:start]) + word_count(text[end:]) > config.STRIP_MAX_FRACTION * total:
        return replace(p, warnings=[*p.warnings, "strip_skipped_over_15_percent"])
    # The catalogue's own last-tenth bound limits it, so it stays outside the cap: counted
    # in, it could cancel a front-matter strip, and preparing the result again would
    # then cut it.
    catalogue = _catalogue_start(text, spans)
    if catalogue is not None:
        end = min(end, catalogue)
    removed = word_count(text[:start]) + word_count(text[end:])
    if removed == 0:
        return p
    stripped = list(p.stripped)
    if start:
        stripped.append(Stripped("front matter", word_count(text[:start])))
    if end < len(text):
        stripped.append(Stripped("back matter", word_count(text[end:])))
    new = text[start:end].strip()
    shift = start + (len(text[start:end]) - len(text[start:end].lstrip()))
    marks = _note_marks(new, text[end:])
    keep = zip([(0, 0), *marks], [*marks, (len(new), 0)], strict=True)
    new = "".join(new[b:a] for (_, b), (a, _) in keep)

    def rebase(cp: int) -> int:
        cp -= shift
        return cp - sum(b - a for a, b in marks if b <= cp)

    kept_headings = [
        replace(h, start_cp=rebase(h.start_cp)) for h in p.headings if start <= h.start_cp < end
    ]
    kept_breaks = [rebase(b) for b in p.breaks if start <= b < end]
    return replace(
        p,
        text=new,
        headings=kept_headings,
        breaks=kept_breaks,
        stripped=stripped,
    )
