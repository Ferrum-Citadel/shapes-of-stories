from app.core.language import english_ratio, is_english

EN = (
    "It was the best of times, it was the worst of times, it was the age of wisdom, "
    "it was the age of foolishness. "
) * 20
SHAKESPEARE = (
    "To be, or not to be, that is the question: Whether 'tis nobler in the mind to suffer "
    "the slings and arrows of outrageous fortune, or to take arms against a sea of troubles. "
) * 10
FR = (
    "C'était le meilleur des temps, c'était le pire des temps, c'était l'âge de la sagesse, "
    "c'était l'âge de la folie. "
) * 20
GR = "Ήταν η καλύτερη εποχή, ήταν η χειρότερη εποχή, ήταν η εποχή της σοφίας. " * 20


def test_english_and_archaic_english_pass():
    assert is_english(EN) and is_english(SHAKESPEARE)


def test_french_and_greek_blocked():
    assert not is_english(FR) and not is_english(GR)
    assert english_ratio(GR) == 0.0
