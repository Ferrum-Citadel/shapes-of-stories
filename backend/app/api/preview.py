from dataclasses import asdict

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from app import config
from app.api.deps import client_ip, day_bucket, enforce_limit, get_pool
from app.api.upload import read_upload
from app.core.errors import IngestError
from app.core.language import english_ratio
from app.core.prepare import Prepared, prepare

router = APIRouter()


def prepared_payload(pr: Prepared) -> dict:
    s, p = pr.structure, pr.parsed
    return {
        "title": p.title, "author": p.author, "format": p.format, "word_count": s.word_count,
        "chapters": [asdict(c) for c in s.chapters], "sections": [asdict(x) for x in s.sections],
        "beats": [asdict(b) for b in s.beats], "preset": s.preset,
        "chapter_source": s.chapter_source,
        "stripped": [asdict(x) for x in p.stripped], "warnings": p.warnings,
        "estimate": asdict(pr.estimate), "content_hash": pr.content_hash, "english": pr.english,
        "normalized_text": p.text,
    }


@router.post("/api/preview")
async def preview(request: Request):
    async with get_pool(request).connection() as conn:
        await enforce_limit(
            conn, day_bucket("uploads", client_ip(request)), config.IP_UPLOADS_PER_DAY
        )
    data, name = await read_upload(request)
    # CPU-bound: off the event loop
    pr = await run_in_threadpool(prepare, data, name, enforce_english=False)
    if not pr.english:
        raise IngestError("not_english", ratio=round(english_ratio(pr.parsed.text), 3))
    return prepared_payload(pr)
