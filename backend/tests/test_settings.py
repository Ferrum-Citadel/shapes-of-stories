import pytest

from app.settings import Settings


@pytest.mark.parametrize("secret", ["", "change-me-to-32-random-bytes-base64", None])
def test_an_empty_or_example_secret_refuses_to_start(monkeypatch, secret):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost/db")
    if secret is None:
        monkeypatch.delenv("SERVER_SECRET", raising=False)
    else:
        monkeypatch.setenv("SERVER_SECRET", secret)
    with pytest.raises(SystemExit, match="SERVER_SECRET"):
        Settings.from_env()


@pytest.mark.parametrize("secret", ["dev", "ci", "8f3c2a9e1b7d4c6f"])
def test_any_other_secret_is_accepted(monkeypatch, secret):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost/db")
    monkeypatch.setenv("SERVER_SECRET", secret)
    assert Settings.from_env().server_secret == secret
