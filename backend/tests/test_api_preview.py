import asyncio
import threading
import time

from app import config
from app.api import upload
from tests.api_helpers import NOVEL
from tests.conftest import make_epub


async def test_preview_returns_structure_and_text_without_storing(client, pool):
    r = await client.post("/api/preview", content=NOVEL, headers={"X-Filename": "n.txt"})
    assert r.status_code == 200
    j = r.json()
    assert j["word_count"] > 7000
    assert len(j["beats"]) >= 8
    assert j["normalized_text"].startswith("CHAPTER 1")
    assert j["estimate"]["cost_usd"] > 0 and j["english"] is True
    async with pool.connection() as conn:
        cur = await conn.execute("select count(*) as n from works")
        assert (await cur.fetchone())["n"] == 0


async def test_preview_paste_and_typed_errors(client, monkeypatch):
    text = "C'était le meilleur des temps, c'était le pire des temps. " * 200
    r = await client.post("/api/preview", content=text.encode())
    assert r.status_code == 422 and r.json()["error"] == "not_english"
    r = await client.post("/api/preview", content=b"%PDF-1.4 junk", headers={"X-Filename": "x.pdf"})
    assert r.status_code == 415 and r.json()["error"] == "unsupported_format"
    monkeypatch.setattr(config, "UPLOAD_CAP_BYTES", 1000)
    r = await client.post("/api/preview", content=b"a" * 2000)
    assert r.status_code == 413


async def test_a_text_format_over_the_text_cap_is_refused_but_an_epub_is_not(client, monkeypatch):
    monkeypatch.setattr(config, "TEXT_CAP_BYTES", 1000)
    r = await client.post("/api/preview", content=b"a " * 1000, headers={"X-Filename": "a.md"})
    assert r.status_code == 413 and r.json() == {
        "error": "over_upload_cap",
        "detail": {"bytes": 2000, "cap": 1000},
    }
    data = make_epub(
        [(f"Chapter {i}", "<p>" + "The river ran on. " * 300 + "</p>") for i in (1, 2)]
    )
    assert len(data) > 1000
    r = await client.post("/api/preview", content=data, headers={"X-Filename": "b.epub"})
    assert r.status_code == 200


async def test_at_most_two_uploads_parse_at_once(monkeypatch):
    running, peak, lock = 0, 0, threading.Lock()

    def slow_prepare(data, filename, **kwargs):
        nonlocal running, peak
        with lock:
            running += 1
            peak = max(peak, running)
        time.sleep(0.05)
        with lock:
            running -= 1

    monkeypatch.setattr(upload, "_PARSING", asyncio.Semaphore(2))
    monkeypatch.setattr(upload, "prepare", slow_prepare)
    await asyncio.gather(*(upload.prepare_upload(b"x", "x.txt") for _ in range(5)))
    assert peak == 2


async def test_a_paste_has_no_title_and_an_uploaded_file_lends_its_name(client):
    r = await client.post("/api/preview", content=NOVEL)
    assert r.status_code == 200 and r.json()["title"] is None
    r = await client.post(
        "/api/preview", content=NOVEL, headers={"X-Filename": "great_expectations.txt"}
    )
    assert r.status_code == 200 and r.json()["title"] == "Great Expectations"
