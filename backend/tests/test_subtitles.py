import pytest

from app.core.errors import IngestError
from app.core.ingest import parse

SRT = (
    "1\n00:00:01,000 --> 00:00:03,000\nHello <i>there</i>.\n\n"
    "2\n00:00:03,500 --> 00:00:05,000\nHow are you?\n\n"
    "3\n00:00:20,000 --> 00:00:22,000\nLater.\n"
)
VTT = (
    "WEBVTT\n\nNOTE Chapter: Opening\n\n"
    "00:01.000 --> 00:03.000\n<v Ann>Hi.</v>\n\n"
    "00:03.500 --> 00:05.000\n<v Bob>Hello.\n"
)


def test_srt_cues_tags_and_silence_break():
    p = parse(SRT.encode(), "a.srt")
    assert p.text.split("\n\n") == ["Hello there.", "How are you?", "Later."]
    assert [(c.start_s, c.end_s) for c in p.cues] == [(1.0, 3.0), (3.5, 5.0), (20.0, 22.0)]
    assert all(
        p.text[c.start_cp : c.end_cp] == t
        for c, t in zip(p.cues, ["Hello there.", "How are you?", "Later."], strict=True)
    )
    assert p.breaks == [p.cues[2].start_cp]


def test_vtt_voice_tags_and_chapter_note():
    p = parse(VTT.encode(), None)
    assert p.text.split("\n\n") == ["Ann: Hi.", "Bob: Hello."]
    assert [(h.level, h.title, h.start_cp) for h in p.headings] == [(2, "Opening", 0)]


def test_vtt_voice_tag_with_class():
    data = b"WEBVTT\n\n00:01.000 --> 00:03.000\n<v.loud Ann>Hi.</v>\n"
    assert parse(data, None).text == "Ann: Hi."


def test_vtt_fractional_timestamps_and_note_between_cues():
    data = (
        "WEBVTT\n\n00:01.500 --> 00:03.750\nOne.\n\n"
        "NOTE Chapter: Two\n\n00:12.250 --> 00:15.900\nTwo.\n"
    )
    p = parse(data.encode(), None)
    assert [(c.start_s, c.end_s) for c in p.cues] == [(1.5, 3.75), (12.25, 15.9)]
    assert [(h.level, h.title, h.start_cp) for h in p.headings] == [(2, "Two", p.cues[1].start_cp)]


def test_vtt_invalid_timestamp_is_typed_error():
    data = b"WEBVTT\n\n99:99.999 --> 99:99.999\nHello.\n"
    with pytest.raises(IngestError) as e:
        parse(data, None)
    assert e.value.code == "corrupt_file"


def test_srt_absurd_timecode_is_typed_error():
    data = b"1\n99999999999:00:00,000 --> 99999999999:00:01,000\nHi\n"
    with pytest.raises(IngestError) as e:
        parse(data, "a.srt")
    assert e.value.code == "corrupt_file"
