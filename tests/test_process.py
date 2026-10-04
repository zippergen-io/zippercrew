"""Run the actual upstream process; script only the external participants."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from zippercrew.adapter import assistant_backend, load_process
from zippercrew.state import apply_event, initial_state
from zippercrew.worker import execute

APPROVE = "APPROVE\nFINDINGS: 0\nThe fix and regression test are correct.\n\nChecked the files."
REVISE = "REVISE\nFINDINGS: 1\nMissing the regression test.\n\nAdd the failing rounding case."


def run_script(config, reviews, answers=()):
    review = iter(reviews)
    replies = iter(answers)
    calls, events, requests = [], [], []

    def fake(action, inputs):
        calls.append((action.name, inputs.copy()))
        value = (
            next(review) if action.name == "review" else "Fixed rounding.\n\nImplementation detail."
        )
        return {action.outputs[0][0]: value}

    def human(request):
        requests.append(request)
        return next(replies)

    outcome = execute(config, events.append, human, fake)
    return outcome, calls, events, requests


def test_another_round_preserves_full_review_and_human_note(config):
    outcome, calls, events, requests = run_script(
        config, [REVISE, APPROVE], ["Another round", "Also test zero.", "Ship it"]
    )
    assert "Shipped after 2 round(s)" in outcome
    assert [name for name, _ in calls] == ["implement", "review", "implement", "review"]
    guidance = calls[2][1]["guidance"]
    assert REVISE in guidance and "Also test zero." in guidance
    assert [r["action"] for r in requests] == ["judge_turn", "ask_note", "judge_turn"]
    assert "Implementation detail" not in requests[0]["spec"]["rendered"]["context"]
    assert [e["verdict"] for e in events if e["type"] == "review.verdict"] == ["REVISE", "APPROVE"]


@pytest.mark.parametrize("mode", ["full", "brief"])
@pytest.mark.parametrize("decision,ending", [("Ship it", "Shipped"), ("Abandon", "Abandoned")])
def test_human_can_finish_even_when_reviewer_objects(config, mode, decision, ending):
    config["human_mode"] = mode
    outcome, calls, _, requests = run_script(config, [REVISE], [decision])
    assert f"{ending} after 1 round(s)" in outcome
    assert len(calls) == 2 and len(requests) == 1
    briefing = requests[0]["spec"]["rendered"]["context"]
    assert ("Implementation detail" in briefing) == (mode == "full")
    if decision == "Abandon":
        assert "still in the working tree" in outcome


def test_autonomous_review_and_malformed_header_fail_closed(config):
    config["human_mode"] = "auto"
    outcome, calls, _, requests = run_script(config, ["looks fine", APPROVE])
    assert not requests and len(calls) == 4
    assert "Shipped after 2 round(s)" in outcome
    assert "looks fine" in calls[2][1]["guidance"]


@pytest.mark.parametrize("mode", ["auto", "brief"])
def test_round_limit_does_not_request_discarded_guidance(config, mode):
    config.update(human_mode=mode, max_rounds=1)
    outcome, calls, _, requests = run_script(config, [REVISE], ["Another round"])
    assert "1-round limit, still unresolved" in outcome
    assert len(calls) == 2
    assert all(r["action"] != "ask_note" for r in requests)


def test_state_follows_action_boundaries_not_terminal_activity(config):
    _, _, events, _ = run_script(config, [APPROVE], ["Ship it"])
    state = initial_state("room", config)
    observed = []
    for i, event in enumerate(events, 1):
        apply_event(state, {**event, "id": i})
        observed.append(dict(state["participants"]))
    assert {"Implementer": "working", "Reviewer": "waiting", "Human": "waiting"} in observed
    assert {"Implementer": "waiting", "Reviewer": "reviewing", "Human": "waiting"} in observed
    assert {"Implementer": "waiting", "Reviewer": "waiting", "Human": "needs human"} in observed
    assert state["round"] == 1 and state["pending"] is None
    assert len(state["transcript"]) == 3


@pytest.mark.parametrize("backend", ["codex", "claude"])
def test_native_cli_sessions_remain_separate_and_resume_with_permissions(
    config,
    monkeypatch,
    backend,
    tmp_path: Path,
):
    for binding in config["agents"].values():
        binding.update(backend=backend, instructions="Pay attention to zero.")
    calls = []
    monkeypatch.setattr("zippergen.assistant_backends.shutil.which", lambda name: f"/tools/{name}")

    def fake_cli(command, **kwargs):
        resume_flag = "resume" if backend == "codex" else "--resume"
        session = (
            command[command.index(resume_flag) + 1] if resume_flag in command else f"s{len(calls)}"
        )
        calls.append((command, kwargs, session))
        # Faithful external boundary: implement writes selected files, reviewer reads them.
        target = Path(kwargs["cwd"]) / "result.txt"
        is_reviewer = "read-only" in command or "plan" in command
        if is_reviewer:
            assert target.read_text() == "implemented"
            value = REVISE if len(calls) == 2 else APPROVE
        else:
            target.write_text("implemented")
            value = "Changed result.txt.\n\nReady for review."
        if backend == "codex":
            stdout = "\n".join(
                json.dumps(e)
                for e in [
                    {"type": "thread.started", "thread_id": session},
                    {"type": "item.completed", "item": {"type": "agent_message", "text": value}},
                    {"type": "turn.completed"},
                ]
            )
        else:
            stdout = json.dumps(
                {
                    "type": "result",
                    "subtype": "success",
                    "is_error": False,
                    "session_id": session,
                    "result": value,
                }
            )
        return subprocess.CompletedProcess(command, 0, stdout=stdout, stderr="")

    monkeypatch.setattr("zippergen.assistant_backends.subprocess.run", fake_cli)
    answers = iter(["Another round", "Test zero too.", "Ship it"])
    result = execute(config, lambda e: None, lambda r: next(answers), assistant_backend(config))
    assert "Shipped after 2" in result
    assert [call[2] for call in calls] == ["s0", "s1", "s0", "s1"]
    assert all(call[1]["cwd"] == tmp_path for call in calls)
    assert all("Pay attention to zero." in call[1]["input"] for call in calls)
    assert "Test zero too." in calls[2][1]["input"]
    assert "Missing the regression test." in calls[2][1]["input"]
    if backend == "codex":
        assert all("workspace-write" in calls[i][0] for i in (0, 2))
        assert all("read-only" in calls[i][0] for i in (1, 3))
        assert all("--ignore-user-config" in call[0] for call in calls)
    else:
        for i in (1, 3):
            cmd = calls[i][0]
            assert "plan" in cmd and "--safe-mode" in cmd
            assert cmd[cmd.index("--tools") + 1] == "Read,Glob,Grep"
        assert "Read,Glob,Grep,Edit,Write,Bash" in calls[0][0]


def test_backend_failure_is_not_an_approval(config):
    def broken(action, inputs):
        raise RuntimeError("CLI login expired")

    with pytest.raises(RuntimeError, match="CLI login expired"):
        execute(config, lambda e: None, lambda r: None, broken)


def test_upstream_process_contract():
    workflow, module = load_process()
    assert module.implement.access == "write"
    assert module.review.access == "read-only"
    assert module.implement.session == module.review.session == "participant"
    assert module.judge_turn.prefill == "Ship it\nAnother round\nAbandon"
    assert module.review_header.fn("garbage").startswith("REVISE|")
    assert workflow.name == "pair_programming"
