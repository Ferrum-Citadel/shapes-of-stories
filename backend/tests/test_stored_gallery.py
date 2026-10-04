"""The committed gallery files agree with the current code and gallery/list.toml, so a change
that would need a gallery-build or a recurve fails here until the stored files are rebuilt."""

import hashlib
import json
import tomllib
from pathlib import Path

import pytest

from app.core.jev.questions import MODEL_ID, QUESTION_SET_VERSION
from app.gallery import ANSWERS, config_hash, scoring_hash, structure_hash
from app.worker import structure_from_json

ROOT = Path(__file__).resolve().parents[2]
GALLERY = ROOT / "frontend" / "public" / "gallery"
WORKS = tomllib.loads((ROOT / "gallery" / "list.toml").read_text())["work"]


def test_index_lists_exactly_the_works_of_the_list_by_title():
    index = json.loads((GALLERY / "index.json").read_text())
    slugs = [w["slug"] for w in WORKS]
    assert len(set(slugs)) == len(slugs)
    # the build writes the index sorted by title
    assert [e["slug"] for e in index] == [
        w["slug"] for w in sorted(WORKS, key=lambda w: w["title"])
    ]


@pytest.mark.parametrize("w", WORKS, ids=[w["slug"] for w in WORKS])
def test_stored_work_matches_the_code_and_the_list(w):
    slug = w["slug"]
    meta = json.loads((GALLERY / f"{slug}.json").read_text())
    text = (GALLERY / f"{slug}.txt").read_bytes()
    answers = json.loads((GALLERY / ANSWERS / f"{slug}.json").read_text())
    work = meta["work"]
    assert (work["question_set_version"], work["model_id"]) == (QUESTION_SET_VERSION, MODEL_ID)
    assert (work["scoring_hash"], work["config_hash"]) == (scoring_hash(), config_hash())
    assert work["content_hash"] == hashlib.sha256(text).hexdigest()
    s = structure_from_json(meta["structure"])
    assert work["structure_hash"] == structure_hash(s)
    declared = {k: w[k] for k in ("sections", "chapters") if k in w}
    assert {k: len(getattr(s, k)) for k in declared} == declared
    assert set(answers) == {str(b.idx) for b in s.beats}
    assert meta["analysis"]["missing_beats"] == []
