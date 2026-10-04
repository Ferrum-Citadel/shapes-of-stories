import json
import subprocess
import sys
from pathlib import Path


def test_analyze_synthetic_end_to_end(tmp_path: Path):
    f = tmp_path / "n.txt"
    f.write_text(
        "\n\n".join(
            [
                f"CHAPTER {i}\n\n" + ("The tide turned and the town waited. " * 120)
                for i in range(1, 13)
            ]
        )
    )
    out = tmp_path / "r.json"
    subprocess.run(
        [
            sys.executable,
            "-m",
            "app.cli",
            "analyze",
            str(f),
            "--mode",
            "synthetic",
            "--out",
            str(out),
        ],
        check=True,
    )
    r = json.loads(out.read_text())
    assert r["analysis"]["archetype"]["caption"]
    assert len(r["analysis"]["bins"]["fortune"]["shape"]) == 100
    assert len(r["answers"]) == len(r["structure"]["beats"]) and r["analysis"]["drivers"]


def test_analyze_fixture_mode_without_fixture_exits_2():
    result = subprocess.run(
        [sys.executable, "-m", "app.cli", "analyze", "x.txt", "--mode", "fixture"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 2
    assert json.loads(result.stderr) == {"error": "missing_fixture"}
