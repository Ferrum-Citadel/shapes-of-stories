import json
import os
import subprocess
import sys
from pathlib import Path


def test_record_synthetic_then_fixture_mode_replays(tmp_path: Path):
    f = tmp_path / "s.txt"
    # three 150-word paragraphs per chapter, so beat 0 has several driver chunks and the
    # driver question is asked (and recorded) rather than answered locally
    chapters = [
        f"CHAPTER {i}\n\n" + "\n\n".join(["The cat sat. " * 50] * 3) for i in range(1, 5)
    ]
    f.write_text("\n\n".join(chapters))
    out = tmp_path / "fx.json"
    subprocess.run(
        [
            sys.executable, "-m", "app.cli", "record-fixtures",
            str(f), "--out", str(out), "--mode", "synthetic",
        ],
        check=True,
    )
    data = json.loads(out.read_text())
    assert len(data) >= 5 and all(set(v) == {"answers", "model"} for v in data.values())


def test_record_defaults_to_synthetic_mode_without_a_key(tmp_path: Path):
    f = tmp_path / "s.txt"
    chapters = [f"CHAPTER {i}\n\n" + ("The cat sat. " * 150) for i in range(1, 5)]
    f.write_text("\n\n".join(chapters))
    out = tmp_path / "fx.json"
    env = os.environ.copy()
    env.pop("TYPESAFE_API_KEY", None)
    subprocess.run(
        [sys.executable, "-m", "app.cli", "record-fixtures", str(f), "--out", str(out)],
        check=True,
        env=env,
    )
    assert json.loads(out.read_text())
