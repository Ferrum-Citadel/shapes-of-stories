import time

import pytest

from app.core.errors import IngestError
from app.core.ingest import parse
from app.core.ingest.txt import heading_candidates, typographic_breaks
from tests.conftest import big, gutenberg_wrap

BODY = (
    "PART I\n\nCHAPTER I\n\nIt was a day. "
    "Sentence two.\n\n* * *\n\nAfter the break.\n\nCHAPTER II\n\nMore text here."
)


def test_gutenberg_markers_and_metadata_are_stripped_and_recorded():
    p = parse(gutenberg_wrap(BODY).encode(), "book.txt")
    assert p.text.startswith("PART I")
    assert p.text.endswith("More text here.")
    assert p.title == "Test Book" and p.author == "A. Writer"
    labels = [s.label for s in p.stripped]
    assert "Project Gutenberg header" in labels and "Project Gutenberg footer" in labels


def test_older_gutenberg_closing_line_is_stripped():
    # A Little Princess closes with this line before the "*** END" marker.
    body = BODY + "\n\nEnd of Project Gutenberg's A Little Princess, by Frances Hodgson Burnett"
    p = parse(gutenberg_wrap(body).encode(), "book.txt")
    assert p.text.endswith("More text here.")


def test_heading_candidates_levels():
    text = "PART I\n\nCHAPTER I\n\nText.\n\nII.\n\nText.\n\nEPILOGUE\n\nText."
    hs = heading_candidates(text)
    assert [(h.level, h.title) for h in hs] == [
        (1, "PART I"),
        (2, "CHAPTER I"),
        (2, "II."),
        (2, "EPILOGUE"),
    ]


def test_short_titled_line_is_level_3_but_dialogue_is_not():
    text = 'The Storm\n\nIt rained.\n\n"No!"\n\nHe left.'
    hs = heading_candidates(text)
    assert [(h.level, h.title) for h in hs] == [(3, "The Storm")]


def test_titled_line_may_hold_an_honorific_or_a_possessive():
    # The Strange Case of Dr Jekyll and Mr Hyde titles chapters "SEARCH FOR MR. HYDE" and
    # "DR. LANYON'S NARRATIVE".
    text = (
        "SEARCH FOR MR. HYDE\n\nIt rained.\n\nDR. LANYON'S NARRATIVE\n\nIt rained.\n\n"
        "Mr. Hyde.\n\nWELL, MR. HYDE\n\n'NO'\n\nHe left."
    )
    assert [(h.level, h.title) for h in heading_candidates(text)] == [
        (3, "SEARCH FOR MR. HYDE"),
        (3, "DR. LANYON'S NARRATIVE"),
    ]


def test_titled_line_under_a_chapter_heading_is_its_title_not_a_heading():
    # A Connecticut Yankee: "CHAPTER II" / "KING ARTHUR'S COURT" as two paragraphs.
    text = (
        "CHAPTER II\n\nKING ARTHUR'S COURT\n\nText.\n\n"
        "CHAPTER III\n\nKNIGHTS OF THE TABLE ROUND\n\nText.\n\nThe Storm\n\nText."
    )
    assert [(h.level, h.title) for h in heading_candidates(text)] == [
        (2, "CHAPTER II"),
        (2, "CHAPTER III"),
        (3, "The Storm"),
    ]


def test_sentences_starting_with_numeral_words_are_not_headings():
    text = "I was there.\n\nCivil war.\n\nPart of me wanted to go.\n\nI love you"
    assert heading_candidates(text) == []


def test_typographic_breaks_point_at_next_paragraph():
    text = "A.\n\n* * *\n\nB.\n\n***\n\nC.\n\n#\n\nD."
    brks = typographic_breaks(text)
    assert [text[b : b + 2] for b in brks] == ["B.", "C.", "D."]


def test_markdown_headings_become_candidates_and_markup_is_stripped():
    p = parse(
        b"# Book\n\n## Chapter One\n\nSome *emphasis* and `code`.\n\n## Chapter Two\n\nMore.",
        "b.md",
    )
    assert "emphasis" in p.text and "*" not in p.text and "`" not in p.text
    assert [(h.level, h.title) for h in p.headings] == [
        (1, "Book"),
        (2, "Chapter One"),
        (2, "Chapter Two"),
    ]


def test_empty_text_raises():
    with pytest.raises(IngestError) as e:
        parse(b"   \n\n  ", "e.txt")
    assert e.value.code == "empty_text"


def test_three_or_more_blank_lines_are_a_break():
    p = parse(b"A.\n\n\n\n\nB.", "b.txt")
    assert len(p.breaks) == 1 and p.text[p.breaks[0] :] == "B."
    assert parse(b"A.\n\n\nB.", "b.txt").breaks == []


def test_markdown_heading_offset_skips_body_mentions():
    p = parse(
        b"Please read the Preface before continuing.\n\n## Preface\n\nContent here.",
        "m.md",
    )
    assert p.text[p.headings[0].start_cp :].startswith("Preface\n\nContent")


def test_markdown_unmatched_heading_does_not_drop_later_ones():
    # "# ***" has no real title, so it is not a heading; later headings still are.
    p = parse(b"# ***\n\nBody.\n\n## Chapter Two\n\nMore.", "m.md")
    assert [(h.level, h.title) for h in p.headings] == [(2, "Chapter Two")]


def test_markdown_three_blank_lines_are_a_break():
    p = parse(b"A.\n\n\n\n\nB.", "b.md")
    assert len(p.breaks) == 1 and p.text[p.breaks[0] :] == "B."


def test_crlf_three_blank_lines_are_a_break():
    p = parse(b"A.\r\n\r\n\r\n\r\n\r\nB.", "b.txt")
    assert len(p.breaks) == 1 and p.text[p.breaks[0] :] == "B."
    assert "\r" not in p.text


def test_utf16_txt_is_parsed():
    p = parse("CHAPTER I\n\nText here.".encode("utf-16"), "u.txt")
    assert p.text == "CHAPTER I\n\nText here."


def test_utf8_bom_does_not_hide_first_heading():
    body = "\n\n".join(
        [
            "CHAPTER I",
            " ".join(["word"] * 300),
            "CHAPTER II",
            " ".join(["word"] * 300),
            "CHAPTER III",
            " ".join(["word"] * 300),
        ]
    )
    data = b"\xef\xbb\xbf" + body.encode("utf-8")
    p = parse(data, "b.txt")
    assert p.stripped == []
    assert p.headings[0].start_cp == 0
    assert p.text.startswith("CHAPTER I")


def test_two_line_keyword_heading_is_titled_with_both_lines():
    # Many Gutenberg editions put the chapter keyword and its title on consecutive
    # lines with no blank line between (The Secret Garden, White Fang).
    text = "CHAPTER I.\nTHERE IS NO ONE LEFT\n\nText.\n\nPART II\nTHE SHE-WOLF\n\nText."
    hs = heading_candidates(text)
    assert [(h.level, h.title) for h in hs] == [
        (2, "CHAPTER I. THERE IS NO ONE LEFT"),
        (1, "PART II THE SHE-WOLF"),
    ]
    assert text[hs[0].start_cp :].startswith("CHAPTER I.\nTHERE")
    assert text[hs[1].start_cp :].startswith("PART II\nTHE")


def test_two_line_paragraph_opening_with_a_bare_numeral_is_not_a_heading():
    # A title-page address (Pride and Prejudice: "156 CHARING CROSS ROAD" / "LONDON")
    # would otherwise become a heading and keep the whole preface.
    text = "156 CHARING CROSS ROAD\nLONDON\n\nText.\n\nCHAPTER I\n\nText."
    assert [(h.level, h.title) for h in heading_candidates(text)] == [(2, "CHAPTER I")]


def test_stave_headings_are_chapter_like():
    # A Christmas Carol divides into staves, titled on the same line or on the next one.
    text = "STAVE I: MARLEY'S GHOST\n\nText.\n\nSTAVE ONE\nMARLEY'S GHOST\n\nText."
    assert [(h.level, h.title) for h in heading_candidates(text)] == [
        (2, "STAVE I: MARLEY'S GHOST"),
        (2, "STAVE ONE MARLEY'S GHOST"),
    ]


def numbered(*pairs: str) -> str:
    return "\n\n".join(f"{p}\n\n{big(40)}" for p in pairs)


def titles(text: str) -> list[str]:
    return [h.title for h in heading_candidates(text) if h.level == 2]


def test_roman_numeral_and_capitalised_title_on_two_lines_are_a_heading():
    # The War of the Worlds heads chapters "I." / "THE EVE OF THE WAR." and restarts the
    # count in its second book.
    text = (
        "BOOK ONE\nTHE COMING\n\n"
        + numbered("I.\nTHE EVE OF THE WAR.", "II.\nTHE FALLING STAR.", "III.\nON HORSELL COMMON.")
        + "\n\nBOOK TWO\nTHE EARTH\n\n"
        + numbered("I.\nUNDER FOOT.", "II.\nTHE STILLNESS.")
    )
    hs = heading_candidates(text)
    assert [(h.level, h.title) for h in hs] == [
        (1, "BOOK ONE THE COMING"),
        (2, "I. THE EVE OF THE WAR."),
        (2, "II. THE FALLING STAR."),
        (2, "III. ON HORSELL COMMON."),
        (1, "BOOK TWO THE EARTH"),
        (2, "I. UNDER FOOT."),
        (2, "II. THE STILLNESS."),
    ]
    assert all(h.joined for h in hs)
    assert text[hs[1].start_cp :].startswith("I.\nTHE EVE")


def test_numbering_may_run_on_across_a_book_heading():
    text = numbered("I.\nONE.", "II.\nTWO.") + "\n\nBOOK TWO\n\n" + numbered("III.\nTHREE.")
    assert titles(text) == ["I. ONE.", "II. TWO.", "III. THREE."]


def test_fewer_than_three_numeral_headings_are_not_headings():
    assert titles(numbered("I.\nTHE EVE.", "II.\nTHE STAR.")) == []


def test_numeral_headings_out_of_order_are_not_headings():
    assert titles(numbered("I.\nONE.", "III.\nTHREE.", "II.\nTWO.")) == []
    assert titles(numbered("II.\nTWO.", "III.\nTHREE.", "IV.\nFOUR.")) == []


def test_numeral_count_restarting_without_a_book_heading_is_not_headings():
    assert titles(numbered("I.\nONE.", "II.\nTWO.", "I.\nAGAIN.", "II.\nMORE.")) == []


def test_roman_numeral_over_a_title_case_title_is_a_heading_with_or_without_a_full_stop():
    # Treasure Island heads chapters "I" / "The Old Sea-dog at the Admiral Benbow", The
    # Time Machine "I." / "Introduction".
    text = numbered("I\nThe Old Sea-dog", "II\nBlack Dog Appears", "III\nThe Black Spot")
    assert titles(text) == ["I The Old Sea-dog", "II Black Dog Appears", "III The Black Spot"]
    assert titles(numbered("I.\nIntroduction", "II.\nThe Machine", "III.\nTime Travelling")) == [
        "I. Introduction",
        "II. The Machine",
        "III. Time Travelling",
    ]


def test_numeral_run_takes_long_titles_and_one_misprinted_numeral():
    # Treasure Island titles some chapters past 60 characters and prints chapter XVII
    # as "XXVII".
    text = numbered(
        "I\nThe Old Sea-dog at the Admiral Benbow",
        "II\nNarrative Continued by the Doctor: How the Ship Was Abandoned",
        "XIII\nNarrative Continued by the Doctor: The Jolly-boat's Last Trip",
        'IV\n"Pieces of Eight"',
        "V\nThe Last of the Blind Man",
    )
    assert [t.split()[0] for t in titles(text)] == ["I", "II", "XIII", "IV", "V"]


def test_numeral_run_with_a_gap_in_the_count_is_not_headings():
    assert titles(numbered("I\nOne", "II\nTwo", "V\nFive", "VI\nSix")) == []


def test_numeral_line_needs_a_roman_numeral_alone_and_a_capitalised_title():
    assert titles(numbered("1.\nONE.", "2.\nTWO.", "3.\nTHREE.")) == []
    assert titles(numbered("I.\nthe one.", "II.\nthe two.", "III.\nthe three.")) == []
    assert titles(numbered("I.\nThe one.", "II.\nThe two.", "III.\nThe three.")) == []
    assert titles(numbered("I. ONE\nMORE.", "II. TWO\nMORE.", "III. THREE\nMORE.")) == []


def test_numeral_headings_without_prose_after_them_are_not_headings():
    # A list of short numbered items, or section marks with only a line under them.
    text = "\n\n".join(f"{n}.\nITEM.\n\nA short line." for n in ("I", "II", "III"))
    assert titles(text) == []


def test_long_capitalised_chapter_line_is_a_heading():
    # Heidi titles two chapters on lines of 62 and 63 characters.
    text = "CHAPTER VII. FRAULEIN ROTTENMEIER SPENDS AN UNCOMFORTABLE DAY\n\nText."
    assert [(h.level, h.title) for h in heading_candidates(text)] == [
        (2, "CHAPTER VII. FRAULEIN ROTTENMEIER SPENDS AN UNCOMFORTABLE DAY")
    ]


def test_long_line_opening_with_chapter_is_not_a_heading_without_numeral_and_capitals():
    text = (
        "Chapter VII was the one she read over and over again, late into the night.\n\n"
        "CHAPTER AND VERSE WERE QUOTED AT HIM BY EVERY PREACHER IN THE WHOLE TOWN\n\nText."
    )
    assert heading_candidates(text) == []


def test_numeral_headings_in_a_book_with_chapter_headings_are_not_headings():
    # A numbered list of articles inside chapter II of a CHAPTER-headed book.
    inner = numbered("I.\nTHE FIRST ARTICLE.", "II.\nTHE SECOND ARTICLE.", "III.\nTHE THIRD.")
    text = (
        f"CHAPTER I\n\n{big(40)}\n\nCHAPTER II\n\n{big(40)}\n\n{inner}\n\nCHAPTER III\n\n{big(40)}"
    )
    assert titles(text) == ["CHAPTER I", "CHAPTER II", "CHAPTER III"]


def test_numeral_headings_around_a_chapter_heading_are_not_headings():
    # Numbered poems, one of them followed by a stray CHAPTER line.
    text = numbered("I.\nTO THE MOON.", "II.\nTO THE SEA.", "CHAPTER V", "III.\nA HYMN.")
    assert titles(text) == ["CHAPTER V"]


def test_long_or_wrapped_chapter_heading_that_continues_the_count_is_a_heading():
    # Moby-Dick titles chapters 56 and 73 past 60 characters, one wrapped onto a second line.
    text = numbered(
        "CHAPTER 55. Of the Monstrous Pictures of Whales.",
        "CHAPTER 56. Of the Less Erroneous Pictures of Whales, and the True\n"
        "Pictures of Whaling Scenes.",
        "CHAPTER 57. Brit.",
        "CHAPTER 58. Stubb and Flask kill a Right Whale; and Then Have a Talk over Him.",
    )
    assert titles(text) == [
        "CHAPTER 55. Of the Monstrous Pictures of Whales.",
        "CHAPTER 56. Of the Less Erroneous Pictures of Whales, and the True "
        "Pictures of Whaling Scenes.",
        "CHAPTER 57. Brit.",
        "CHAPTER 58. Stubb and Flask kill a Right Whale; and Then Have a Talk over Him.",
    ]


def test_chapter_keyword_over_a_title_of_two_lines_is_a_heading():
    # Around the World in Eighty Days and Oliver Twist wrap their capitals titles.
    text = numbered(
        "CHAPTER I.\nIN WHICH PHILEAS FOGG AND PASSEPARTOUT ACCEPT EACH OTHER, THE ONE AS\n"
        "MASTER, THE OTHER AS MAN",
        "CHAPTER II.\nIN WHICH PASSEPARTOUT IS CONVINCED THAT HE HAS AT LAST FOUND HIS IDEAL",
        "CHAPTER III.\nIN WHICH A CONVERSATION TAKES PLACE WHICH SEEMS LIKELY TO COST PHILEAS\n"
        "FOGG DEAR",
        "CHAPTER IV.\nIN WHICH PHILEAS FOGG ASTOUNDS PASSEPARTOUT, HIS SERVANT",
    )
    hs = heading_candidates(text)
    assert [h.title[:12] for h in hs] == [
        "CHAPTER I. I",
        "CHAPTER II. ",
        "CHAPTER III.",
        "CHAPTER IV. ",
    ]
    assert hs[0].title.endswith("AS MASTER, THE OTHER AS MAN") and hs[0].joined


def test_wrapped_chapter_headings_need_a_found_heading_to_count_from():
    text = numbered(
        "CHAPTER I.\nIN WHICH ONE THING HAPPENS AND THEN ANOTHER THING HAPPENS TO THEM\nALL",
        "CHAPTER II.\nIN WHICH ANOTHER THING HAPPENS AND THEN ONE MORE THING HAPPENS\nTOO",
    )
    assert titles(text) == []


def test_long_part_heading_that_continues_the_count_is_a_section():
    text = numbered(
        "PART II. A VOYAGE TO BROBDINGNAG.",
        "PART III. A VOYAGE TO LAPUTA, BALNIBARBI, GLUBBDUBDRIB, LUGGNAGG AND\nJAPAN.",
    )
    assert [h.level for h in heading_candidates(text)] == [1, 1]


def test_long_chapter_line_that_breaks_the_count_is_not_a_heading():
    text = numbered(
        "CHAPTER 4",
        "CHAPTER 11 OF THE BANKRUPTCY CODE WAS FILED BY THE MILL THAT MORNING, SAID THE PAPER",
        "Chapter 5 was the one she read over and over again, late into the night, alone.",
        "CHAPTER 5",
    )
    assert titles(text) == ["CHAPTER 4", "CHAPTER 5"]


def test_numbered_sentence_in_a_book_with_chapter_headings_is_not_a_heading():
    # Moby-Dick chapter 89 quotes two numbered laws; Crime and Punishment heads its
    # epilogue's chapters with bare numerals, which stay.
    text = numbered(
        "CHAPTER 88. Schools and Schoolmasters.",
        "CHAPTER 89. Fast-Fish and Loose-Fish.",
        "I. A Fast-Fish belongs to the party fast to it.",
        "CHAPTER 90. Heads or Tails.",
        "EPILOGUE",
        "I",
        "II",
    )
    assert "I. A Fast-Fish belongs to the party fast to it." not in titles(text)
    assert titles(text)[-2:] == ["I", "II"]


def test_numbered_titles_are_headings_in_a_book_without_chapter_keywords():
    # The Magic of Oz heads its chapters "1. Mount Munch".
    text = numbered("1. Mount Munch", "2. The Hawk", "3. Two Bad Ones")
    assert titles(text) == ["1. Mount Munch", "2. The Hawk", "3. Two Bad Ones"]


def test_long_capitals_line_needs_a_full_stop_after_its_numeral_and_at_most_100_characters():
    text = (
        "LETTER I NEVER SENT TO MY MOTHER, WHO WAS THEN LIVING IN THE OLD HOUSE AT BATH\n\n"
        "CHAPTER 11 OF THE BANKRUPTCY CODE WAS FILED BY THE MILL THAT MORNING, SAID THE PAPER\n\n"
        "CHAPTER XII. " + "THE LONGEST TITLE " * 5 + "\n\nText."
    )
    assert heading_candidates(text) == []


def test_illustration_and_picture_captions_are_removed():
    # Three Men in a Boat runs "[Picture: ...]" into the prose; Pride and Prejudice's captions
    # span lines and hold a bracketed credit of their own.
    body = (
        "[Picture: Man reading book] I remember going to the British Museum one\n"
        "day to read up the treatment.\n\n"
        '[Illustration:\n\n"I hope Mr. Bingley will like it"\n\n'
        "[_Copyright 1894 by George Allen._]]\n\n"
        "He said [sic] it twice. [Laughter] [Illustration] The end of the scene.\n\n"
        "[Illustration of a point that never closes"
    )
    p = parse(gutenberg_wrap(body).encode(), "b.txt")
    assert p.text == (
        "I remember going to the British Museum one day to read up the treatment.\n\n"
        "He said [sic] it twice. [Laughter] The end of the scene.\n\n"
        "[Illustration of a point that never closes"
    )
    assert ("illustration captions", 18) in [(s.label, s.word_count) for s in p.stripped]


def test_a_removed_caption_leaves_a_break_only_where_one_side_had_it():
    body = (
        "It ended.\n\n\n\n\n[Illustration]\n\n\n\n\nIt began.\n\n[Illustration]\n\n"
        "It went on.\n\n\n[Illustration]\n\n[Illustration: Tail-piece]\n\n\nIt stopped."
    )
    p = parse(gutenberg_wrap(body).encode(), "b.txt")
    assert p.text == "It ended.\n\n* * *\n\nIt began.\n\nIt went on.\n\nIt stopped."


def test_a_heading_printed_inside_a_caption_is_kept():
    # Pride and Prejudice prints its first chapter heading and "THE END" inside pictures,
    # and the printer's imprint after the second.
    body = (
        f"[Illustration: ·PRIDE AND PREJUDICE·\n\n\n\n\nChapter I.]\n\n\n{big(300)}\n\n"
        f"CHAPTER II.\n\n{big(300)}\n\n[Illustration:\n\n    THE\n    END\n    ]\n\n\n\n\n"
        "CHISWICK PRESS:--CHARLES WHITTINGHAM AND CO.\nTOOKS COURT, CHANCERY LANE, LONDON."
    )
    p = parse(gutenberg_wrap(body).encode(), "b.txt")
    assert p.text.startswith("Chapter I.\n\nword") and p.text.endswith("word")


def test_long_runs_of_blank_lines_are_read_in_linear_time():
    # A run of blank lines is tried once for a caption, not once per line.
    started = time.perf_counter()
    parse(("a" + "\n" * 50_000 + "b" + " \n" * 50_000 + "c").encode(), "b.txt")
    assert time.perf_counter() - started < 1.0


def test_an_unclosed_caption_does_not_run_on_to_a_later_bracket():
    body = (
        f"[Illustration: the harbour at dawn\n\n{big(250)} kept.\n\n"
        "She circled the date (the third] and put the pen down."
    )
    p = parse(gutenberg_wrap(body).encode(), "b.txt")
    assert p.text.startswith("[Illustration: the harbour at dawn\n\nword")
    assert "word kept." in p.text


@pytest.mark.parametrize(
    "caption", ["Letter from Jo to her mother", "Stave of music", "The End", "Notes"]
)
def test_caption_text_that_is_no_chapter_heading_goes_with_the_caption(caption):
    chapters = [f"CHAPTER {n}\n\n{big(600)}" for n in range(1, 11)]
    body = "\n\n".join([*chapters[:8], f"[Illustration: {caption}]", *chapters[8:]])
    p = parse(gutenberg_wrap(body).encode(), "b.txt")
    assert caption not in p.text and p.text.endswith("word")
    assert [h.title for h in p.headings] == [f"CHAPTER {n}" for n in range(1, 11)]


def test_a_story_line_opening_like_the_older_gutenberg_closing_line_is_kept():
    body = BODY + "\n\nEnd of Project Gutenberg's influence on me, I thought, and went on.\n\nMore."
    assert parse(gutenberg_wrap(body).encode(), "book.txt").text.endswith("went on.\n\nMore.")
