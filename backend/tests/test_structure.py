from app.core.ingest import parse
from app.core.ingest.model import Parsed
from app.core.structure import Chapter, build_structure, pack_prose, resolve_chapters
from app.core.text import paragraph_spans
from tests.conftest import big


def test_nested_part_book_chapter_uses_finest_level_with_three_plus():
    raw = "\n\n".join(
        [
            "PART I",
            "BOOK I",
            "CHAPTER I",
            big(20),
            "CHAPTER II",
            big(20),
            "BOOK II",
            "CHAPTER III",
            big(20),
        ]
    )
    p = parse(raw.encode(), "k.txt")
    sections, chapters, source = resolve_chapters(p)
    assert source == "headings"
    assert [c.title for c in chapters] == ["CHAPTER I", "CHAPTER II", "CHAPTER III"]
    assert [s.title for s in sections] == ["PART I", "BOOK I", "BOOK II"]
    assert chapters[2].section_idx == 2
    assert chapters[0].end_cp == chapters[1].start_cp and chapters[-1].end_cp == len(p.text)


def test_chapter_level_prefers_the_level_that_is_not_outnumbered_by_a_coarser_one():
    romans = ["I", "II", "III", "IV", "V", "VI"]
    parts = []
    for i, roman in enumerate(romans):
        parts.append(f"CHAPTER {roman}")
        parts.append(big(40))
        if i < 4:
            parts.append("Your Loving Father")
    raw = "\n\n".join(parts)
    p = parse(raw.encode(), "d.txt")
    sections, chapters, source = resolve_chapters(p)
    assert source == "headings"
    assert [c.title for c in chapters] == [f"CHAPTER {roman}" for roman in romans]
    assert sections == []


def test_epilogue_over_its_own_chapters_heads_a_section():
    # Crime and Punishment: "EPILOGUE" directly over its chapters "I" and "II"; The
    # Brothers Karamazov leaves a break between them.
    raw = "\n\n".join(
        [
            "PART I",
            "CHAPTER I",
            big(20),
            "CHAPTER II",
            big(20),
            "PART II",
            "CHAPTER I",
            big(20),
            "EPILOGUE",
            "* * *",
            "I",
            big(20),
            "II",
            big(20),
        ]
    )
    sections, chapters, _ = resolve_chapters(parse(raw.encode(), "e.txt"))
    assert [s.title for s in sections] == ["PART I", "PART II", "EPILOGUE"]
    assert [(c.title, c.section_idx) for c in chapters] == [
        ("CHAPTER I", 0),
        ("CHAPTER II", 0),
        ("CHAPTER I", 1),
        ("I", 2),
        ("II", 2),
    ]


def test_empty_chapter_heading_not_over_a_first_chapter_stays_a_chapter():
    raw = "\n\n".join(["CHAPTER 1", big(20), "CHAPTER 2", "CHAPTER 3", big(20)])
    sections, chapters, _ = resolve_chapters(parse(raw.encode(), "e.txt"))
    assert sections == [] and len(chapters) == 3


def test_book_subtitle_is_not_an_opening_and_a_conclusion_is_a_chapter():
    # The Mill on the Floss: "BOOK FIRST" / "BOY AND GIRL." / "Chapter I.", and a closing
    # "Conclusion".
    raw = "\n\n".join(
        [
            "BOOK FIRST",
            "BOY AND GIRL.",
            "Chapter I.",
            big(40),
            "Chapter II.",
            big(40),
            "BOOK SECOND.",
            "SCHOOL-TIME.",
            "Chapter I.",
            big(40),
            "Conclusion",
            big(40),
        ]
    )
    _, chapters, _ = resolve_chapters(parse(raw.encode(), "m.txt"))
    assert [c.title for c in chapters] == ["Chapter I.", "Chapter II.", "Chapter I.", "Conclusion"]


def test_fewer_than_three_headings_falls_back_to_deciles():
    # 20 equal-length paragraphs so each decile boundary lands exactly on a paragraph
    # start and every decile survives.
    raw = "\n\n".join([big(400) for _ in range(20)])
    _, chapters, source = resolve_chapters(parse(raw.encode(), "b.txt"))
    assert source == "deciles" and len(chapters) == 10 and chapters[0].title == "0–10%"


def test_a_short_text_is_cut_into_as_many_parts_as_it_has_passages_worth():
    for paragraphs, words, parts in ((4, 9, 1), (4, 250, 2), (20, 400, 10)):
        raw = "\n\n".join([big(words)] * paragraphs)
        _, chapters, source = resolve_chapters(parse(raw.encode(), "b.txt"))
        assert source == "deciles" and len(chapters) == parts
    s = build_structure(parse("\n\n".join([big(9)] * 4).encode(), "b.txt"))
    assert [c.title for c in s.chapters] == ["0–100%"] and len(s.beats) == 1


def test_decile_chapters_start_on_paragraphs():
    text = "\n\n".join([big(30) for _ in range(40)])
    p = Parsed(text=text, format="txt")
    starts = [a for a, _ in paragraph_spans(text)]
    _, chapters, source = resolve_chapters(p)
    assert source == "deciles"
    assert all(c.start_cp in starts or c.start_cp == 0 for c in chapters)
    assert chapters[0].start_cp == 0 and chapters[-1].end_cp == len(text)
    assert all(a.end_cp == b.start_cp for a, b in zip(chapters, chapters[1:], strict=False))
    s = build_structure(p)
    for beat in s.beats:
        expected_ch = max((c.idx for c in s.chapters if c.start_cp <= beat.start_cp), default=0)
        assert beat.chapter_idx == expected_ch


def test_opening_chapter_for_text_before_first_heading():
    raw = "\n\n".join([big(30), "I.", big(20), "II.", big(20), "III.", big(20)])
    p = parse(raw.encode(), "b.txt")
    _, chapters, _ = resolve_chapters(p)
    assert chapters[0].title == "Opening" and len(chapters) == 4


def test_opening_when_section_heading_opens_text():
    raw = "\n\n".join(
        ["PART I", big(30), "CHAPTER I", big(20), "CHAPTER II", big(20), "CHAPTER III", big(20)]
    )
    p = parse(raw.encode(), "b.txt")
    sections, chapters, _ = resolve_chapters(p)
    assert chapters[0].title == "Opening"
    assert chapters[0].start_cp == 0
    assert chapters[0].end_cp == chapters[1].start_cp
    assert len(chapters) == 4
    assert [s.title for s in sections] == ["PART I"]


def test_transcript_deciles_tile_the_text():
    srt = (
        "1\n00:00:00,000 --> 00:01:40,000\n" + " ".join(["word"] * 50) + "\n\n"
        "2\n00:01:41,000 --> 00:01:50,000\nmid\n\n"
        "3\n00:01:51,000 --> 00:02:00,000\nend\n"
    )
    p = parse(srt.encode(), "c.srt")
    _, chapters, source = resolve_chapters(p)
    assert source == "time"
    assert chapters[-1].end_cp == len(p.text)
    assert all(a.end_cp == b.start_cp for a, b in zip(chapters, chapters[1:], strict=False))
    assert chapters[0].start_cp == 0


def chapters_for(text, spans):
    return [Chapter(i, f"C{i}", a, b) for i, (a, b) in enumerate(spans)]


def test_beats_never_split_paragraphs_and_respect_bounds():
    paras = [big(400) for _ in range(24)]  # 9600 words (full-size), one chapter
    text = "\n\n".join(paras)
    beats = pack_prose(text, chapters_for(text, [(0, len(text))]), [])
    assert all(text[b.start_cp] != " " and text[b.end_cp - 1] != " " for b in beats)
    assert all(500 <= b.word_count <= 1200 for b in beats)
    assert sum(b.word_count for b in beats) == 9600
    assert [b.idx for b in beats] == list(range(len(beats)))


def test_beats_do_not_cross_chapters_or_breaks_and_remainder_merges():
    # 1400 words (< SHORT_WORK_WORDS): short-work target 400, min 250, max 600.
    c1 = "\n\n".join([big(300), big(300), big(200)])  # 800 -> [600] then 200 < 250 merges -> 800
    c2 = "\n\n".join([big(300), big(200), big(100)])  # 600 -> [500] then 100 < 250 merges -> 600
    text = c1 + "\n\n" + c2
    chs = chapters_for(text, [(0, len(c1)), (len(c1) + 2, len(text))])
    beats = pack_prose(text, chs, [])
    assert [(b.chapter_idx, b.word_count) for b in beats] == [(0, 800), (1, 600)]


def test_short_chapter_rule():
    c1 = big(260)
    c2 = big(200)
    c3 = big(900)
    text = "\n\n".join([c1, c2, c3])
    a, b, c = len(c1), len(c1) + 2 + len(c2), len(text)
    spans = [(0, a), (a + 2, b), (b + 2, c)]
    beats = pack_prose(text, chapters_for(text, spans), [])
    # c1 (260, over a short work's 250-word minimum passage) stands alone; c2 (200 < 250) merges
    # into the following beat (c3 is cut in two at the short-work maximum of 600)
    assert [(b_.chapter_idx, b_.word_count) for b_ in beats] == [(0, 260), (2, 650), (2, 450)]


def test_group_floor_in_a_full_size_work():
    # BEAT_MIN is 500 here, so only the 250-word floor decides whether the first chapter stands
    rest = "\n\n".join([big(500)] * 18)
    for size, alone in ((260, True), (240, False)):
        c1 = big(size)
        text = c1 + "\n\n" + rest
        beats = pack_prose(text, chapters_for(text, [(0, len(c1)), (len(c1) + 2, len(text))]), [])
        assert (beats[0].word_count == size) is alone


def test_short_last_chapter_merges_backward():
    c1 = big(900)
    c2 = big(100)
    text = c1 + "\n\n" + c2
    spans = [(0, len(c1)), (len(c1) + 2, len(text))]
    beats = pack_prose(text, chapters_for(text, spans), [])
    assert [b.word_count for b in beats] == [450, 550]


SENT = "The cat sat on the mat and then it slept."  # ten words


def test_long_paragraph_splits_at_sentence_ends_into_even_pieces():
    long = " ".join([SENT] * 500)  # one 5000-word paragraph
    text = long + "\n\n" + "\n\n".join([big(500)] * 8)  # 9000 words: full-size targets
    beats = pack_prose(text, chapters_for(text, [(0, len(text))]), [])
    inside = [b for b in beats if b.end_cp <= len(long)]
    assert [b.word_count for b in inside] == [1000] * 5
    assert all(text[b.start_cp : b.end_cp].startswith("The ") for b in inside)
    assert all(text[b.end_cp - 1] == "." for b in inside)
    assert sum(b.word_count for b in beats) == 9000


def test_long_paragraph_without_sentence_ends_splits_at_spaces():
    text = big(3000) + "\n\n" + "\n\n".join([big(500)] * 12)  # 9000 words
    beats = pack_prose(text, chapters_for(text, [(0, len(text))]), [])
    assert [b.word_count for b in beats[:3]] == [1000, 1000, 1000]
    assert beats[2].end_cp == 3000 * 5 - 1
    assert all(text[b.start_cp] != " " and text[b.end_cp - 1] != " " for b in beats)


def test_paragraph_just_over_the_maximum_splits_in_two():
    para = " ".join([SENT] * 120 + ["Yes."])  # 1201 words
    rest = "\n\n".join([big(500)] * 16)
    text = para + "\n\n" + rest
    chs = chapters_for(text, [(0, len(para)), (len(para) + 2, len(text))])
    beats = pack_prose(text, chs, [])
    assert [(b.chapter_idx, b.word_count) for b in beats[:2]] == [(0, 600), (0, 601)]
    assert text[beats[0].end_cp - 1] == "." and text[beats[1].start_cp :].startswith("The ")


def test_one_more_piece_rather_than_a_cut_inside_a_sentence():
    # 2,390 words: two pieces would cut at 1,190-1,200, inside the 60-word sentence ending at 1,210
    para = " ".join([SENT] * 115 + [big(59) + " end."] + [SENT] * 118)
    text = para + "\n\n" + "\n\n".join([big(500)] * 16)
    chs = chapters_for(text, [(0, len(para)), (len(para) + 2, len(text))])
    beats = pack_prose(text, chs, [])
    assert [(b.chapter_idx, b.word_count) for b in beats[:3]] == [(0, 800), (0, 790), (0, 800)]
    assert all(text[b.end_cp - 1] == "." for b in beats[:3])


def test_a_sentence_end_near_the_start_does_not_earn_one_more_piece():
    para = "One two three. " + big(2396)  # 2,399 words
    text = para + "\n\n" + "\n\n".join([big(500)] * 16)
    chs = chapters_for(text, [(0, len(para)), (len(para) + 2, len(text))])
    beats = pack_prose(text, chs, [])
    assert [(b.chapter_idx, b.word_count) for b in beats[:2]] == [(0, 1199), (0, 1200)]


def test_split_point_is_a_simple_sentence_end_test():
    # "Mr." passes for a sentence end: a wrong cut, but it only moves a passage boundary.
    para = big(700) + ' "Hello," said Mr. Smith, ' + big(700) + ' he said."'  # 1406 words
    text = para + "\n\n" + "\n\n".join([big(500)] * 16)
    chs = chapters_for(text, [(0, len(para)), (len(para) + 2, len(text))])
    beats = pack_prose(text, chs, [])
    assert text[beats[0].start_cp : beats[0].end_cp].endswith("said Mr.")
    assert text[beats[1].start_cp :].startswith("Smith, ")
    # a closing quote after the stop still ends the sentence
    para = " ".join([big(9) + ' end."'] * 130)  # 1300 words
    text = para + "\n\n" + "\n\n".join([big(500)] * 16)
    chs = chapters_for(text, [(0, len(para)), (len(para) + 2, len(text))])
    beats = pack_prose(text, chs, [])
    assert [b.word_count for b in beats[:2]] == [650, 650]
    assert text[beats[0].start_cp : beats[0].end_cp].endswith('end."')


def test_short_work_splits_a_long_paragraph_at_its_smaller_maximum():
    text = " ".join([SENT] * 500)  # 5000 words, one paragraph: maximum 600
    s = build_structure(Parsed(text=text, format="txt"))
    assert len(s.beats) == 9
    assert all(b.word_count <= 600 and text[b.end_cp - 1] == "." for b in s.beats)
    assert sum(b.word_count for b in s.beats) == 5000


def test_short_work_repack_moves_whole_pieces_only():
    # a 1,000-word story in four chapters: no cut below the short-work maximum to reach eight
    raw = "\n\n".join(f"CHAPTER {i}\n\n" + big(250) for i in range(1, 5))
    s = build_structure(parse(raw.encode(), "s.txt"))
    assert [b.word_count for b in s.beats] == [252] * 4
    # a 3,000-word story in three paragraphs: cut once at 600, six pieces, too few to re-pack
    text = "\n\n".join([" ".join([SENT] * 100)] * 3)
    s = build_structure(Parsed(text=text, format="txt"))
    assert [b.word_count for b in s.beats] == [500] * 6


def test_short_work_uses_400_target_and_floor_of_8():
    text = "\n\n".join([big(60)] * 40)  # 2400 words
    s = build_structure(Parsed(text=text, format="txt"))
    assert len(s.beats) >= 8 and s.preset == "prose"


def test_floor_of_8_is_reached_by_shrinking_target():
    text = "\n\n".join([big(300)] * 12)  # 3600 words; a single refit stops at 6 beats
    s = build_structure(Parsed(text=text, format="txt"))
    assert len(s.beats) >= 8
    assert sum(b.word_count for b in s.beats) == 3600


def test_screenplay_scenes_are_beats_and_tiny_scenes_merge_forward():
    script = (
        "INT. A - DAY\n\n"
        + big(350)
        + "\n\nINT. B - DAY\n\n"
        + big(100)
        + "\n\nINT. C - DAY\n\n"
        + big(400)
    )
    s = build_structure(parse(script.encode(), "s.fountain"))
    assert s.preset == "screenplay"
    assert [b.word_count for b in s.beats] == [354, 508]  # heading words count; B merges into C


def test_transcript_beats_by_time_with_silence_break():
    cues = []
    t = 0.0
    for i in range(60):  # 60 cues x 10 s = 600 s
        start_h, start_m, start_s = int(t // 3600), int(t // 60 % 60), int(t % 60)
        end_t = t + 9
        end_h, end_m, end_s = int(end_t // 3600), int(end_t // 60 % 60), int(end_t % 60)
        cues.append(
            f"{i + 1}\n{start_h:02d}:{start_m:02d}:{start_s:02d},000 --> "
            f"{end_h:02d}:{end_m:02d}:{end_s:02d},000\nline {i}\n"
        )
        t += 30 if i == 30 else 10  # 30 s gap after cue index 30 -> break
    s = build_structure(parse("\n".join(cues).encode(), "t.srt"))
    assert s.preset == "transcript"
    assert all(b.start_s is not None and 60 <= (b.end_s - b.start_s) <= 300 for b in s.beats)
    assert any(abs(b.start_s - 330.0) < 1 for b in s.beats)  # a beat starts right after gap


def test_short_opening_scene_is_kept():
    script = "INT. A - DAY\n\n" + big(50) + "\n\nINT. B - DAY\n\n" + big(400)
    s = build_structure(parse(script.encode(), "s.fountain"))
    assert [b.word_count for b in s.beats] == [458]
    assert s.beats[0].start_cp == 0


def test_scene_subpacking_honors_breaks():
    script = big(900) + "\n\n===\n\n" + big(900)
    p = parse(script.encode(), "s.fountain")
    s = build_structure(p)
    assert len(s.beats) == 2
    assert s.beats[1].start_cp == p.breaks[0]


def test_subpacked_scene_beats_get_their_own_chapter():
    third = "\n\n".join([big(600), big(600), big(600)])
    script = (
        "INT. A - DAY\n\n"
        + big(50)
        + "\n\nINT. B - DAY\n\n"
        + big(50)
        + "\n\nINT. C - DAY\n\n"
        + third
    )
    s = build_structure(parse(script.encode(), "s.fountain"))
    assert len(s.beats) >= 2
    for b in s.beats:
        expected_ch = max((c.idx for c in s.chapters if c.start_cp <= b.start_cp), default=0)
        assert b.chapter_idx == expected_ch
    assert sum(b.word_count for b in s.beats) == s.word_count


def test_break_between_part_heading_and_first_chapter_is_not_an_opening():
    # White Fang: "PART I", a run of blank lines (a break marker), then "CHAPTER I".
    raw = "\n\n".join(
        ["PART I", "* * *", "CHAPTER I", big(20), "CHAPTER II", big(20), "CHAPTER III", big(20)]
    )
    p = parse(raw.encode(), "b.txt")
    sections, chapters, _ = resolve_chapters(p)
    assert [c.title for c in chapters] == ["CHAPTER I", "CHAPTER II", "CHAPTER III"]
    assert [s.title for s in sections] == ["PART I"]
