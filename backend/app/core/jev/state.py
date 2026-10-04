import hashlib
import json


def canonical_json(obj) -> str:
    return json.dumps(
        obj,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )


def build_state(
    work_kind: str,
    chapter: str,
    tail: str,
    passage: str,
) -> dict:
    return {
        "work_kind": work_kind,
        "chapter": chapter,
        "previous_passage_tail": tail,
        "passage": passage,
    }


def cache_key(state: dict, questions: dict) -> str:
    return hashlib.sha256(
        (canonical_json(state) + canonical_json(questions)).encode()
    ).hexdigest()
