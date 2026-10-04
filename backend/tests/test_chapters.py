from app.core.curves.chapters import chapter_stats
from app.core.curves.events import select_events
from app.core.structure import Chapter
from tests.curves_helpers import answers_for, make_work


def test_chapter_stats_basic():
    _, s = make_work(6, 600)  # 6 chapters, 1 beat each
    ans = answers_for(s, fortune=lambda i: float(i % 5), events={(2, "death"): 0.9})
    ans[4] = {"missing": True}
    st = chapter_stats(s, ans, select_events(s, ans))
    assert len(st) == 6 and st[2]["event_count"] == 1 and st[4]["means"]["fortune"] is None
    assert st[1]["means"]["fortune"] == 1.0 and st[0]["mode_share"] == {"action": 1.0}
    assert st[0]["start_bin"] == 0 and st[-1]["end_bin"] == 99 and st[0]["word_count"] == 602


def test_chapter_with_no_beats():
    _, s = make_work(3, 600)
    ch0, ch1, ch2 = s.chapters
    empty = Chapter(idx=1, title="Empty", start_cp=ch0.end_cp, end_cp=ch0.end_cp)
    s.chapters = [ch0, empty, ch1, ch2]
    for i, ch in enumerate(s.chapters):
        ch.idx = i
    for b in s.beats:
        if b.chapter_idx >= 1:
            b.chapter_idx += 1
    st = chapter_stats(s, {}, [])
    assert len(st) == 4
    empty_stats = st[1]
    assert empty_stats["beats"] == 0
    assert all(v is None for v in empty_stats["means"].values())
    assert empty_stats["mode_share"] == {}
    assert empty_stats["start_bin"] is None and empty_stats["end_bin"] is None
    assert empty_stats["word_count"] == 0
