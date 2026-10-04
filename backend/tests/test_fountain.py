import pytest

from app.core.errors import IngestError
from app.core.ingest import parse

SCRIPT = """Title: The Thing
Author: S. Writer

# ACT ONE

INT. KITCHEN - DAY

Mary pours coffee. /* boneyard */ She sits.

MARY
(quietly)
I can't do this.

JOHN (V.O.)
You already did.

CUT TO:

EXT. STREET - NIGHT

[[note to self]] Rain. Cars pass.

===

.FLASHBACK - THE BEACH

Waves.
"""

def test_fountain_structure():
    p = parse(SCRIPT.encode(), "t.fountain")
    assert p.title == "The Thing" and p.author == "S. Writer"
    assert [(h.level, h.title) for h in p.headings] == [
        (1, "ACT ONE"),
        (2, "INT. KITCHEN - DAY"),
        (2, "EXT. STREET - NIGHT"),
        (2, "FLASHBACK - THE BEACH"),
    ]
    paras = p.text.split("\n\n")
    assert "MARY: I can't do this." in paras and "JOHN: You already did." in paras
    assert "CUT TO:" not in p.text and "boneyard" not in p.text and "note to self" not in p.text
    assert "(quietly)" not in p.text
    assert len(p.breaks) == 1 and p.text[p.breaks[0]:].startswith("FLASHBACK")


def test_leading_blank_line_and_empty_file():
    assert parse(("\n\n" + SCRIPT).encode(), "t.fountain").title == "The Thing"
    with pytest.raises(IngestError) as e:
        parse(b"\n\n  \n", "e.fountain")
    assert e.value.code == "empty_text"


def test_all_caps_action_is_not_a_cue():
    data = b"INT. ROOM - DAY\n\nBANG.\nHe ducks.\n"
    p = parse(data, "b.fountain")
    paras = p.text.split("\n\n")
    assert "BANG. He ducks." in paras
    assert not any(": He ducks" in para for para in paras)


def test_centered_text_is_kept():
    data = b"INT. ROOM - DAY\n\n> THE END <\n"
    p = parse(data, "c.fountain")
    assert "THE END" in p.text.split("\n\n")
