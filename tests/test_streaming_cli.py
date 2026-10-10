"""Exercise the production Popen path with a real local process, never a model."""

import json
import os
import sys

from zippercrew.worker import execute


def test_streaming_cli_preserves_sessions_permissions_and_feedback(config, tmp_path, monkeypatch):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    log = tmp_path / "calls.jsonl"
    fake = bin_dir / "codex"
    fake.write_text(
        f"#!{sys.executable}\n"
        + f"LOG = {str(log)!r}\n"
        + """import json, os, sys, uuid
from pathlib import Path
args = sys.argv[1:]
prompt = sys.stdin.read()
resumed = "resume" in args
session = args[args.index("resume") + 1] if resumed else uuid.uuid4().hex
reviewer = "read-only" in args
with open(LOG, "a") as stream:
    stream.write(json.dumps({"args":args,"prompt":prompt,"session":session,
        "cwd":os.getcwd(),"key_inherited":"OPENAI_API_KEY" in os.environ}) + "\\n")
if reviewer:
    assert Path("result.txt").read_text() == "implemented"
    report = "APPROVE\\nFINDINGS: 0\\nThe checks pass." if resumed else (
        "REVISE\\nFINDINGS: 1\\nAdd a zero-input test.\\n\\nFull review evidence: zero still fails."
    )
else:
    Path("result.txt").write_text("implemented")
    report = "Updated result.txt."
for event in [
    {"type":"thread.started","thread_id":session},
    {"type":"item.completed","item":{"type":"agent_message","text":report}},
    {"type":"turn.completed"},
]:
    print(json.dumps(event), flush=True)
"""
    )
    fake.chmod(0o700)
    monkeypatch.setenv("PATH", str(bin_dir) + os.pathsep + os.environ["PATH"])
    monkeypatch.setenv("OPENAI_API_KEY", "test-sentinel-not-a-credential")
    config.update(workspace=str(workspace), workflow="review")
    for role, binding in config["agents"].items():
        binding.update(model=role.lower() + "-model", reasoning_effort="low")
    events = []
    answers = iter([{"value": "Another round", "note": "Keep the fix small."}, "Ship it"])
    outcome = execute(config, events.append, lambda request: next(answers))
    assert "Shipped after 2" in outcome
    first = [json.loads(line) for line in log.read_text().splitlines()]
    assert len(first) == 4
    assert first[0]["session"] == first[2]["session"]
    assert first[1]["session"] == first[3]["session"]
    assert first[0]["session"] != first[1]["session"]
    assert all(call["cwd"] == str(workspace) and not call["key_inherited"] for call in first)
    for index, call in enumerate(first):
        args = call["args"]
        assert args[args.index("--sandbox") + 1] == (
            "read-only" if index % 2 else "workspace-write"
        )
        assert "--ignore-user-config" in args and "mcp_servers={}" in args
        assert 'model_reasoning_effort="low"' in args
        assert args[args.index("--model") + 1] == (
            "reviewer-model" if index % 2 else "implementer-model"
        )
        assert ("resume" in args) == (index >= 2)
    full_review = (
        "REVISE\nFINDINGS: 1\nAdd a zero-input test.\n\nFull review evidence: zero still fails."
    )
    assert json.dumps(full_review)[1:-1] in first[2]["prompt"]
    assert "Keep the fix small." in first[2]["prompt"]
    assert sum(e["type"] == "assistant.invocation" for e in events) == 4
    execute(config, events.append, lambda request: "Ship it")
    second = [json.loads(line) for line in log.read_text().splitlines()][4:]
    assert len(second) == 2
    assert all("resume" not in call["args"] for call in second)
    assert {c["session"] for c in first}.isdisjoint(c["session"] for c in second)
