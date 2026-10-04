from dataclasses import dataclass, field
from typing import Literal

Format = Literal["txt", "markdown", "epub", "docx", "fountain", "srt", "vtt"]


@dataclass
class Heading:
    level: int  # 1 = PART/BOOK/ACT, 2 = CHAPTER/scene, 3 = short titled line
    title: str
    start_cp: int
    joined: bool = False  # keyword line and title read from two consecutive lines


@dataclass
class Cue:
    start_s: float
    end_s: float
    start_cp: int
    end_cp: int


@dataclass
class Stripped:
    label: str
    word_count: int


# The header label also tells the later rules that a text is a Gutenberg one.
PG_HEADER = "Project Gutenberg header"
PG_FOOTER = "Project Gutenberg footer"


@dataclass
class Parsed:
    text: str  # normalized text; every offset points into this
    format: Format
    title: str | None = None
    author: str | None = None
    headings: list[Heading] = field(default_factory=list)
    cues: list[Cue] | None = None  # transcripts only
    breaks: list[int] = field(default_factory=list)  # cp of paragraph after an explicit break
    stripped: list[Stripped] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
