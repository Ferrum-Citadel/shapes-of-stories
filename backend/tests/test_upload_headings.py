"""Ordinary lines in a reader's own manuscript that must not become headings, and real
headings the book rules must not lose."""

from app.core.prepare import prepare
from tests.conftest import big


def layout(*parts: str) -> tuple[list[str], list[str]]:
    """Sections and chapters of a plain upload; "P" is a paragraph of prose."""
    body = "\n\n".join(big(60) if p == "P" else p for p in parts)
    s = prepare(body.encode(), "u.txt", enforce_english=False).structure
    return [x.title for x in s.sections], [c.title for c in s.chapters]


def test_titled_chapter_straight_under_a_part_is_a_chapter():
    assert layout(
        "PART ONE",
        "The Arrival",
        "P",
        "P",
        "The Storm",
        "P",
        "P",
        "The Hunt",
        "P",
        "P",
        "PART TWO",
        "The Return",
        "P",
        "P",
        "The Reckoning",
        "P",
        "P",
    ) == (
        ["PART ONE", "PART TWO"],
        ["The Arrival", "The Storm", "The Hunt", "The Return", "The Reckoning"],
    )


def test_letter_signatures_are_not_chapters():
    _, chapters = layout(
        "P",
        "P",
        "Dear Mina,",
        "P",
        "Dr. John Seward",
        "P",
        "P",
        "My dear friend,",
        "P",
        "Mrs. Mina Harker",
        "P",
        "P",
        "Dear Doctor,",
        "P",
        "Dr. Abraham Van Helsing",
        "P",
        "P",
    )
    assert not any(t.startswith(("Dr.", "Mrs.")) for t in chapters)


def test_shouted_contractions_do_not_outnumber_the_chapters():
    assert layout(
        "CHAPTER 1",
        "P",
        "I DON'T KNOW",
        "P",
        "WHERE'S MY SON",
        "P",
        "CHAPTER 2",
        "P",
        "DON'T TOUCH IT",
        "P",
        "IT'S MINE",
        "P",
        "CHAPTER 3",
        "P",
        "YOU CAN'T",
        "P",
        "I WON'T",
        "P",
    )[1][-3:] == ["CHAPTER 1", "CHAPTER 2", "CHAPTER 3"]


def test_numbered_sentences_in_a_story_are_not_chapters():
    for numerals in (("I.", "II.", "III."), ("I", "II", "III")):
        a, b, c = numerals
        _, chapters = layout(
            "P",
            "There were three reasons, she wrote.",
            f"{a}\nHe lied to me.",
            "P",
            f"{b}\nHe lied to my mother.",
            "P",
            f"{c}\nHe never said sorry.",
            "P",
            "P",
            "P",
        )
        assert not any("lied" in t for t in chapters)


def test_a_misprinted_numeral_needs_a_long_run_and_a_true_first_entry():
    for first, second in (("I", "V"), ("X", "II")):
        _, chapters = layout(
            "P",
            f"{first}\nThe first law",
            "P",
            f"{second}\nThe second law",
            "P",
            "III\nThe third law",
            "P",
        )
        assert not any("law" in t for t in chapters)


def test_conclusion_sub_heading_inside_chapters_is_not_a_chapter():
    assert layout(
        "CHAPTER 1",
        "P",
        "P",
        "Conclusion",
        "P",
        "CHAPTER 2",
        "P",
        "Conclusion",
        "P",
        "CHAPTER 3",
        "P",
    )[1] == ["CHAPTER 1", "CHAPTER 2", "CHAPTER 3"]


def test_closing_conclusion_after_titled_chapters_is_a_chapter():
    assert layout("The Arrival", "P", "The Storm", "P", "The Hunt", "P", "Conclusion", "P") == (
        [],
        ["The Arrival", "The Storm", "The Hunt", "Conclusion"],
    )


def test_empty_heading_over_a_title_opening_with_one_is_not_a_section():
    sections, _ = layout(
        "The Arrival",
        "P",
        "The Storm",
        "One Week Later",
        "P",
        "The Hunt",
        "P",
        "The End Game",
        "P",
    )
    assert sections == []


def test_listed_chapter_numbers_before_the_chapters_do_not_head_a_section():
    sections, _ = layout(
        "Chapter 1",
        "Chapter 2",
        "Chapter 3",
        "Chapter 1",
        "P",
        "Chapter 2",
        "P",
        "Chapter 3",
        "P",
    )
    assert sections == []


def test_scene_number_running_on_into_prose_is_not_a_chapter():
    assert layout(
        "CHAPTER 1",
        "P",
        "Scene 1 was shot in the rain.",
        "P",
        "CHAPTER 2",
        "P",
        "SCENE II was the one everybody remembered.",
        "P",
        "CHAPTER 3",
        "P",
    )[1] == ["CHAPTER 1", "CHAPTER 2", "CHAPTER 3"]


def test_ordinal_and_keyword_in_sentence_case_are_not_a_section():
    assert layout(
        "CHAPTER 1",
        "P",
        "Last act.",
        "P",
        "CHAPTER 2",
        "P",
        "Second part.",
        "P",
        "CHAPTER 3",
        "P",
    ) == ([], ["CHAPTER 1", "CHAPTER 2", "CHAPTER 3"])


def test_chapter_number_over_prose_lines_is_not_a_titled_heading():
    _, chapters = layout(
        "Chapter 1",
        "P",
        "Chapter 2",
        "P",
        "Chapter 3\nThe rain had not stopped for three days, and Ellen was beginning to\n"
        "think it never would. She sat by the window.",
        "P",
        "Chapter 4",
        "P",
    )
    assert not any("rain" in t for t in chapters)
    _, chapters = layout(
        "Chapter 1",
        "P",
        "Chapter 2",
        "P",
        "Chapter 3. That was what she called the year after the fire, when nothing\n"
        "grew and nobody came to the door, and the town forgot them.",
        "P",
        "Chapter 3",
        "P",
        "Chapter 4",
        "P",
    )
    assert chapters == ["Chapter 1", "Chapter 2", "Chapter 3", "Chapter 4"]


def test_closing_conclusion_is_a_chapter_after_a_wrapped_chapter_heading():
    assert (
        layout(
            "CHAPTER 1. The Start",
            "P",
            "CHAPTER 2. Of the Less Erroneous Pictures of Whales, and the True\n"
            "Pictures of Whaling Scenes.",
            "P",
            "CHAPTER 3. The End",
            "P",
            "Conclusion",
            "P",
        )[1][-1]
        == "Conclusion"
    )


def test_wrapped_paragraph_does_not_repeat_the_next_chapter_number():
    assert layout(
        "Chapter 1",
        "P",
        "Chapter 2",
        "P",
        "Chapter 3. That was what Mr. Holmes called the Baker Street Affair, when Dr.\n"
        "Watson and Inspector Lestrade came to London.",
        "P",
        "Chapter 3",
        "P",
        "Chapter 4",
        "P",
    )[1] == ["Chapter 1", "Chapter 2", "Chapter 3", "Chapter 4"]
