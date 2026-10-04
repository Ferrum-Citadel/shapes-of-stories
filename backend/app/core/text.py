"""Normalization, word counting, paragraphs, sentences. Pure functions, code-point offsets."""

import re
import unicodedata

import charset_normalizer
import sentencex

from app import config

_QUOTES = str.maketrans(
    {
        "‘": "'",
        "’": "'",
        "‚": "'",
        "“": '"',
        "”": '"',
        "„": '"',
        "–": "-",
        "—": "-",
        "‒": "-",
        " ": " ",
    }
)
_BLANKS = re.compile(r"\n[ \t]*\n(?:[ \t]*\n)*")  # 2+ newlines → paragraph break
# newline (plus any indentation) followed by lowercase → space; the indentation must
# be consumed here, not stripped later, or a second pass would join what the first
# left alone.
_HARD_WRAP = re.compile(r"(?<=[^\n])\n[ \t]*(?=[a-z])")
_SPACES = re.compile(r"[ \t\f\v]+")


def decode(data: bytes) -> str:
    # Try strict UTF-8 first: charset-normalizer can misdetect short UTF-8 input.
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        pass
    match = charset_normalizer.from_bytes(data).best()
    if match is not None:
        return str(match)
    return data.decode("utf-8-sig", errors="replace")


def normalize(raw: str) -> str:
    t = unicodedata.normalize("NFC", raw).translate(_QUOTES)
    t = t.replace("\r\n", "\n").replace("\r", "\n")
    t = _BLANKS.sub("\n\n", t)
    t = _HARD_WRAP.sub(" ", t)
    t = _SPACES.sub(" ", t)
    t = "\n".join(line.strip() for line in t.split("\n"))
    return t.strip()


def word_count(text: str) -> int:
    return len(text.split())


def words_in(text: str, start: int, end: int) -> int:
    return word_count(text[start:end])


def paragraph_spans(text: str) -> list[tuple[int, int]]:
    spans, pos = [], 0
    for chunk in text.split("\n\n"):
        end = pos + len(chunk)
        if chunk.strip():
            spans.append((pos, end))
        pos = end + 2
    return spans


def passage_paragraph_spans(text: str, start: int, end: int) -> list[tuple[int, int]]:
    """The paragraphs of text[start:end], cut to it, since a passage may start or end inside a
    paragraph; the frontend's paragraphsOf splits a passage the same way."""
    return [(start + a, start + b) for a, b in paragraph_spans(text[start:end])]


CHUNK_MIN_WORDS = 80


def driver_chunks(text: str, spans: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Group a beat's paragraphs (code-point spans, in order) into consecutive chunks of at
    least CHUNK_MIN_WORDS words, as inclusive (first, last) paragraph-index pairs. Paragraphs
    merge forward until the chunk is long enough; a paragraph long enough by itself is its own
    chunk (shorter ones waiting before it fold into the previous chunk, or into it when the beat
    opens with them); a trailing remainder folds into the previous chunk; a beat shorter than
    the minimum is one chunk."""
    chunks: list[tuple[int, int]] = []
    start = words = 0
    for i, (a, b) in enumerate(spans):
        w = words_in(text, a, b)
        if w >= CHUNK_MIN_WORDS and words and chunks:
            chunks[-1] = (chunks[-1][0], i - 1)
            start, words = i, 0
        words += w
        if words >= CHUNK_MIN_WORDS:
            chunks.append((start, i))
            start, words = i + 1, 0
    if start < len(spans):
        if chunks:
            chunks[-1] = (chunks[-1][0], len(spans) - 1)
        else:
            chunks.append((start, len(spans) - 1))
    return chunks


def chunk_texts(
    text: str, spans: list[tuple[int, int]], chunks: list[tuple[int, int]]
) -> list[str]:
    return [text[spans[a][0] : spans[b][1]] for a, b in chunks]


def sentence_spans(text: str, start: int, end: int) -> list[tuple[int, int]]:
    seg = text[start:end]
    spans, pos = [], 0
    for sentence in sentencex.segment("en", seg):
        s = sentence.strip()
        if not s:
            continue
        i = seg.find(s, pos)
        if i == -1:
            continue
        spans.append((start + i, start + i + len(s)))
        pos = i + len(s)
    return spans


def tail(text: str, start: int, end: int, max_words: int = config.TAIL_MAX_WORDS) -> str:
    sents = sentence_spans(text, start, end)
    if not sents:
        return ""
    picked: list[tuple[int, int]] = []
    for a, b in reversed(sents):
        candidate = [(a, b)] + picked
        span_words = word_count(text[candidate[0][0] : candidate[-1][1]])
        if len(picked) >= 2 and span_words > max_words:
            break
        if len(picked) >= 4:
            break
        picked = candidate
    while len(picked) > 1 and word_count(text[picked[0][0] : picked[-1][1]]) > max_words:
        picked = picked[1:]
    return text[picked[0][0] : picked[-1][1]].strip()
