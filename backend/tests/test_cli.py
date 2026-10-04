import json
import subprocess
import sys

import pytest

from app import config
from app.core.errors import IngestError
from app.core.prepare import prepare
from tests.conftest import gutenberg_wrap


def test_prepare_bundle(tmp_path):
    body = "\n\n".join(
        [
            "CHAPTER I",
            " ".join(["word"] * 900),
            "CHAPTER II",
            " ".join(["the of and"] * 300),
            "CHAPTER III",
            " ".join(["it was the"] * 300),
        ]
    )
    pr = prepare(gutenberg_wrap(body).encode(), "b.txt")
    assert pr.parsed.title == "Test Book" and pr.structure.word_count == 900 + 900 + 900 + 6
    assert len(pr.content_hash) == 64 and pr.english
    assert pr.estimate.beats == len(pr.structure.beats)


def test_cli_preview_json(tmp_path):
    f = tmp_path / "b.txt"
    f.write_text(
        "\n\n".join(
            [
                "I.",
                "\n\n".join(["the cat sat " * 50] * 4),
                "II.",
                "\n\n".join(["the dog ran " * 50] * 4),
                "III.",
                "\n\n".join(["the end came " * 50] * 4),
            ]
        )
    )
    out = subprocess.run(
        [sys.executable, "-m", "app.cli", "preview", str(f), "--json"],
        capture_output=True,
        text=True,
        check=True,
    )
    data = json.loads(out.stdout)
    assert data["words"] == 1800 + 3 and data["chapters"] == 3 and data["beats"] >= 8


def test_prepare_rejects_oversize_upload_before_parsing(monkeypatch):
    monkeypatch.setattr(config, "UPLOAD_CAP_BYTES", 1000)
    with pytest.raises(IngestError) as e:
        prepare(b"x" * 1001, "b.txt")
    assert e.value.code == "over_upload_cap"


def test_gallery_build_quiet_suppresses_stderr_progress(tmp_path):
    cache = tmp_path / "cache"
    cache.mkdir()
    body = "\n\n".join(
        [f"CHAPTER {i}\n\n" + ("A quiet road under a wide sky. " * 120) for i in range(1, 10)]
    )
    (cache / "pg1.txt").write_text(gutenberg_wrap(body, title="Tiny"))
    lst = tmp_path / "list.toml"
    lst.write_text('[[work]]\nslug = "tiny"\ntitle = "Tiny"\nauthor = "Nobody"\npg_id = 1\n')

    quiet = subprocess.run(
        [
            sys.executable, "-m", "app.cli", "gallery-build", "--mode", "synthetic",
            "--list", str(lst), "--out", str(tmp_path / "out1"), "--cache", str(cache), "--quiet",
        ],
        capture_output=True, text=True, check=True,
    )
    assert quiet.stderr == ""
    assert json.loads(quiet.stdout)["built"] == ["tiny"]

    loud = subprocess.run(
        [
            sys.executable, "-m", "app.cli", "gallery-build", "--mode", "synthetic",
            "--list", str(lst), "--out", str(tmp_path / "out2"), "--cache", str(cache),
        ],
        capture_output=True, text=True, check=True,
    )
    assert loud.stderr != ""
    assert "tiny" in loud.stderr
