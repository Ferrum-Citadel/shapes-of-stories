"""Chapter counts of real editions, pinned on trimmed copies of their texts."""
from pathlib import Path

from app.core.prepare import prepare
from tests.conftest import big, gutenberg_wrap

FIXTURES = Path(__file__).parent / "fixtures"

ROMAN = [
    "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV",
    "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI", "XXII", "XXIII", "XXIV", "XXV", "XXVI",
    "XXVII", "XXVIII", "XXIX", "XXX", "XXXI", "XXXII", "XXXIII", "XXXIV", "XXXV", "XXXVI",
    "XXXVII", "XXXVIII", "XXXIX", "XL", "XLI", "XLII", "XLIII", "XLIV", "XLV", "XLVI", "XLVII",
]


def chapters(body: str) -> list[str]:
    pr = prepare(gutenberg_wrap(body).encode(), "b.txt", enforce_english=False)
    return [c.title for c in pr.structure.chapters]


def test_little_women_ends_at_chapter_47_without_the_publishers_catalogue():
    # The edition's last pages list the author's other books ("4. AN OLD-FASHIONED GIRL",
    # "Illustrated. 16mo. $1.50."); its numbered entries must not become chapters.
    story = "\n\n".join(f"{n}.\n\nA TITLE.\n\n{big(400)}" for n in ROMAN)
    tail = (FIXTURES / "little_women_catalogue.txt").read_text()
    titles = chapters(f"{story}\n\n{tail}")
    assert len(titles) == 47 and titles[-1] == "XLVII."


WAR_OF_THE_WORLDS = [
    "BOOK ONE\nTHE COMING OF THE MARTIANS", "I.\nTHE EVE OF THE WAR.", "II.\nTHE FALLING STAR.",
    "III.\nON HORSELL COMMON.", "IV.\nTHE CYLINDER OPENS.", "V.\nTHE HEAT-RAY.",
    "VI.\nTHE HEAT-RAY IN THE CHOBHAM ROAD.", "VII.\nHOW I REACHED HOME.", "VIII.\nFRIDAY NIGHT.",
    "IX.\nTHE FIGHTING BEGINS.", "X.\nIN THE STORM.", "XI.\nAT THE WINDOW.",
    "XII.\nWHAT I SAW OF THE DESTRUCTION OF WEYBRIDGE AND SHEPPERTON.",
    "XIII.\nHOW I FELL IN WITH THE CURATE.", "XIV.\nIN LONDON.",
    "XV.\nWHAT HAD HAPPENED IN SURREY.", "XVI.\nTHE EXODUS FROM LONDON.",
    'XVII.\nTHE "THUNDER CHILD".', "BOOK TWO\nTHE EARTH UNDER THE MARTIANS.",
    "I.\nUNDER FOOT.", "II.\nWHAT WE SAW FROM THE RUINED HOUSE.",
    "III.\nTHE DAYS OF IMPRISONMENT.", "IV.\nTHE DEATH OF THE CURATE.", "V.\nTHE STILLNESS.",
    "VI.\nTHE WORK OF FIFTEEN DAYS.", "VII.\nTHE MAN ON PUTNEY HILL.", "VIII.\nDEAD LONDON.",
    "IX.\nWRECKAGE.", "X.\nTHE EPILOGUE.",
]


def test_war_of_the_worlds_has_27_chapters_in_two_books():
    body = "\n\n".join(f"{h}\n\n{big(300)}" for h in WAR_OF_THE_WORLDS)
    pr = prepare(gutenberg_wrap(body).encode(), "b.txt", enforce_english=False)
    s = pr.structure
    assert s.chapter_source == "headings" and len(s.sections) == 2
    assert [sum(c.section_idx == i for c in s.chapters) for i in (0, 1)] == [17, 10]


HEIDI = [
    "CHAPTER I. UP THE MOUNTAIN TO ALM-UNCLE",
    "CHAPTER II. AT HOME WITH GRANDFATHER",
    "CHAPTER III. OUT WITH THE GOATS",
    "CHAPTER IV. THE VISIT TO GRANDMOTHER",
    "CHAPTER V. TWO VISITS AND WHAT CAME OF THEM",
    "CHAPTER VI. A NEW CHAPTER ABOUT NEW THINGS",
    "CHAPTER VII. FRAULEIN ROTTENMEIER SPENDS AN UNCOMFORTABLE DAY",
    "CHAPTER VIII. THERE IS GREAT COMMOTION IN THE LARGE HOUSE",
    "CHAPTER IX. HERR SESEMANN HEARS OF THINGS WHICH ARE NEW TO HIM",
    "CHAPTER X. ANOTHER GRANDMOTHER",
    "CHAPTER XI. HEIDI GAINS IN ONE WAY AND LOSES IN ANOTHER",
    "CHAPTER XII. A GHOST IN THE HOUSE",
    "CHAPTER XIII. A SUMMER EVENING ON THE MOUNTAIN",
    "CHAPTER XIV. SUNDAY BELLS",
    "CHAPTER XV. PREPARATIONS FOR A JOURNEY",
    "CHAPTER XVI. A VISITOR",
    "CHAPTER XVII. A COMPENSATION",
    "CHAPTER XVIII. WINTER IN DORFLI",
    "CHAPTER XIX. THE WINTER CONTINUES",
    "CHAPTER XX. NEWS FROM DISTANT FRIENDS",
    "CHAPTER XXI. HOW LIFE WENT ON AT GRANDFATHER'S",
    "CHAPTER XXII. SOMETHING UNEXPECTED HAPPENS",
    'CHAPTER XXIII. "GOOD-BYE TILL WE MEET AGAIN"',
]


def test_heidi_has_all_23_chapters_after_its_introduction():
    # Chapters VII and IX are titled on lines longer than 60 characters; the editor's
    # introduction before chapter I is front matter.
    body = "\n\n".join(f"{h}\n\n{big(300)}" for h in ["INTRODUCTION", *HEIDI])
    titles = chapters(body)
    assert titles == HEIDI


def structure(body: str):
    return prepare(gutenberg_wrap(body).encode(), "b.txt", enforce_english=False).structure


def test_play_acts_are_sections_and_its_scenes_chapters():
    # Romeo and Juliet: a prologue, then acts of numbered scenes, one titled past 60 characters.
    body = "\n\n".join([
        "THE PROLOGUE", big(120), "ACT I", "SCENE I. A public place.", big(300),
        "SCENE II. A Street.", big(300), "ACT III", "SCENE IV. A Room in Capulet's House.",
        big(300), "SCENE V. An open Gallery to Juliet's Chamber, overlooking the Garden.",
        big(300), "SCENE VI. A Street.", big(300),
    ])
    s = structure(body)
    assert [x.title for x in s.sections] == ["ACT I", "ACT III"]
    assert [(c.title[:9], c.section_idx) for c in s.chapters] == [
        ("THE PROLO", None), ("SCENE I. ", 0), ("SCENE II.", 0), ("SCENE IV.", 1),
        ("SCENE V. ", 1), ("SCENE VI.", 1),
    ]


def test_acts_named_by_an_ordinal_are_the_chapters_and_stage_lines_are_not():
    # The Importance of Being Earnest heads its acts "FIRST ACT" and marks the stage with
    # bare "SCENE", "ACT DROP" and "TABLEAU" lines.
    body = "\n\n".join(
        part
        for act in ("FIRST", "SECOND", "THIRD")
        for part in (f"{act} ACT", "SCENE", big(300), "ACT DROP")
    ) + "\n\nTABLEAU\n\nCURTAIN"
    assert [c.title for c in structure(body).chapters] == ["FIRST ACT", "SECOND ACT", "THIRD ACT"]
