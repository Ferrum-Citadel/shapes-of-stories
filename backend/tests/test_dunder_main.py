"""Entrypoint (`python -m app`): uvicorn is never actually started, only its call captured."""
import runpy
import sys

import uvicorn


def _run_main(monkeypatch, forwarded_allow_ips):
    captured = {}

    def fake_run(app, **kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(uvicorn, "run", fake_run)
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost/db")
    monkeypatch.setenv("SERVER_SECRET", "s")
    if forwarded_allow_ips is None:
        monkeypatch.delenv("FORWARDED_ALLOW_IPS", raising=False)
    else:
        monkeypatch.setenv("FORWARDED_ALLOW_IPS", forwarded_allow_ips)
    monkeypatch.delitem(sys.modules, "app.__main__", raising=False)
    runpy.run_module("app.__main__", run_name="__main__")
    return captured


def test_empty_forwarded_allow_ips_falls_back_to_loopback(monkeypatch):
    assert _run_main(monkeypatch, "")["forwarded_allow_ips"] == "127.0.0.1"


def test_unset_forwarded_allow_ips_falls_back_to_loopback(monkeypatch):
    assert _run_main(monkeypatch, None)["forwarded_allow_ips"] == "127.0.0.1"


def test_set_forwarded_allow_ips_is_passed_through(monkeypatch):
    assert _run_main(monkeypatch, "203.0.113.0/24")["forwarded_allow_ips"] == "203.0.113.0/24"
