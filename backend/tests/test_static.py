from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from tests.conftest import test_settings as make_settings


async def test_spa_fallback(pool, tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "a.js").write_text("console.log(1)")
    (tmp_path / "index.html").write_text("<html>app</html>")
    (tmp_path / "gallery" / "answers").mkdir(parents=True)
    (tmp_path / "gallery" / "answers" / "tiny.json").write_text("{}")
    from app.main import create_app

    app = create_app(make_settings(static_dir=str(tmp_path)), start_worker=False)
    async with LifespanManager(app), AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        asset = await c.get("/assets/a.js")
        assert asset.text == "console.log(1)"
        assert asset.headers["x-content-type-options"] == "nosniff"
        answers = await c.get("/gallery/answers/tiny.json")
        assert answers.text == "{}"
        assert answers.headers["cache-control"] == "public, max-age=0, must-revalidate"
        # The SPA route and the index file itself carry the same policy headers.
        for url in ("/works/abc123", "/", "/index.html", "/INDEX.HTML"):
            r = await c.get(url)
            assert r.status_code == 200
            assert "app" in r.text
            assert r.headers["x-content-type-options"] == "nosniff"
            assert r.headers["referrer-policy"] == "strict-origin-when-cross-origin"
            assert r.headers["permissions-policy"] == "camera=(), microphone=(), geolocation=()"
            assert r.headers["content-security-policy"] == (
                "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; "
                "font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; "
                "frame-ancestors 'none'; base-uri 'self'"
            )
        assert (await c.get("/api/nope")).status_code == 404
        traversal = await c.get("/../pyproject.toml")
        escaped = await c.get("/..%2fpyproject.toml")
        assert "[project]" not in traversal.text and "[project]" not in escaped.text
        assert "app" in escaped.text
