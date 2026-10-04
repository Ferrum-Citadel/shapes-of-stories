"""English gate by function-word ratio (stdlib heuristic)."""
import re

from app import config

_FUNCTION_WORDS = frozenset(
    (
        "the of and to a in that is was he for it with as his on be at by i this had "
        "not are but from or have an they which one you were her all she there would "
        "their we him been has when who will more no if out so said what up its about "
        "into than them can only other new some could time these two may then do first "
        "any my now such like our over man me even most made after also did many before "
        "must through back years where much your way well down should because each just "
        "those people mr how too little state good very make world still own see men "
        "work long get here between both life being under never day same another know "
        "while last might us great old year off come since against go came right used "
        "take three thou thee thy hath doth art ye shall upon"
    ).split()
)
_WORD = re.compile(r"[a-z']+")


def english_ratio(text: str) -> float:
    words = text.split()[: config.LANGUAGE_SAMPLE_WORDS]
    if not words:
        return 0.0
    stripped = (w.lower().strip(".,;:!?\"()") for w in words)
    hits = sum(1 for w in stripped if _WORD.fullmatch(w) and w in _FUNCTION_WORDS)
    return hits / len(words)


def is_english(text: str) -> bool:
    return english_ratio(text) >= config.ENGLISH_MIN_RATIO
