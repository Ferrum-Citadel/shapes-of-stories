"""Chapters, sections, beats. Pure functions over Parsed."""

import re
from collections import Counter
from dataclasses import dataclass, replace

from app import config
from app.core.ingest.boilerplate import entry_number, short_line
from app.core.ingest.model import Parsed
from app.core.ingest.txt import BREAK, FIRST_CHAPTER
from app.core.text import paragraph_spans, words_in


@dataclass
class Section:
    idx: int
    title: str
    start_cp: int
    end_cp: int


@dataclass
class Chapter:
    idx: int
    title: str
    start_cp: int
    end_cp: int
    section_idx: int | None = None


def _mmss(s: float) -> str:
    return f"{int(s // 60):02d}:{int(s % 60):02d}"


def resolve_chapters(p: Parsed) -> tuple[list[Section], list[Chapter], str]:
    n = len(p.text)
    if p.cues:
        total = p.cues[-1].end_s
        chapters = []
        for i in range(10):
            lo, hi = total * i / 10, total * (i + 1) / 10
            cs = [c for c in p.cues if lo <= c.start_s < hi]
            if not cs:
                continue
            chapters.append(Chapter(len(chapters), f"{_mmss(lo)}–{_mmss(hi)}", cs[0].start_cp, n))
        for a, b in zip(chapters, chapters[1:], strict=False):
            a.end_cp = b.start_cp
        if chapters:
            chapters[-1].end_cp = n
        return [], chapters, "time"
    counts = Counter(h.level for h in p.headings)
    # finest level with >= 3 occurrences whose count is at least every coarser level's.
    chapter_level = next(
        (
            lvl
            for lvl in (3, 2, 1)
            if counts[lvl] >= 3 and all(counts[lvl] >= counts[c] for c in range(1, lvl))
        ),
        None,
    )
    if chapter_level is None:
        starts = [a for a, _ in paragraph_spans(p.text)]
        bounds = (
            [0] + [next((a for a in starts if a >= n * i // 10), n) for i in range(1, 10)] + [n]
        )
        chapters = []
        for i in range(10):
            if bounds[i] < bounds[i + 1]:
                start, end = bounds[i], bounds[i + 1]
                chapters.append(
                    Chapter(len(chapters), f"{start * 100 // n}–{end * 100 // n}%", start, end)
                )
        return [], chapters, "deciles"
    heads = sorted(p.headings, key=lambda h: h.start_cp)
    # an unnumbered chapter heading with nothing of its own over a first chapter (an
    # EPILOGUE over its chapters I and II) heads a section
    for i, (h, nxt) in enumerate(zip(heads, heads[1:], strict=False)):
        own = p.text[h.start_cp : nxt.start_cp].partition("\n\n")[2].strip()
        if (
            h.level == nxt.level == chapter_level
            and FIRST_CHAPTER.match(nxt.title)
            and (not own or BREAK.match(own))
            and entry_number(h.title) is None
        ):
            heads[i] = replace(h, level=chapter_level - 1)
    sec_heads = [h for h in heads if h.level < chapter_level]
    ch_heads = [h for h in heads if h.level == chapter_level]
    sections = [
        Section(
            i,
            h.title[: config.CHAPTER_TITLE_MAX],
            h.start_cp,
            sec_heads[i + 1].start_cp if i + 1 < len(sec_heads) else n,
        )
        for i, h in enumerate(sec_heads)
    ]
    chapters: list[Chapter] = []
    pre = ch_heads[0].start_cp
    sec_starts = {h.start_cp for h in sec_heads}
    spans = paragraph_spans(p.text[:pre])
    prose = sum(
        words_in(p.text, a, b)
        for i, (a, b) in enumerate(spans)
        if a not in sec_starts
        and not BREAK.match(p.text[a:b].strip())
        # a section's subtitle line ("BOOK FIRST" / "BOY AND GIRL.") is not prose
        and not (i and spans[i - 1][0] in sec_starts and short_line(p.text[a:b]))
    )
    if prose > 0:
        chapters.append(Chapter(0, "Opening", 0, pre))
    for i, h in enumerate(ch_heads):
        end = ch_heads[i + 1].start_cp if i + 1 < len(ch_heads) else n
        sec = next((s.idx for s in reversed(sections) if s.start_cp <= h.start_cp), None)
        chapters.append(
            Chapter(len(chapters), h.title[: config.CHAPTER_TITLE_MAX], h.start_cp, end, sec)
        )
    # a section heading sitting between chapters belongs to the following chapter
    for a, b in zip(chapters, chapters[1:], strict=False):
        a.end_cp = b.start_cp
    return sections, chapters, "headings"


@dataclass
class Beat:
    idx: int
    chapter_idx: int
    start_cp: int
    end_cp: int
    word_count: int
    start_s: float | None = None
    end_s: float | None = None


@dataclass
class Structure:
    sections: list[Section]
    chapters: list[Chapter]
    beats: list[Beat]
    chapter_source: str
    preset: str
    word_count: int


def structure_from_json(d: dict) -> Structure:
    return Structure(
        sections=[Section(**x) for x in d["sections"]],
        chapters=[Chapter(**x) for x in d["chapters"]],
        beats=[Beat(**x) for x in d["beats"]],
        chapter_source=d["chapter_source"],
        preset=d["preset"],
        word_count=d["word_count"],
    )


def _groups(
    text: str, chapters: list[Chapter], breaks: list[int]
) -> list[tuple[int, list[tuple[int, int]]]]:
    """Split paragraphs into (chapter_idx, spans) groups at chapter starts and breaks."""
    cuts = sorted({c.start_cp for c in chapters} | set(breaks))
    groups: list[tuple[int, list[tuple[int, int]]]] = []
    cur: list[tuple[int, int]] = []
    cur_ch = 0
    ch_iter = iter(chapters)
    ch = next(ch_iter, None)
    for a, b in paragraph_spans(text):
        while ch is not None and a >= ch.end_cp and (nxt := next(ch_iter, None)) is not None:
            ch = nxt
        this_ch = ch.idx if ch else 0
        if cur and (a in cuts or this_ch != cur_ch):
            groups.append((cur_ch, cur))
            cur = []
        cur.append((a, b))
        cur_ch = this_ch
    if cur:
        groups.append((cur_ch, cur))
    return groups


# A word ending in . ! or ? (closing quotes allowed) ends a sentence; this also takes "Mr." for
# one, which only moves a passage boundary.
_SENTENCE_END = re.compile(r"[.!?]['\")_]*$")


def _split(text: str, a: int, b: int, hi: int) -> list[tuple[int, int]]:
    """Cut a paragraph into pieces of at most hi words at sentence ends, as few and as even as
    those allow: one more piece when the cut for the fewest would fall inside a sentence and a
    sentence end lies at least half that piece's even share in, else a cut at a space."""
    words = [(m.start() + a, m.end() + a) for m in re.finditer(r"\S+", text[a:b])]
    pieces, i = [], 0
    while len(words) - i > hi:
        rest = len(words) - i
        parts = -(-rest // hi)
        sizes = range(rest - (parts - 1) * hi, hi + 1)  # what leaves the rest fitting parts - 1
        ends = [n for n in sizes if _SENTENCE_END.search(text, *words[i + n - 1])]
        if not ends and (
            more := [
                n
                for n in range(max(1, rest // (parts + 1) // 2), hi + 1)
                if _SENTENCE_END.search(text, *words[i + n - 1])
            ]
        ):
            parts, ends = parts + 1, more
        n = min(ends or sizes, key=lambda k: abs(k - rest / parts))
        pieces.append((words[i][0], words[i + n - 1][1]))
        i += n
    return pieces + [(words[i][0], words[-1][1])]


def _pieces(text, paras, cut) -> list[tuple[int, int]]:
    return [
        p
        for a, b in paras
        for p in (_split(text, a, b, cut) if words_in(text, a, b) > cut else [(a, b)])
    ]


def _pack_group(text, paras, target, lo, hi, cut) -> list[list[tuple[int, int]]]:
    beats: list[list[tuple[int, int]]] = []
    cur: list[tuple[int, int]] = []
    cur_w = 0
    pieces = _pieces(text, paras, cut)
    for a, b in pieces:
        w = words_in(text, a, b)
        if cur and (cur_w >= target or (cur_w + w > hi and cur_w >= lo)):
            beats.append(cur)
            cur, cur_w = [], 0
        cur.append((a, b))
        cur_w += w
    if cur:
        if beats and cur_w < lo:
            beats[-1].extend(cur)
        else:
            beats.append(cur)
    return beats


def _pack(text, chapters, breaks, target, lo, hi, cut=None) -> list[Beat]:
    raw: list[tuple[int, list[tuple[int, int]]]] = []  # (chapter_idx, spans of one beat)
    carry: list[tuple[int, int]] = []  # tiny group waiting to merge forward
    for ch_idx, paras in _groups(text, chapters, breaks):
        paras = carry + paras
        carry = []
        total = sum(words_in(text, a, b) for a, b in paras)
        if total < lo:
            if total >= config.GROUP_FLOOR:
                raw.append((ch_idx, paras))
            else:
                carry = paras
            continue
        for beat_paras in _pack_group(text, paras, target, lo, hi, cut or hi):
            raw.append((ch_idx, beat_paras))
    if carry:
        if raw:
            raw[-1] = (raw[-1][0], raw[-1][1] + carry)
        else:
            raw.append((chapters[0].idx if chapters else 0, carry))
    return [
        Beat(i, ch, ps[0][0], ps[-1][1], words_in(text, ps[0][0], ps[-1][1]))
        for i, (ch, ps) in enumerate(raw)
    ]


def pack_prose(text: str, chapters: list[Chapter], breaks: list[int]) -> list[Beat]:
    total = words_in(text, 0, len(text))
    if total < config.SHORT_WORK_WORDS:
        target = config.SHORT_BEAT_TARGET
        cut = target * 3 // 2
        beats = _pack(text, chapters, breaks, target, target * 5 // 8, cut)
        # the re-pack toward MIN_BEATS moves whole pieces; it never cuts below the first maximum
        pieces = _pieces(text, paragraph_spans(text), cut)
        if len(beats) < config.MIN_BEATS and len(pieces) >= config.MIN_BEATS:
            target = total // config.MIN_BEATS
            while len(beats) < config.MIN_BEATS and target >= 50:
                lo, hi = max(1, target * 3 // 5), target * 3 // 2
                beats = _pack(text, chapters, breaks, target, lo, hi, cut)
                target = target * 3 // 4
        return beats
    return _pack(text, chapters, breaks, config.BEAT_TARGET, config.BEAT_MIN, config.BEAT_MAX)


def pack_scenes(text: str, chapters: list[Chapter], headings, breaks: list[int]) -> list[Beat]:
    starts = sorted({h.start_cp for h in headings if h.level == 2}) or [0]
    if starts[0] != 0:
        starts.insert(0, 0)
    scenes = [
        (a, starts[i + 1] if i + 1 < len(starts) else len(text)) for i, a in enumerate(starts)
    ]
    merged: list[tuple[int, int]] = []
    carry = None
    for a, b in scenes:
        if carry is not None:
            a = carry
            carry = None
        if words_in(text, a, b) < config.SCENE_MERGE_WORDS:
            carry = a
            continue
        merged.append((a, b))
    if carry is not None:
        if merged:
            merged[-1] = (merged[-1][0], len(text))
        else:
            merged.append((carry, len(text)))
    beats = []
    for a, b in merged:
        ch = next((c.idx for c in reversed(chapters) if c.start_cp <= a), 0)
        if words_in(text, a, b) > config.BEAT_MAX:
            scene_breaks = [br - a for br in breaks if a < br < b]
            sub = _pack(
                text[a:b],
                [Chapter(ch, "", 0, b - a)],
                scene_breaks,
                config.BEAT_TARGET,
                config.BEAT_MIN,
                config.BEAT_MAX,
            )
            beats += [
                Beat(
                    0,
                    next((c.idx for c in reversed(chapters) if c.start_cp <= s.start_cp + a), 0),
                    s.start_cp + a,
                    s.end_cp + a,
                    s.word_count,
                )
                for s in sub
            ]
        else:
            beats.append(Beat(0, ch, a, b, words_in(text, a, b)))
    for i, bt in enumerate(beats):
        bt.idx = i
    for bt in beats:
        while text[bt.start_cp].isspace():
            bt.start_cp += 1
        while text[bt.end_cp - 1].isspace():
            bt.end_cp -= 1
    return beats


def pack_time(text: str, chapters: list[Chapter], cues, breaks: list[int]) -> list[Beat]:
    beats: list[Beat] = []
    cur: list = []

    def flush():
        if not cur:
            return
        ch = next((c.idx for c in reversed(chapters) if c.start_cp <= cur[0].start_cp), 0)
        beats.append(
            Beat(
                len(beats),
                ch,
                cur[0].start_cp,
                cur[-1].end_cp,
                words_in(text, cur[0].start_cp, cur[-1].end_cp),
                cur[0].start_s,
                cur[-1].end_s,
            )
        )

    for c in cues:
        dur = (c.end_s - cur[0].start_s) if cur else 0
        if cur and (c.start_cp in breaks or dur >= config.TRANSCRIPT_TARGET_S):
            flush()
            cur = []
        cur.append(c)
    if (
        cur
        and beats
        and (cur[-1].end_s - cur[0].start_s) < config.TRANSCRIPT_MIN_S
        and cur[0].start_cp not in breaks
    ):
        last = beats.pop()
        cur = [c for c in cues if last.start_cp <= c.start_cp]
        flush()
    else:
        flush()
    return beats


def build_structure(p: Parsed) -> Structure:
    sections, chapters, source = resolve_chapters(p)
    if p.format == "fountain":
        beats, preset = pack_scenes(p.text, chapters, p.headings, p.breaks), "screenplay"
    elif p.cues:
        beats, preset = pack_time(p.text, chapters, p.cues, p.breaks), "transcript"
    else:
        beats, preset = pack_prose(p.text, chapters, p.breaks), "prose"
    wc = words_in(p.text, 0, len(p.text))
    return Structure(sections, chapters, beats, source, preset, wc)
