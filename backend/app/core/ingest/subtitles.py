import io
import re

import srt
import webvtt
from webvtt.errors import MalformedCaptionError, MalformedFileError

from app import config
from app.core.errors import IngestError
from app.core.ingest.model import Cue, Heading, Parsed
from app.core.text import decode, normalize

_TIME = re.compile(
    r"(?:(\d+):)?(\d\d):(\d\d)[.,](\d{3})\s*-->\s*(?:(\d+):)?(\d\d):(\d\d)[.,](\d{3})"
)
_TAG = re.compile(r"<(?!v\b)[^>]+>")
_VOICE = re.compile(r"<v(?:\.[\w-]+)*\s+([^>]+)>")
_NOTE_CHAPTER = re.compile(r"^NOTE\s+Chapter:\s*(.+)$", re.I | re.M)
_TS = re.compile(r"(?:(\d+):)?(\d\d):(\d\d)[.,](\d{3})")


def _secs(h, m, s, ms) -> float:
    return int(h or 0) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000


def _hms(s: str) -> float:
    """Seconds from a webvtt-py caption's "HH:MM:SS.mmm" string; more precise than
    Caption.start_in_seconds/end_in_seconds, which truncate to whole seconds."""
    return _secs(*_TS.match(s).groups())


def parse_srt(data: bytes) -> Parsed:
    text = decode(data)
    try:
        subs = list(srt.parse(text, ignore_errors=False))
    except Exception:
        raise IngestError("corrupt_file", reason="srt") from None
    parts, cues, breaks, pos, prev_end = [], [], [], 0, None
    for sub in subs:
        start, end = sub.start.total_seconds(), sub.end.total_seconds()
        body = _VOICE.sub(lambda v: f"{v.group(1).strip()}: ", sub.content)
        text_ = normalize(_TAG.sub("", body))
        if not text_:
            continue
        if prev_end is not None and start - prev_end > config.SILENCE_BREAK_S:
            breaks.append(pos)
        cues.append(Cue(start, end, pos, pos + len(text_)))
        parts.append(text_)
        pos += len(text_) + 2
        prev_end = end
    return Parsed(text="\n\n".join(parts), format="srt", cues=cues, breaks=breaks)


def parse_vtt(data: bytes) -> Parsed:
    text = decode(data)
    chapters = {}
    for note in _NOTE_CHAPTER.finditer(text):
        t = _TIME.search(text, note.end())
        if t:
            chapters.setdefault(_secs(*t.groups()[:4]), note.group(1).strip())
    try:
        vtt = webvtt.from_buffer(io.StringIO(text))
    except MalformedFileError, MalformedCaptionError:
        raise IngestError("corrupt_file", reason="vtt") from None
    parts, cues, breaks, headings, pos, prev_end = [], [], [], [], 0, None
    for cap in vtt.captions:
        start, end = _hms(cap.start), _hms(cap.end)
        body = f"{cap.voice}: {cap.text}" if cap.voice else cap.text
        text_ = normalize(body)
        if not text_:
            continue
        if start in chapters:
            headings.append(Heading(2, chapters.pop(start), pos))
        if prev_end is not None and start - prev_end > config.SILENCE_BREAK_S:
            breaks.append(pos)
        cues.append(Cue(start, end, pos, pos + len(text_)))
        parts.append(text_)
        pos += len(text_) + 2
        prev_end = end
    return Parsed(
        text="\n\n".join(parts), format="vtt", headings=headings, cues=cues, breaks=breaks
    )
