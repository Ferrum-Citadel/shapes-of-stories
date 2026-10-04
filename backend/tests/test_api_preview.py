from app import config
from tests.api_helpers import NOVEL


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
