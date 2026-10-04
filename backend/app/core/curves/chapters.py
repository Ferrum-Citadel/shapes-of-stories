from collections import Counter

from app.core.curves.bins import bin_of_beat
from app.core.curves.events import mode_of
from app.core.jev.questions import AXES
from app.core.structure import Structure


def chapter_stats(s: Structure, answers: dict[int, dict], events: list[dict]) -> list[dict]:
    out = []
    strong_by_chapter = Counter(
        s.beats[e["beat_idx"]].chapter_idx for e in events if e["strength"] == "strong"
    )
    for ch in s.chapters:
        beats = [b for b in s.beats if b.chapter_idx == ch.idx]
        good = [b for b in beats if answers.get(b.idx) and not answers[b.idx].get("missing")]
        tw = sum(b.word_count for b in good)
        means = {
            ax: (
                round(
                    sum(answers[b.idx]["scores"][ax]["score"] * b.word_count for b in good) / tw,
                    3,
                )
                if tw
                else None
            )
            for ax in AXES
        }
        modes = Counter(mode_of(answers[b.idx]) for b in good)
        share = {m: round(c / len(good), 3) for m, c in modes.items()} if good else {}
        bins = [bin_of_beat(s, b.idx) for b in beats]
        out.append(
            {
                "idx": ch.idx,
                "title": ch.title,
                "word_count": sum(b.word_count for b in beats),
                "beats": len(beats),
                "means": means,
                "mode_share": share,
                "event_count": strong_by_chapter.get(ch.idx, 0),
                "tension_max": max(
                    (answers[b.idx]["scores"]["tension"]["score"] for b in good), default=None
                ),
                "start_bin": bins[0][0] if bins else None,
                "end_bin": bins[-1][1] if bins else None,
            }
        )
    return out
