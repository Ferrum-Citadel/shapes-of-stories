import re

from app.core.ingest.model import Heading, Parsed
from app.core.text import decode, normalize

_SCENE = re.compile(r"^(INT|EXT|EST|INT\./EXT|INT/EXT|I/E)[. ]", re.I)
_TRANSITION = re.compile(r"^(>.*|[A-Z ]+TO:)$")
_CUE = re.compile(r"^@?([A-Z](?:[A-Z0-9 .'\-]*[A-Z0-9'])?)(\s*\(.*\))?\s*\^?$")
_TITLE_KV = re.compile(r"^([A-Za-z ]+):\s*(.*)$")


def parse_fountain(data: bytes) -> Parsed:
    raw = decode(data).replace("\r\n", "\n")
    raw = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
    raw = re.sub(r"\[\[.*?\]\]", "", raw, flags=re.S)
    blocks = [b.strip("\n") for b in re.split(r"\n[ \t]*\n", raw)]
    blocks = [b for b in blocks if b.strip()]
    title = author = None
    if blocks and all(
        _TITLE_KV.match(line) for line in blocks[0].split("\n") if line.strip()
    ):
        for line in blocks[0].split("\n"):
            k, v = _TITLE_KV.match(line).groups()
            if k.strip().lower() == "title":
                title = v.strip()
            if k.strip().lower() in ("author", "authors", "written by"):
                author = v.strip()
        blocks = blocks[1:]
    parts, headings, breaks, pos, pending_break = [], [], [], 0, False

    def emit(text: str, level: int | None = None):
        nonlocal pos, pending_break
        text = normalize(text)
        if not text:
            return
        if level:
            headings.append(Heading(level, text, pos))
        if pending_break:
            breaks.append(pos)
            pending_break = False
        parts.append(text)
        pos += len(text) + 2

    for b in blocks:
        lines = [ln.rstrip() for ln in b.split("\n") if ln.strip()]
        if not lines:
            continue
        first = lines[0].strip()
        if first == "===":
            pending_break = True
            continue
        if first.startswith("#"):
            emit(first.lstrip("#").strip(), level=1)
            continue
        if first.startswith("="):
            continue  # synopsis
        if first.startswith(".") and not first.startswith(".."):
            emit(first[1:], level=2)
            continue
        if _SCENE.match(first):
            emit(first, level=2)
            continue
        if _TRANSITION.match(first) and len(lines) == 1 and not first.endswith("<"):
            continue
        if first.startswith("!"):
            emit(" ".join(lines)[1:])
            continue
        m = _CUE.match(first)
        if m and len(lines) > 1 and first.upper() == first:
            name = m.group(1).strip()
            speech = " ".join(
                ln.strip() for ln in lines[1:] if not ln.strip().startswith("(")
            )
            emit(f"{name}: {speech}")
            continue
        emit(" ".join(ln.strip().strip("~").strip("><") for ln in lines))
    return Parsed(
        text="\n\n".join(parts),
        format="fountain",
        title=title,
        author=author,
        headings=headings,
        breaks=breaks,
    )
