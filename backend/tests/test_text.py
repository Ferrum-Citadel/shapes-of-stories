from app.core import text as T


def test_normalize_nfc_quotes_dashes_and_unwrap():
    raw = "It’s “fine” — ok.\r\nHe said\nso. Café\n\n\n\nNext  para."
    out = T.normalize(raw)
    assert out == "It's \"fine\" - ok.\nHe said so. Café\n\nNext para."


def test_normalize_keeps_break_before_uppercase_as_paragraph_when_blank_line():
    assert T.normalize("One.\n\nTwo.") == "One.\n\nTwo."


def test_normalize_joins_hard_wrap_only_before_lowercase():
    out = T.normalize("a line\nbroken here\nAnd a new sentence")
    assert out == "a line broken here\nAnd a new sentence"


def test_normalize_is_idempotent_on_indented_continuation_lines():
    # An indented continuation line is a hard wrap too; joining it only once its
    # indentation has been stripped by an earlier pass made normalize() non-idempotent.
    out = T.normalize("a line\n    broken here\nAnd a new sentence")
    assert out == "a line broken here\nAnd a new sentence"
    assert T.normalize(out) == out


def test_word_count_is_split():
    assert T.word_count("a  b\n\nc") == 3


def test_paragraph_spans():
    t = "Para one.\n\nPara two is here.\n\n\n\nThree."
    spans = T.paragraph_spans(t)
    assert [t[a:b] for a, b in spans] == ["Para one.", "Para two is here.", "Three."]


def test_sentence_spans_handle_quotes_and_abbreviations():
    t = 'He left. "Really?" she asked. Mr. Smith agreed. Done'
    s = T.sentence_spans(t, 0, len(t))
    expected = ['He left.', '"Really?" she asked.', 'Mr. Smith agreed.', 'Done']
    assert [t[a:b] for a, b in s] == expected


def test_tail_last_sentences_capped_by_words():
    t = "One. Two two. Three three three. Four four four four. Five."
    assert T.tail(t, 0, len(t)) == "Two two. Three three three. Four four four four. Five."
    assert T.tail(t, 0, len(t), max_words=3) == "Five."


def test_tail_of_empty_is_empty():
    assert T.tail("", 0, 0) == ""


def _beat(*word_counts):
    t = "\n\n".join(" ".join(f"w{i}" for i in range(n)) for n in word_counts)
    return t, T.paragraph_spans(t)


def test_driver_chunks_merge_short_lines_keep_long_alone_and_fold_the_remainder():
    t, spans = _beat(10, 20, 60, 100, 30, 30)
    assert T.driver_chunks(t, spans) == [(0, 2), (3, 5)]


def test_driver_chunks_keep_a_long_paragraph_alone_by_folding_short_lines_before_it_back():
    t, spans = _beat(100, 10, 20, 100, 90)
    assert T.driver_chunks(t, spans) == [(0, 2), (3, 3), (4, 4)]
    t, spans = _beat(10, 20, 100, 90)  # nothing before the lines to fold into: merge forward
    assert T.driver_chunks(t, spans) == [(0, 2), (3, 3)]


def test_driver_chunks_cover_the_beat_in_order_without_splitting_paragraphs():
    t, spans = _beat(5, 90, 40, 40, 80, 79, 1, 200, 7)
    chunks = T.driver_chunks(t, spans)
    assert chunks[0][0] == 0 and chunks[-1][1] == len(spans) - 1
    assert all(b >= a for a, b in chunks)
    assert all(chunks[i + 1][0] == chunks[i][1] + 1 for i in range(len(chunks) - 1))
    assert all(T.word_count(c) >= 80 for c in T.chunk_texts(t, spans, chunks))


def test_driver_chunks_one_paragraph_and_short_beats_are_one_chunk():
    t, spans = _beat(300)
    assert T.driver_chunks(t, spans) == [(0, 0)]
    t, spans = _beat(10, 20, 30)
    assert T.driver_chunks(t, spans) == [(0, 2)]
    assert T.driver_chunks("", []) == []


def test_chunk_texts_span_from_first_to_last_paragraph():
    t, spans = _beat(2, 3, 4)
    assert T.chunk_texts(t, spans, [(0, 1), (2, 2)]) == ["w0 w1\n\nw0 w1 w2", "w0 w1 w2 w3"]


def test_decode_handles_bom_utf16_and_cp1252():
    assert T.decode(b"\xef\xbb\xbfCHAPTER I\n\nText.") == "CHAPTER I\n\nText."
    assert T.decode("CHAPTER I\n\nText.".encode("utf-16")) == "CHAPTER I\n\nText."
    assert "Café" in T.decode("Café au lait, said the maître.".encode("cp1252"))
