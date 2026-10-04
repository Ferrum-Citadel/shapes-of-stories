import pytest

from app.core.ingest import parse
from app.core.prepare import prepare
from tests.conftest import big, gutenberg_wrap, make_docx


def parse_stable(raw: str):
    """Parse, and check that preparing the normalized output again changes nothing: a
    user who pastes back a text this tool produced must get the same story."""
    p = parse(raw.encode(), "b.txt")
    assert prepare(p.text.encode(), "b.txt", enforce_english=False).parsed.text == p.text
    return p


def test_front_and_back_matter_removed_and_offsets_rebased():
    raw = (
        f"TITLE PAGE\n\nContents\n\nI. One\n\nII. Two\n\nCHAPTER I\n\n{big(300)}\n\n"
        f"CHAPTER II\n\n{big(300)}\n\nTHE END\n\nAbout the author blurb."
    )
    p = parse_stable(raw)
    assert p.text.startswith("CHAPTER I") and p.text.endswith("word")
    assert [s.label for s in p.stripped] == ["front matter", "back matter"]
    assert [p.text[h.start_cp:h.start_cp + 9] for h in p.headings if h.level == 2][:2] == [
        "CHAPTER I",
        "CHAPTER I",
    ]


def test_stripping_over_15_percent_is_skipped_with_warning():
    raw = gutenberg_wrap(f"{big(200)}\n\nCHAPTER I\n\n{big(100)}")
    p = parse_stable(raw)
    assert p.text.startswith("word") and "strip_skipped_over_15_percent" in p.warnings


def test_no_headings_means_nothing_stripped():
    p = parse_stable(f"{big(50)}\n\n{big(50)}")
    assert p.stripped == [] and p.text.count("word") == 100


def test_part_heading_above_first_chapter_is_kept():
    raw = "PART I\n\nCHAPTER I\n\n" + big(300) + "\n\nCHAPTER II\n\n" + big(300)
    p = parse_stable(raw)
    assert p.text.startswith("PART I")
    assert p.stripped == []


def test_plain_text_prologue_before_first_chapter_is_kept():
    # A plain upload (no Gutenberg header, no contents listing) that opens with a
    # prologue before chapter "I": nothing here is recognisable as front matter, so
    # the story starts at the first paragraph instead of at the first chapter heading.
    raw = (
        f"The story had held us, round the fire.\n\n{big(40)}\n\n{big(40)}\n\n"
        f"I\n\n{big(300)}\n\nII\n\n{big(300)}"
    )
    p = parse_stable(raw)
    assert p.text.startswith("The story had held us")
    assert p.stripped == []


def test_letters_before_first_chapter_are_kept():
    # Mimics Frankenstein: "Letter 1" .. "Letter 4" precede "Chapter 1" and are real
    # story content, not table-of-contents entries. "Letter 1" is a heading candidate
    # (level 2, like CHAPTER) so it reaches chapter_like on its own.
    raw = (
        f"TITLE PAGE\n\nContents\n\nLetter 1\nLetter 2\nChapter 1\nChapter 2\n\n"
        f"Letter 1\n\n{big(200)}\n\nLetter 2\n\n{big(200)}\n\n"
        f"Chapter 1\n\n{big(300)}\n\nChapter 2\n\n{big(300)}"
    )
    p = parse_stable(raw)
    assert p.text.startswith("Letter 1")
    assert [s.label for s in p.stripped] == ["front matter"]


def test_prologue_before_first_act_is_kept():
    # Mimics Romeo and Juliet: "THE PROLOGUE" precedes "ACT I". "THE PROLOGUE" is
    # a heading candidate (level 2, PROLOGUE with an optional leading THE) so it
    # reaches chapter_like on its own.
    raw = (
        f"TITLE PAGE\n\nContents\n\nTHE PROLOGUE\nACT I\n\n"
        f"THE PROLOGUE\n\n{big(80)}\n\nACT I\n\n{big(300)}\n\nACT II\n\n{big(300)}"
    )
    p = parse_stable(raw)
    assert p.text.startswith("THE PROLOGUE")
    assert [s.label for s in p.stripped] == ["front matter"]


def test_title_repeat_heading_after_contents_marks_story_start():
    # Mimics the Turn of the Screw: a table of contents (one multi-line block, not
    # itself a heading candidate) is followed by a level-3 heading that just repeats
    # the work's declared title, whose body is the frame narrative -- no CHAPTER/
    # PART/ACT/PROLOGUE keyword of its own, so it only reaches chapter_like because
    # it echoes the title and comes after a contents listing.
    body = (
        f"TITLE PAGE\n\nContents\n\nI\nII\n\nTHE STORY\n\n{big(80)}\n\n"
        f"I\n\n{big(300)}\n\nII\n\n{big(300)}"
    )
    p = parse_stable(gutenberg_wrap(body, title="The Story"))
    assert p.text.startswith("THE STORY\n\nword")
    assert "front matter" in [s.label for s in p.stripped]


def test_title_repeat_heading_without_contents_is_still_stripped():
    # A bare title heading with nothing before it (no contents listing) is an
    # ordinary title page, not a frame-narrative marker: still stripped, same as any
    # other level-3 heading ahead of the first real chapter.
    body = f"THE STORY\n\nby Someone\n\nI\n\n{big(300)}\n\nII\n\n{big(300)}"
    p = parse_stable(gutenberg_wrap(body, title="The Story"))
    assert p.text.startswith("I\n\nword")


def test_title_repeated_after_a_preface_heads_a_frame_story_that_is_kept():
    # A Connecticut Yankee: title page, the author's preface, the title again over a break,
    # then the frame story "A WORD OF EXPLANATION" before CHAPTER I. The preface goes.
    title = "A CONNECTICUT YANKEE IN KING ARTHUR'S COURT"
    body = (
        f"{title}\n\nby\n\nMARK TWAIN\n\nPREFACE\n\n{big(300)}\n\n{title}\n\n\n\n\n"
        f"A WORD OF EXPLANATION\n\n{big(1000)}\n\nCHAPTER I.\nCAMELOT\n\n{big(3000)}\n\n"
        f"CHAPTER II\n\n{big(3000)}"
    )
    p = parse_stable(gutenberg_wrap(body, title="A Connecticut Yankee in King Arthur's Court"))
    assert p.text.startswith("A WORD OF EXPLANATION\n\nword")


def test_title_repeated_on_its_title_page_does_not_start_the_story():
    # Treasure Island and A Little Princess print the title twice before their contents.
    body = (
        f"TREASURE ISLAND\n\nTREASURE ISLAND\n\n{big(60)}\n\nCONTENTS\n\nI\nII\n\n"
        f"I\n\n{big(1000)}\n\nII\n\n{big(1000)}"
    )
    p = parse_stable(gutenberg_wrap(body, title="Treasure Island"))
    assert p.text.startswith("I\n\nword")


def test_contents_wrapped_entries_are_stripped_as_a_run():
    # Mimics Tom Sawyer: some contents entries wrap onto a second line and are
    # never recognised as headings on their own (heading_candidates only accepts a
    # single-line paragraph), so the one short entry that is detected ("CHAPTER
    # II. Short") absorbs the wrapped ones' text as spurious "body"; without the run
    # scan the front matter would end partway through the list instead of at the real
    # first chapter.
    raw = (
        "TITLE PAGE\n\nContents\n\n"
        "CHAPTER I. A Title That Wraps\nOnto A Second Line\n\n"
        "CHAPTER II. Short\n\n"
        "CHAPTER III. A Title That Wraps\nOnto Another Line\n\n"
        f"CHAPTER I\n\n{big(300)}\n\nCHAPTER II\n\n{big(300)}\n\nCHAPTER III\n\n{big(300)}"
    )
    p = parse_stable(raw)
    assert p.text.startswith("CHAPTER I\n\nword")
    assert [s.label for s in p.stripped] == ["front matter"]


def test_contents_packed_lines_are_stripped_as_a_run():
    # Mimics The Hound of the Baskervilles: contents entries are packed one per
    # physical line with no blank line between them, and each real chapter heading
    # repeats its title on the very next line with no blank line either -- neither
    # form is a single-line paragraph, so heading_candidates finds no chapter-like
    # heading at all here; without the run scan nothing would be stripped.
    raw = (
        "TITLE PAGE\n\nContents\n\n"
        "Chapter 1 First Title\nChapter 2 Second Title\nChapter 3 Third Title\n\n"
        f"Chapter 1.\nFirst Title\n\n{big(300)}\n\n"
        f"Chapter 2.\nSecond Title\n\n{big(300)}\n\n"
        f"Chapter 3.\nThird Title\n\n{big(300)}"
    )
    p = parse_stable(raw)
    assert p.text.startswith("Chapter 1.\nFirst Title\n\nword")
    assert [s.label for s in p.stripped] == ["front matter"]


def test_short_real_chapters_are_not_mistaken_for_a_contents_run():
    # Three short chapters that legitimately follow one another, each with its own
    # (small) body: increasing chapter numbers alone must not be enough to treat
    # them as a contents listing. There is no later heading that restarts the
    # count, so nothing here should be stripped as a "run".
    raw = (
        "TITLE PAGE\n\nContents\n\n"
        f"CHAPTER I\n\n{big(30)}\n\nCHAPTER II\n\n{big(30)}\n\nCHAPTER III\n\n{big(30)}"
    )
    p = parse_stable(raw)
    assert p.text.startswith("CHAPTER I\n\nword")
    assert [s.label for s in p.stripped] == ["front matter"]


def test_contents_entries_that_are_not_chapter_like_still_mark_story_start():
    # Like A Christmas Carol but with a keyword no heading rule knows: the title block,
    # an author's preface and a contents listing whose entries ("Canto I: ...") are not
    # chapter-like headings -- the colon and apostrophe rule them out even as plain
    # titled lines -- so no heading rule can find the story. The first listed entry
    # recurs later (in capitals) as the heading of the first canto; the story starts there.
    raw = (
        f"A CAROL\n\nIN PROSE\n\nby Someone\n\nPREFACE\n\n{big(40)}\n\nCONTENTS\n\n"
        "Canto I: Marley's Ghost\nCanto II: The First Spirit\nCanto III: The Second Spirit\n\n"
        f"CANTO I: MARLEY'S GHOST\n\n{big(300)}\n\nCANTO II: THE FIRST SPIRIT\n\n{big(300)}\n\n"
        f"CANTO III: THE SECOND SPIRIT\n\n{big(300)}"
    )
    p = parse_stable(raw)
    assert p.text.startswith("CANTO I: MARLEY'S GHOST\n\nword")
    assert [s.label for s in p.stripped] == ["front matter"]


def test_list_of_illustrations_after_contents_is_stripped():
    # Mimics Little Women: the contents heading is an illustration caption, its
    # entries put numeral and title on one line ("I. PLAYING PILGRIMS") while the
    # real chapter heading splits them over two paragraphs ("I." / "PLAYING
    # PILGRIMS."), and a list of illustration captions sits between the contents and
    # chapter I. Everything up to the first later occurrence of the first entry is
    # front matter.
    raw = (
        "TITLE\n\n[Illustration: Contents]\n\nPart First.\n\nCHAPTER\n\n"
        "I. PLAYING PILGRIMS\n\nII. A MERRY CHRISTMAS\n\n"
        "LIST OF ILLUSTRATIONS\n\nBeth put a pair of slippers down to warm\n"
        "Tail-piece to Illustrations\n\n"
        "[Illustration: Christmas won't be Christmas without any presents]\n\n"
        f"I.\n\nPLAYING PILGRIMS.\n\n{big(300)}\n\nII.\n\nA MERRY CHRISTMAS.\n\n{big(300)}"
    )
    p = parse_stable(raw)
    assert p.text.startswith("I.\n\nPLAYING PILGRIMS.\n\nword")
    assert [s.label for s in p.stripped] == ["illustration captions", "front matter"]


def test_two_line_contents_entry_marks_story_start_at_the_body_heading():
    # Mimics Treasure Island: the contents lists each part as "PART ONE" / "The Old
    # Buccaneer" on consecutive lines, so the pair is itself a two-line part heading,
    # and the body heads the part "PART ONE--The Old Buccaneer"; only the two contents
    # lines joined recur later. Without the pair the contents entry itself would be
    # the first chapter-like heading with a body and the story would start inside the
    # contents.
    raw = (
        "TITLE PAGE\n\nContents\n\nPART ONE\nThe Old Buccaneer\n\n"
        "I. THE OLD SEA-DOG 11\nII. BLACK DOG 17\n\nPART TWO\nThe Sea Cook\n\nIII. BRISTOL 48\n\n"
        f"PART ONE--The Old Buccaneer\n\nI\nThe Old Sea-dog\n\n{big(300)}\n\n"
        f"II\nBlack Dog\n\n{big(300)}\n\nPART TWO--The Sea Cook\n\nIII\nBristol\n\n{big(300)}"
    )
    p = parse_stable(raw)
    assert p.text.startswith("PART ONE--The Old Buccaneer\n\nI\nThe Old Sea-dog\n\nword")
    assert [s.label for s in p.stripped] == ["front matter"]


def test_two_line_contents_entries_do_not_start_the_story_when_nothing_recurs():
    # Same Treasure Island listing, but the body heads its parts with a different
    # wording than the contents, so no contents entry recurs and the start falls back
    # to the first chapter-like heading with a body. The listing's own two-line "PART
    # ONE" / "The Old Buccaneer" is such a heading and its "body" is the entry lines
    # after it, however many words they hold; the story must not start inside the
    # contents.
    raw = (
        "TITLE PAGE\n\nContents\n\nPART ONE\nThe Old Buccaneer\n\n"
        "I. THE OLD SEA-DOG 11\nII. THE BLACK DOG 17\nIII. THE BLACK SPOT AND THE\n"
        "SEA-CHEST 26\n\nPART TWO\nThe Sea Cook\n\nIV. BRISTOL 48\n\n"
        f"PART ONE--Voyage Begins\n\n{big(300)}\n\nPART TWO--Cook's Galley\n\n{big(300)}"
    )
    p = parse_stable(raw)
    assert p.text.startswith("PART ONE--Voyage Begins\n\nword")
    assert [s.label for s in p.stripped] == ["front matter"]


def test_short_first_chapter_is_kept():
    # A first chapter of only a few words is still the story's start; the four words
    # must not be stripped as front matter.
    raw = gutenberg_wrap(
        f"TITLE PAGE\n\nCHAPTER I\n\nOnly four words here.\n\nCHAPTER II\n\n{big(300)}"
    )
    p = parse_stable(raw)
    assert p.text.startswith("CHAPTER I\n\nOnly four words here.\n\nCHAPTER II")
    assert [s.label for s in p.stripped] == [
        "Project Gutenberg header",
        "Project Gutenberg footer",
        "front matter",
    ]


def test_two_line_chapter_heading_followed_by_prose_starts_the_story():
    # Mimics The Secret Garden: "CHAPTER I." / "THERE IS NO ONE LEFT" on consecutive
    # lines is a two-line heading in the body, not a contents entry, and the prose
    # after it makes it the story's start rather than the one-line CHAPTER II.
    raw = gutenberg_wrap(
        f"TITLE PAGE\n\nCHAPTER I.\nTHERE IS NO ONE LEFT\n\n{big(300)}\n\n"
        f"CHAPTER II.\n\n{big(300)}"
    )
    p = parse_stable(raw)
    assert p.text.startswith("CHAPTER I.\nTHERE IS NO ONE LEFT\n\nword")
    assert [s.label for s in p.stripped] == [
        "Project Gutenberg header",
        "Project Gutenberg footer",
        "front matter",
    ]


def test_two_line_chapter_heading_with_a_sub_heading_before_its_prose_starts_the_story():
    # "CHAPTER I." / "THE OPENING" is a two-line heading whose prose sits behind a
    # titled sub-heading; the search for that prose must run on to the next chapter,
    # not stop at the sub-heading, or the real first chapter is stripped.
    raw = gutenberg_wrap(
        f"TITLE PAGE\n\nCHAPTER I.\nTHE OPENING\n\nA Storm\n\n{big(300)}\n\n"
        f"CHAPTER II.\n\n{big(300)}"
    )
    p = parse_stable(raw)
    assert p.text.startswith("CHAPTER I.\nTHE OPENING\n\nA Storm\n\nword")
    assert [s.label for s in p.stripped] == [
        "Project Gutenberg header",
        "Project Gutenberg footer",
        "front matter",
    ]


def test_two_line_contents_entry_followed_by_a_blurb_does_not_start_the_story():
    # An annotated contents lists "PART ONE" / "The Old Buccaneer" and then a one-line
    # blurb longer than any entry; a blurb is not a chapter's prose, so the story must
    # still start at the body heading.
    raw = (
        "TITLE PAGE\n\nContents\n\nPART ONE\nThe Old Buccaneer\n\n"
        "In which a strange old sailor takes lodging at the inn and hides his past.\n\n"
        f"I. THE OLD SEA-DOG 11\n\nPART ONE--Voyage Begins\n\n{big(300)}"
    )
    p = parse_stable(raw)
    assert p.text.startswith("PART ONE--Voyage Begins\n\nword")
    assert [s.label for s in p.stripped] == ["front matter"]


CATALOGUE = "\n\n".join(
    f"{n}. THE {name} BOOK\nIllustrated. 16mo. $1.50.\n\n"
    "A story for girls and boys told with much warmth and humour throughout."
    for n, name in enumerate(["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH",
                              "SIXTH", "SEVENTH", "EIGHTH", "NINTH"], 1)
) + "\n\nLITTLE & CO., Publishers\n\n10 Main Street, Boston."


def test_publishers_catalogue_at_the_end_is_cut_with_its_heading():
    # Little Women ends with the publisher's list of the author's other books, whose
    # numbered entries were read as chapters; the catalogue's own heading and the break
    # before it go too, the story's last paragraph stays.
    raw = gutenberg_wrap(
        f"CHAPTER I\n\n{big(2000)}\n\nCHAPTER II\n\n{big(2000)} end.\n\n* * *\n\n"
        f"BOOKS BY A. WRITER\n\n{CATALOGUE}"
    )
    p = parse_stable(raw)
    assert p.text.endswith("word end.")
    assert [s.label for s in p.stripped][-1] == "back matter"
    assert [h.title for h in p.headings] == ["CHAPTER I", "CHAPTER II"]


def test_a_price_mentioned_near_the_end_of_a_story_is_kept():
    raw = gutenberg_wrap(
        f"CHAPTER I\n\n{big(2000)}\n\nCHAPTER II\n\n{big(2000)}\n\n"
        "He paid $1.50 for the little book, bound in cloth, 16mo, and went home happy."
    )
    p = parse_stable(raw)
    assert p.text.endswith("went home happy.")
    assert "back matter" not in [s.label for s in p.stripped]


def test_a_catalogue_before_the_last_tenth_is_kept():
    # Only the end of the book is ever cut: a list of books inside the story stays,
    # even when what follows it is short enough to pass the size cap.
    raw = gutenberg_wrap(
        f"CHAPTER I\n\n{big(4000)}\n\n{CATALOGUE}\n\nCHAPTER II\n\n{big(350)}"
    )
    p = parse_stable(raw)
    assert "LITTLE & CO., Publishers" in p.text and p.text.endswith("word")


def test_catalogue_markers_spread_through_the_ending_are_kept():
    # Prices scattered through the last chapter, each far from the next, are story.
    ending = "\n\n".join(
        f"{big(150)}\n\nA 16mo copy cost ${n}.00 at the fair." for n in range(1, 10)
    )
    raw = gutenberg_wrap(f"CHAPTER I\n\n{big(20000)}\n\nCHAPTER II\n\n{ending}")
    p = parse_stable(raw)
    assert p.text.endswith("cost $9.00 at the fair.")


ONE_KIND_OF_MARKER = {
    "debts": [f"To Mr. Brown, for flour, ${n}.{n * 7 % 100:02d}." for n in range(3, 13)],
    "poker": [f'"I\'ll see your ${n * 5} and raise you ${n * 10}," said Jake.' for n in range(9)],
    "auction": [f'"Lot {n}: a chair. Who bids? 40 cents! 50 cents!"' for n in range(1, 9)],
    "dressmaker": [f'"Fold the {n} yards of grey cloth," said the dressmaker.' for n in range(9)],
    "publishers and cloth": [
        f'"The publishers want it bound in green cloth," she said for the {n}th time.'
        for n in range(1, 10)
    ],
}


@pytest.mark.parametrize("lines", ONE_KIND_OF_MARKER.values(), ids=ONE_KIND_OF_MARKER.keys())
def test_story_ending_with_one_kind_of_catalogue_marker_is_kept(lines):
    # Prices, cloth or a publisher in the story's last lines are story, not a catalogue:
    # a catalogue also names a book format, and at least one other kind of marker.
    raw = gutenberg_wrap(
        f"CHAPTER I\n\n{big(2000)}\n\nCHAPTER II\n\n{big(2000)}\n\n" + "\n\n".join(lines)
    )
    p = parse_stable(raw)
    assert p.text.endswith(lines[-1]) and "back matter" not in [s.label for s in p.stripped]


def test_short_story_ending_on_a_shopping_list_is_kept():
    shop = [f"{x} ${n}.00" for n, x in enumerate(["Sugar,", "Tea,", "A bonnet,", "Ribbon,",
                                                    "Boots,", "Candles,", "Soap,", "Oil,"], 1)]
    raw = gutenberg_wrap(f"{big(1300)}\n\nHer list said:\n\n" + "\n\n".join(shop))
    p = parse_stable(raw)
    assert p.text.endswith("Oil, $8.00") and "back matter" not in [s.label for s in p.stripped]


def test_catalogue_followed_by_more_story_is_kept_whole():
    # A tale printed after the catalogue is not back matter, and a catalogue in the
    # middle of the ending is too ambiguous to cut.
    raw = gutenberg_wrap(
        f"CHAPTER I\n\n{big(4000)}\n\nCHAPTER II\n\n{big(4000)} end.\n\n"
        f"BOOKS BY A. WRITER\n\n{CATALOGUE}\n\nTHE LITTLE BONUS TALE\n\n{big(400)} bonus end."
    )
    p = parse_stable(raw)
    assert p.text.endswith("bonus end.") and "LITTLE & CO., Publishers" in p.text
    assert "back matter" not in [s.label for s in p.stripped]


def test_catalogue_followed_by_transcribers_notes_is_cut_to_the_end():
    raw = gutenberg_wrap(
        f"CHAPTER I\n\n{big(4000)}\n\nCHAPTER II\n\n{big(4000)} end.\n\n"
        f"BOOKS BY A. WRITER\n\n{CATALOGUE}\n\n* * *\n\nTranscriber's Notes:\n\n{big(150)}"
    )
    p = parse_stable(raw)
    assert p.text.endswith("word end.") and [s.label for s in p.stripped][-1] == "back matter"


def test_catalogue_cut_never_cancels_a_front_matter_strip():
    # Front matter and catalogue together pass the size cap; the front matter, which
    # was stripped before the catalogue rule existed, is still stripped, and so is the
    # catalogue, bounded by its own last-tenth guard.
    raw = gutenberg_wrap(
        f"TITLE PAGE\n\n{big(600)}\n\nCHAPTER I\n\n{big(2000)}\n\nCHAPTER II\n\n"
        f"{big(2000)} end.\n\nBOOKS BY A. WRITER\n\n{CATALOGUE}"
    )
    p = parse_stable(raw)
    assert p.text.startswith("CHAPTER I") and p.text.endswith("word end.")
    assert [s.label for s in p.stripped][-2:] == ["front matter", "back matter"]
    assert p.warnings == []


def test_signature_lines_before_a_catalogue_stay_with_the_story():
    raw = gutenberg_wrap(
        f"CHAPTER I\n\n{big(2000)}\n\nCHAPTER II\n\n{big(2000)} end.\n\nI remain, as ever,\n\n"
        f"Your Affectionate Brother,\n\nWilliam Henry Brown\n\nBOOKS BY A. WRITER\n\n{CATALOGUE}"
    )
    p = parse_stable(raw)
    assert p.text.endswith("Your Affectionate Brother,\n\nWilliam Henry Brown")


def test_title_case_heading_behind_a_break_goes_with_the_catalogue():
    # Little Women: "* * *" / "Louisa M. Alcott's Writings" / "THE LITTLE WOMEN SERIES."
    raw = gutenberg_wrap(
        f"CHAPTER I\n\n{big(2000)}\n\nCHAPTER II\n\n{big(2000)} end.\n\n* * *\n\n"
        f"A. Writer's Works\n\nTHE SERIES.\n\n{CATALOGUE}"
    )
    p = parse_stable(raw)
    assert p.text.endswith("word end.")


@pytest.mark.parametrize("marker", ["FOOTNOTES:", "Footnotes.", "TRANSCRIBER'S NOTES"])
def test_notes_section_at_the_end_is_back_matter(marker):
    # The Odyssey, Gulliver's Travels and Monte Cristo end with "FOOTNOTES:", Three Men in a
    # Boat with "Footnotes.", none of them a heading candidate.
    raw = gutenberg_wrap(
        f"CHAPTER I\n\n{big(2000)}\n\nCHAPTER II\n\n{big(2000)} end.\n\n{marker}\n\n"
        "[1] A quotation from the Aeneid signifying a threat."
    )
    p = parse_stable(raw)
    assert p.text.endswith("word end.")
    assert [s.label for s in p.stripped][-1] == "back matter"


def test_the_end_of_a_manuscript_inside_the_story_is_not_its_end():
    # A Connecticut Yankee closes its frame after "THE END OF THE MANUSCRIPT".
    raw = gutenberg_wrap(
        f"CHAPTER I\n\n{big(2000)}\n\nCHAPTER II\n\n{big(2000)}\n\nTHE END OF THE MANUSCRIPT\n\n"
        "FINAL P.S. BY M.T.\n\nHe was getting up his last effect; but he never finished it."
    )
    p = parse_stable(raw)
    assert p.text.endswith("he never finished it.")
    assert "back matter" not in [s.label for s in p.stripped]


def test_marks_glued_to_words_pointing_into_a_cut_notes_section_are_removed():
    # The Odyssey glues its note numbers to words ("East.1", "Temesa4") or brackets
    # ("courts].49"), Monte Cristo to quotes ("deluge.'1") or italics ("_26"); numbers that
    # name no note, and a chemical formula, stay.
    raw = gutenberg_wrap(
        f"CHAPTER I\n\n{big(2000)} East.1 He went to Temesa2 with iron, a stang,3 and so.\n\n"
        f"CHAPTER II\n\n{big(2000)} At 7.10 in 1815 the deluge.'4 Byron9 wrote C_{{2}}H.\n"
        "The courts].5 Then _La savate!_6 came.\n\n"
        "FOOTNOTES:\n\n[1] [ Black races.]\n\n[2] [ A town.]\n\n[3] A stang is a pole.\n\n"
        "[4] The wicked drink water.\n\n[5] Courts.\n\n[6] A kick."
    )
    p = parse_stable(raw)
    assert "word East. He went to Temesa with iron, a stang, and so." in p.text
    assert p.text.endswith(
        "At 7.10 in 1815 the deluge.' Byron9 wrote C_{2}H.\nThe courts]. Then _La savate!_ came."
    )
    assert [p.text[h.start_cp:].split("\n")[0] for h in p.headings] == ["CHAPTER I", "CHAPTER II"]


def test_bracketed_and_braced_marks_pointing_into_a_cut_notes_section_are_removed():
    # Gulliver brackets its marks ("stang, [301]"), Three Men in a Boat braces them ("{287}");
    # a glued number beside them is a word.
    raw = gutenberg_wrap(
        f"CHAPTER I\n\n{big(2000)} A stang, [301] and so. Room No.1 was his.\n\n"
        f"CHAPTER II\n\n{big(2000)} A chat with. {{287}} You meet C_{{2}}H.\n\n"
        "FOOTNOTES:\n\n[1] A room.\n\n[301] A stang is a pole.\n\n{287} Or rather _were_."
    )
    p = parse_stable(raw)
    assert "word A stang, and so. Room No.1 was his." in p.text
    assert p.text.endswith("word A chat with. You meet C_{2}H.")


def test_an_introduction_listed_first_in_the_contents_is_front_matter():
    # The Wonderful Wizard of Oz lists Baum's "Introduction" before Chapter I.
    raw = gutenberg_wrap(
        "The Wonderful Wizard of Oz\n\nContents\n\n Introduction\n Chapter I. The Cyclone\n"
        f" Chapter II. The Council with the Munchkins\n\nIntroduction\n\n{big(195)}\n\n"
        f"Chapter I\nThe Cyclone\n\n{big(1000)}\n\nChapter II\nThe Council with the Munchkins\n\n"
        f"{big(1000)}"
    )
    p = parse_stable(raw)
    assert p.text.startswith("Chapter I\nThe Cyclone\n\nword")


def test_a_contents_entry_naming_the_work_does_not_start_the_story():
    # The Odyssey lists "THE ODYSSEY" between its prefaces and BOOK I, and repeats the
    # title over a break before BOOK I.
    raw = gutenberg_wrap(
        "THE ODYSSEY\n\nContents\n\n PREFACE TO FIRST EDITION\n THE ODYSSEY\n BOOK I.\n"
        " BOOK II.\n\n"
        f"PREFACE TO FIRST EDITION\n\n{big(100)}\n\nTHE ODYSSEY\n\n\n\n\nBOOK I\n\n{big(1000)}\n\n"
        f"BOOK II\n\n{big(1000)}",
        title="The Odyssey",
    )
    p = parse_stable(raw)
    assert p.text.startswith("BOOK I\n\nword")


ROMANS = ["I", "II", "III"]


def test_a_list_of_illustrations_under_the_contents_column_header_is_front_matter():
    # The Scarlet Letter heads both its contents and its list of illustrations "PAGE"; the
    # story opens with Hawthorne's Custom-House sketch, not with the list.
    entries = "\n\n".join(f"{n}. CHAPTER TITLE {n} {10 * i + 40}" for i, n in enumerate(ROMANS))
    raw = gutenberg_wrap(
        f"THE SCARLET LETTER.\n\nCONTENTS.\n\nPAGE\n\nTHE CUSTOM HOUSE.-INTRODUCTORY 1\n\n"
        f"THE SCARLET LETTER.\n\n{entries}\n\n\n\n\nLIST OF ILLUSTRATIONS.\n\nPAGE\n\n"
        "THE CUSTOM-HOUSE 1\n\nTHE PRISON DOOR 49\n\n\n\n\nTHE CUSTOM-HOUSE.\n\n"
        f"INTRODUCTORY TO \"THE SCARLET LETTER.\"\n\n{big(1500)}\n\n"
        + "\n\n".join(f"{n}.\n\nCHAPTER TITLE {n}.\n\n{big(1000)}" for n in ROMANS),
        title="The Scarlet Letter",
    )
    p = parse_stable(raw)
    assert p.text.startswith('THE CUSTOM-HOUSE.\n\nINTRODUCTORY TO "THE SCARLET LETTER."')


def test_a_plays_scene_list_and_first_night_cast_are_front_matter():
    # The Importance of Being Earnest lists its scenes "ACT I." to "ACT III." with the
    # first-night cast after the last, then heads the acts "FIRST ACT" and so on.
    raw = gutenberg_wrap(
        "THE PERSONS IN THE PLAY\n\nJohn Worthing, J.P.\nAlgernon Moncrieff\n\n"
        "THE SCENES OF THE PLAY\n\nACT I. Algernon Moncrieff's Flat in Half-Moon Street, W.\n\n"
        "ACT II. The Garden at the Manor House, Woolton.\n\n"
        "ACT III. Drawing-Room at the Manor House, Woolton.\n\nTIME: The Present.\n\n"
        "LONDON: ST. JAMES'S THEATRE\n\n* * * * *\n\n"
        "John Worthing, J.P.: Mr. George Alexander.\nAlgernon Moncrieff: Mr. Allen Aynesworth.\n\n"
        + "\n\n".join(f"{n} ACT\n\nSCENE\n\n{big(1000)}" for n in ("FIRST", "SECOND", "THIRD"))
    )
    p = parse_stable(raw)
    assert p.text.startswith("FIRST ACT\n\nSCENE\n\nword")


def test_a_short_first_chapter_before_a_long_one_still_starts_the_story():
    # Not a listing: chapter I has a body of its own.
    raw = gutenberg_wrap(
        f"TITLE\n\nCHAPTER I\n\nIt began.\n\nCHAPTER II\n\n{big(1000)}\n\n"
        f"CHAPTER III\n\n{big(1000)}"
    )
    assert parse_stable(raw).text.startswith("CHAPTER I\n\nIt began.")


def test_a_first_heading_ending_in_a_number_is_not_taken_for_a_listing():
    raw = f"TITLE\n\nContents\n\nDay 1\nDay 2\n\nDay 1\n\n{big(1000)}\n\nDay 2\n\n{big(1000)}"
    assert parse_stable(raw).text.startswith("Day 1\n\nword")


def test_numbers_in_words_stay_when_glued_numbers_do_not_count_up_the_notes():
    # With a notes section cut, a number glued to a word is a note mark only when such
    # numbers name the notes in order, as the Odyssey's and Monte Cristo's do.
    story = (
        "He drove the M5 motorway in a 4x4 that smelled of CO2. Room No.1 was his, and the "
        "droid R2-D2 sang. Vitamin B12 helped. The code was A1, and E=mc2 held."
    )
    notes = "\n\n".join(f"[{i}] Note {i} text." for i in range(1, 13))
    raw = gutenberg_wrap(
        f"CHAPTER I\n\n{big(2000)}\n\n{story}\n\nCHAPTER II\n\n{big(2000)}\n\nNOTES\n\n{notes}"
    )
    p = parse_stable(raw)
    assert story in p.text
    assert [s.label for s in p.stripped][-1] == "back matter"


@pytest.mark.parametrize(
    "line", ["The end.\n\nOr so I thought.", "Notes:", "Footnotes.", "Index."]
)
def test_a_marker_line_without_notes_after_it_stays_in_the_story(line):
    chapters = "\n\n".join(f"CHAPTER {n}\n\n{big(600)}" for n in range(1, 10))
    raw = gutenberg_wrap(f"{chapters}\n\nIt was over.\n\n{line}\n\n{big(400)} last.")
    p = parse_stable(raw)
    assert p.text.endswith("word last.")
    assert "back matter" not in [s.label for s in p.stripped]


def test_a_manuscripts_first_chapter_named_like_the_book_is_kept():
    # A docx whose Title is "The Lighthouse" and whose first chapter is too.
    names = ["The Lighthouse", "The Storm", "The Return", "The Keeper", "The Fog", "The Wreck",
             "The Search", "The Light", "The Shore", "The Dawn"]
    data = make_docx(
        [("Title", "The Lighthouse"), (None, "Contents"), *((None, n) for n in names)]
        + [x for n in names for x in (("Heading1", n), (None, f"{n} {big(900)}"))]
    )
    p = parse(data, "m.docx")
    assert p.text.startswith("The Lighthouse\n\nThe Lighthouse word")
    assert "front matter" in [s.label for s in p.stripped]


def test_a_manuscripts_opening_chapter_titled_introduction_is_kept():
    chapters = "\n\n".join(f"Chapter {n}\n\n{big(600)}" for n in range(1, 9))
    raw = (
        "My Novel\n\nContents\n\nIntroduction\nChapter 1\nChapter 2\nChapter 3\n\n"
        f"Introduction\n\n{big(500)}\n\n{chapters}"
    )
    assert parse_stable(raw).text.startswith("Introduction\n\nword")
    data = make_docx(
        [("Title", "Night Train"), (None, "Contents"), (None, "Introduction"),
         (None, "Chapter One"), (None, "Chapter Two")]
        + [x for n in ("Introduction", "Chapter One", "Chapter Two", "Chapter Three")
           for x in (("Heading1", n), (None, big(700)))]
    )
    assert parse(data, "m.docx").text.startswith("Introduction\n\nword")


def test_a_half_title_after_the_preface_is_not_kept_as_an_opening():
    chapters = "\n\n".join(f"Chapter {n}\n\n{big(600)}" for n in range(1, 9))
    body = (
        f"PREFACE\n\n{big(150)}\n\nTHE LANTERN\n\n"
        "A NOVEL IN THREE PARTS BY JOHN SMITH WITH TWELVE ILLUSTRATIONS BY THE AUTHOR AND A MAP\n\n"
        "LONDON: SMITH, ELDER AND COMPANY, FIFTEEN WATERLOO PLACE, NINETEEN HUNDRED AND ONE\n\n"
        f"TO MY MOTHER, WHO TAUGHT ME TO READ AND TO DOUBT\n\n{chapters}"
    )
    p = parse_stable(gutenberg_wrap(body, title="The Lantern"))
    assert p.text.startswith("Chapter 1\n\nword")


def test_empty_headings_before_a_chapter_whose_count_goes_on_are_no_listing():
    # Chapters I and II empty, III with text and IV after it: III is the story's start.
    later = ["IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]
    chapters = "\n\n".join(f"CHAPTER {n}\n\n{big(600)}" for n in later)
    raw = gutenberg_wrap(f"CHAPTER I\n\nCHAPTER II\n\nCHAPTER III\n\n{big(600)}\n\n{chapters}")
    assert parse_stable(raw).text.startswith("CHAPTER III\n\nword")


def test_a_heading_ending_in_a_number_after_a_page_header_is_kept():
    # The contents' "PAGE" recurs right over the first heading, "Day 1".
    days = "\n\n".join(f"Day {n}\n\n{big(700)}" for n in (1, 2, 3))
    raw = gutenberg_wrap(f"CONTENTS\n\nPAGE\n\nDAY 1 1\nDAY 2 9\n\n* * *\n\nPAGE\n\n{days}")
    assert parse_stable(raw).text.startswith("Day 1\n\nword")


@pytest.mark.parametrize(
    "line",
    [
        "He took the room marked No.1 and slept.[2]",
        "He left the A1 for the M4, then the M25 to Junction30 and home.",
    ],
)
def test_a_few_numbers_in_words_beside_a_cut_notes_section_stay(line):
    # Glued numbers are marks only where a book marks most of its notes that way and has
    # no bracketed marks: one "No.1", or four road names, are words.
    notes = "\n\n".join(f"[{i}] Note {i} text." for i in range(1, 31))
    raw = gutenberg_wrap(
        f"CHAPTER I\n\n{big(2000)}\n\n{line}\n\nCHAPTER II\n\n{big(2000)}\n\nNOTES\n\n{notes}"
    )
    p = parse_stable(raw)
    assert line.replace("[2]", "") in p.text
