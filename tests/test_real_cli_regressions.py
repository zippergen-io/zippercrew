"""Regressions from the real-CLI audit, without additional model calls."""

import json
import shlex
import subprocess
import sys

import pytest

from zippercrew.activity import command_kind, summarize
from zippercrew.adapter import assistant_backend, load_process
from zippercrew.decisions import decision_summary, double_review_summary, plain_summary
from zippercrew.state import apply_event, initial_state


@pytest.mark.parametrize("action_name", ["implement", "review"])
def test_embedded_status_is_emitted_once_and_removed_before_review_parsing(
    config, monkeypatch, action_name
):
    events, calls = [], []
    report = "Added test_negative."
    if action_name == "review":
        report = "APPROVE\nFINDINGS: 0\nThe checks passed."
    status = "The changes are complete. I am preparing the report."

    def factory(selection, *, project_root, on_progress=None):
        def invoke(action, inputs):
            calls.append(action.name)
            on_progress({"kind": "invocation.started", "invocation_id": "real-turn"})
            on_progress({"kind": "ui_status", "invocation_id": "real-turn", "text": status})
            return {
                action.outputs[0][0]: (
                    f"<ui-status>{status}</ui-status>\n{report}\n"
                    "<ui-status>Verification finished. The report is ready.</ui-status>"
                )
            }

        return invoke

    monkeypatch.setattr("zippercrew.adapter.make_cli_assistant_backend", factory)
    _, module = load_process()
    action = getattr(module, action_name)
    result = assistant_backend(config, events.append)(action, {})
    assert result[action.outputs[0][0]] == report
    assert calls == [action_name]  # No needless format-repair call.
    statuses = [e for e in events if e["type"] == "assistant.ui_status"]
    assert [e["text"] for e in statuses] == [status, "Verification finished. The report is ready."]
    assert all(e["invocation_id"] == "real-turn" for e in statuses)


def test_status_is_removed_from_format_repair_too(config, monkeypatch):
    events, calls = [], []

    def factory(selection, *, project_root, on_progress=None):
        def invoke(action, inputs):
            calls.append(action.name)
            on_progress({"kind": "invocation.started", "invocation_id": str(len(calls))})
            report = (
                '```json\n{"verdict":"APPROVE","findings":0}\n```'
                if "review_to_format" in inputs
                else "Looks good, no concerns."
            )
            return {action.outputs[0][0]: f"<ui-status>Report ready.</ui-status>\n{report}"}

        return invoke

    monkeypatch.setattr("zippercrew.adapter.make_cli_assistant_backend", factory)
    _, module = load_process()
    result = assistant_backend(config, events.append)(module.review, {})
    assert len(calls) == 2
    assert result[module.review.outputs[0][0]].startswith("APPROVE\nFINDINGS: 0\n")
    assert "ui-status" not in result[module.review.outputs[0][0]]
    repair = next(e for e in events if e["type"] == "assistant.review_format")
    assert repair["repaired"] and "ui-status" not in str(repair)


@pytest.mark.parametrize("command", ["python3 -m unittest", "cd repo && python3 -m unittest"])
def test_refused_commands_never_claim_completion_or_success(command):
    result = summarize(
        {
            "kind": "command",
            "phase": "completed",
            "command": command,
            "status": "failed",
            "output": "This command requires approval\n11 passed in 1s",
        }
    )
    assert "was blocked" in result["text"]
    assert result["result"] == "blocked"
    assert result["detail"] == "Approval was required"
    assert "passed" not in str(result)
    failed = summarize(
        {
            "kind": "command",
            "phase": "completed",
            "command": command,
            "status": "failed",
        }
    )
    assert "failed" in failed["text"] and failed["result"] == "failed"


@pytest.mark.parametrize("workflow", ["direct", "review", "double_review"])
def test_decision_projects_verification_even_after_progress_eviction_and_resets_next_round(
    config, workflow
):
    config["workflow"] = workflow
    state = initial_state("verification", config)
    counter = 0

    def apply(kind, **fields):
        nonlocal counter
        counter += 1
        apply_event(state, {"id": counter, "type": kind, **fields})

    def start():
        apply(
            "runtime",
            event={
                "type": "act_start",
                "lifeline": "Implementer",
                "action_kind": "assistant",
                "action": "implement",
            },
        )
        apply("assistant.invocation", role="Implementer", invocation_id="turn")

    def command(text, **result):
        activity = summarize({"kind": "command", "phase": "completed", "command": text, **result})
        apply("assistant.progress", role="Implementer", invocation_id="turn", activity=activity)

    def decision():
        apply("human.required", request={"id": "decision", "summary": {"verification": []}})
        return state["pending"]["summary"]["verification"]

    start()
    test_command = "cd repo && python3 -m unittest"
    command(test_command, status="failed", output="This command requires approval")
    for n in range(45):
        command(f"cat file{n}.py", exit_code=0)
    assert "blocked" not in str(state["progress"])
    assert decision() == ["Worker: Test command was blocked. Approval was required."]
    # An unrelated successful test does not prove the refused suite ran.
    command("pytest another_test.py", exit_code=0)
    assert decision()
    command(test_command, exit_code=0)
    assert not decision()
    command(test_command, status="failed", output="This command requires approval")
    assert decision()
    start()
    assert not decision()


def test_explicit_verification_gaps_survive_both_review_summaries():
    metadata = {
        "verification": {
            "status": "partial",
            "reason": "The persistence test could not run in the read-only sandbox.",
        }
    }
    review = (
        "APPROVE\nFINDINGS: 0\nNo defects found.\n<decision-summary>"
        + json.dumps(metadata)
        + "</decision-summary>"
    )
    assert decision_summary("Added save_file.", review, "APPROVE|0|No defects found.")[
        "verification"
    ] == [metadata["verification"]["reason"]]
    summary = double_review_summary("Added save_file.", review, review)
    assert summary["verification"] == [metadata["verification"]["reason"]]
    assert summary["recommendation"] == "Ship it"  # Evidence does not fabricate a verdict.


def test_summary_preserves_code_identifiers():
    assert (
        plain_summary("**Added** `test_negative` in _test_calc.py_.")
        == "Added test_negative in test_calc.py."
    )
    assert (
        plain_summary("Keep __init__ and snake_case intact.")
        == "Keep __init__ and snake_case intact."
    )
    assert (
        plain_summary("_Tests passed_ and test_calc.py is ready.")
        == "Tests passed and test_calc.py is ready."
    )


@pytest.mark.parametrize(
    "failed,passed,rerun",
    [
        ("pytest tests/test_calc.py -q", "pytest -q", False),
        ("pytest tests/test_calc.py::TestCalc::test_negative", "pytest tests -v", False),
        ("python3 -m unittest tests.test_calc", "python3 -m unittest -v", False),
        ("python3 -m unittest tests.test_calc", "python3 -m unittest discover -s tests -v", False),
        ("python3 -m unittest tests.test_calc", "python3 -m unittest discover -v", False),
        ("uv run pytest tests/test_calc.py", "uv run pytest -q", False),
        ("pytest tests/test_calc.py", "pytest tests/test_other.py", False),
        ("pytest tests/test_calc.py", "pytest tests -k other", False),
        ("pytest tests/test_calc.py", "pytest -c other.ini", False),
        ("pytest tests/test_calc.py", "python3 -m pytest", False),
        ("uv run pytest tests/test_calc.py", "pytest", False),
        ("pytest /elsewhere/test_calc.py", "pytest", False),
        ("pytest tests/unit/test_calc.py", "pytest tests/integration", False),
        ("pytest", "pytest tests/test_calc.py", False),
        ("pytest tests/test_calc.py", "echo OK && pytest", False),
        (
            "python3 -m unittest tests.test_calc",
            "python3 -m unittest discover -p test_other.py",
            False,
        ),
        ("pytest scripts/check_db.py", "pytest", False),
        ("python3 -m unittest checks_calc.py", "python3 -m unittest", False),
        ("cd a && pytest", "cd b && pytest", False),
        ("pytest tests/test_calc.py", "pytest tests/test_calc.py", True),
        ("cd repo && python3 -m unittest", "cd repo && python3 -m unittest", True),
    ],
)
def test_only_an_actual_retry_resolves_a_failed_check(config, failed, passed, rerun):
    state = initial_state("verification", config)
    events = []

    def apply(kind, **fields):
        event = {"id": len(events) + 1, "type": kind, **fields}
        events.append(event)
        apply_event(state, event)

    apply(
        "runtime",
        event={
            "type": "act_start",
            "lifeline": "Implementer",
            "action_kind": "assistant",
            "action": "implement",
        },
    )
    apply("assistant.invocation", role="Implementer", invocation_id="turn")
    for command, code in [(failed, 1), (passed, 0)]:
        apply(
            "assistant.progress",
            role="Implementer",
            invocation_id="turn",
            activity=summarize(
                {"kind": "command", "phase": "completed", "command": command, "exit_code": code}
            ),
        )
    apply("human.required", request={"id": "decision", "summary": {"verification": []}})
    gaps = state["pending"]["summary"]["verification"]
    assert bool(gaps) is not rerun
    if not rerun and command_kind(passed) == "tests":
        assert "An earlier test command failed." in gaps[0]
        assert "A later test command succeeded" in gaps[0]
        assert "rerun of that check is unconfirmed" in gaps[0]
    assert state["progress"][0]["result"] == "failed"
    assert "superseded_by" not in state["progress"][0]  # History remains truthful.
    replay = initial_state("verification", config)
    for event in events:
        apply_event(replay, event)
    assert replay == state
    # A fresh failure after that success needs attention again.
    apply(
        "assistant.progress",
        role="Implementer",
        invocation_id="turn",
        activity=summarize(
            {"kind": "command", "phase": "completed", "command": failed, "exit_code": 1}
        ),
    )
    apply("human.required", request={"id": "next-decision", "summary": {"verification": []}})
    assert state["pending"]["summary"]["verification"]


@pytest.mark.parametrize(
    "text,expected",
    [
        ("use _x_ and _y_", "use x and y"),
        ("_a_ _b_ _c_", "a b c"),
        ("_one two_ and _three_", "one two and three"),
        ("`_x_` and `_y_`", "_x_ and _y_"),
        ("_test_calc.py_ and __init__", "test_calc.py and __init__"),
        ("test_negative and test_positive", "test_negative and test_positive"),
    ],
)
def test_summary_unwraps_each_emphasis_span_without_touching_identifiers(text, expected):
    assert plain_summary(text) == expected


@pytest.mark.parametrize(
    "command,expected",
    [
        ("cd repo && pytest", "tests"),
        ("cd repo&&pytest -q", "tests"),
        ('cd "my repo" && python3 -m unittest -v', "tests"),
        ("cd -- repo && uv run pytest tests/test_calc.py", "tests"),
        ("/bin/zsh -lc 'cd repo && pytest -q'", "tests"),
        ("cd repo && npm test", "tests"),
        ("cd repo; pytest", "shell"),
        ("cd repo && pytest && echo done", "shell"),
        ("cd repo && pytest || true", "shell"),
        ("cd repo && pytest\necho done", "shell"),
        ("cd $(pwd) && pytest", "shell"),
        ("cd repo && echo pytest", "shell"),
        ("cd repo || pytest", "shell"),
    ],
)
def test_literal_directory_prefix_identifies_test_attempts_only(command, expected):
    assert command_kind(command) == expected


@pytest.mark.parametrize("runner", ["pytest", "unittest"])
def test_real_default_discovery_does_not_erase_explicit_file_failure(tmp_path, config, runner):
    # Reproduce the audit with real test runners, never models or agent CLIs.
    if runner == "pytest":
        (tmp_path / "scripts").mkdir()
        (tmp_path / "scripts/check_db.py").write_text("def test_db():\n    assert False\n")
        (tmp_path / "test_ok.py").write_text("def test_ok():\n    assert True\n")
        selected = "scripts/check_db.py"
    else:
        (tmp_path / "checks_calc.py").write_text(
            "import unittest\nclass Calc(unittest.TestCase):\n"
            "    def test_calc(self): self.fail('real failure')\n"
        )
        (tmp_path / "test_ok.py").write_text(
            "import unittest\nclass Good(unittest.TestCase):\n"
            "    def test_ok(self): self.assertTrue(True)\n"
        )
        selected = "checks_calc.py"
    state = initial_state("real-discovery", config)
    events = []

    def apply(kind, **fields):
        event = {"id": len(events) + 1, "type": kind, **fields}
        events.append(event)
        apply_event(state, event)

    apply(
        "runtime",
        event={
            "type": "act_start",
            "lifeline": "Implementer",
            "action_kind": "assistant",
            "action": "implement",
        },
    )
    apply("assistant.invocation", role="Implementer", invocation_id="real-tests")
    for index, selection in enumerate(([selected], [])):
        args = [sys.executable, "-m", runner, *selection]
        result = subprocess.run(args, cwd=tmp_path, capture_output=True, text=True, timeout=30)
        assert (result.returncode != 0) is (index == 0)
        # Include the literal directory prefix used by real coding agents.
        activity = summarize(
            {
                "kind": "command",
                "phase": "completed",
                "command": f"cd {shlex.quote(str(tmp_path))} && {shlex.join(args)}",
                "exit_code": result.returncode,
                "output": result.stdout + result.stderr,
            }
        )
        assert activity["category"] == "tests"
        apply(
            "assistant.progress", role="Implementer", invocation_id="real-tests", activity=activity
        )
    apply("human.required", request={"id": "decision", "summary": {"verification": []}})
    gaps = state["pending"]["summary"]["verification"]
    assert len(gaps) == 1
    assert "An earlier test command failed." in gaps[0]
    assert "rerun of that check is unconfirmed" in gaps[0]
