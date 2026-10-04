import json
import subprocess
import sys
from pathlib import Path

from app.core.jev.questions import AXES

ROOT = Path(__file__).resolve().parents[2]


def test_questions_json_is_current(tmp_path):
    out = tmp_path / "q.json"
    subprocess.run(
        [sys.executable, "-m", "app.cli", "questions-json", "--out", str(out)],
        check=True,
        cwd=ROOT / "backend",
    )
    committed = (ROOT / "frontend/public/questions.json").read_text(encoding="utf-8")
    assert out.read_text(encoding="utf-8") == committed, (
        "frontend/public/questions.json is stale: run "
        "`uv run python -m app.cli questions-json --out ../frontend/public/questions.json`"
    )
    data = json.loads(committed)
    assert len(data["axes"]) == 10 and len(data["events"]) == 9 and data["version"]


def test_questions_json_joins_a_note_to_its_question(tmp_path):
    out = tmp_path / "q.json"
    subprocess.run(
        [sys.executable, "-m", "app.cli", "questions-json", "--out", str(out)],
        check=True,
        cwd=ROOT / "backend",
    )
    axes = {a["key"]: a for a in json.loads(out.read_text(encoding="utf-8"))["axes"]}
    assert axes["pace"]["question"].endswith(f" {AXES['pace'].note}")
    assert axes["fortune"]["question"] == AXES["fortune"].question
