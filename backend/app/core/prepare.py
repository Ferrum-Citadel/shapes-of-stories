import hashlib
from dataclasses import dataclass

from app.core.errors import IngestError
from app.core.estimate import Estimate, check_caps, estimate
from app.core.ingest import Parsed, parse
from app.core.language import english_ratio, is_english
from app.core.structure import Structure, build_structure


@dataclass
class Prepared:
    parsed: Parsed
    structure: Structure
    estimate: Estimate
    content_hash: str
    english: bool


def prepare(data: bytes, filename: str | None = None, *, enforce_english: bool = True) -> Prepared:
    check_caps(0, len(data))
    parsed = parse(data, filename)
    structure = build_structure(parsed)
    check_caps(structure.word_count, len(data))
    pr = Prepared(
        parsed,
        structure,
        estimate(structure.word_count, len(structure.beats)),
        hashlib.sha256(parsed.text.encode()).hexdigest(),
        is_english(parsed.text),
    )
    if enforce_english and not pr.english:
        raise IngestError("not_english", ratio=round(english_ratio(parsed.text), 3))
    return pr
