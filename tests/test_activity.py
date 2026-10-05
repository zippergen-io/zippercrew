from zippercrew.activity import command_kind, summarize
from zippercrew.state import apply_event, initial_state


def test_commands_are_classified_conservatively():
    assert command_kind('/bin/zsh -lc "python3 -m unittest -v"') == "tests"
    assert command_kind("pytest tests/test_session.py -q") == "tests"
    assert command_kind("git diff --stat") == "diff"
    assert command_kind("rg session src") == "files"
    assert command_kind("echo pytest") == "shell"
    assert command_kind("cat file && pytest") == "shell"
    assert command_kind("echo $(pytest)") == "shell"
    assert command_kind('"unterminated') == "shell"


def test_summaries_do_not_expose_command_arguments_output_or_thoughts():
    result = summarize(
        {
            "kind": "command",
            "phase": "started",
            "command": "curl -H secret=hidden https://example.invalid",
            "output": "private",
            "reasoning": "private",
        }
    )
    assert result["text"] == "Running a shell command…"
    assert "secret" not in str(result) and "private" not in str(result)
    result = summarize(
        {
            "kind": "file",
            "phase": "completed",
            "operation": "update",
            "path": "/private/project/session.py",
            "status": "completed",
        }
    )
    assert result["text"] == "Updated session.py."
    assert "/private" not in str(result)
    assert summarize({"kind": "reasoning", "phase": "started", "text": "thinking"}) is None
    assert summarize({"kind": "file", "phase": "started", "operation": "unknown"}) is None


def test_test_result_is_only_reported_from_observed_exit_status():
    event = {"kind": "command", "command": "python -m unittest", "phase": "completed"}
    assert summarize(event)["text"] == "Test command finished."
    assert summarize({**event, "exit_code": 0})["text"] == "Test command succeeded."
    assert summarize({**event, "exit_code": 1})["text"] == "Test command failed."


def test_late_progress_does_not_leak_into_another_round_or_create_messages(config):
    state = initial_state("room", config)
    count = 0

    def apply(kind, **fields):
        nonlocal count
        count += 1
        apply_event(state, {"id": count, "type": kind, **fields})

    action = {"lifeline": "Implementer", "action_kind": "assistant", "action": "implement"}
    activity = {"text": "Running tests…", "kind": "command", "phase": "started"}
    apply("runtime", event={**action, "type": "act_start"})
    apply("assistant.invocation", role="Implementer", invocation_id="first")
    apply("assistant.progress", role="Implementer", invocation_id="first", activity=activity)
    assert state["local_activity"]["Implementer"]["text"] == "Running tests…"
    assert len(state["progress"]) == 1
    apply("runtime", event={**action, "type": "act", "inputs": {}, "outputs": {"proposal": "done"}})
    apply("assistant.progress", role="Implementer", invocation_id="first", activity=activity)
    assert state["local_activity"] == {} and len(state["progress"]) == 1
    apply("runtime", event={**action, "type": "act_start"})
    apply("assistant.invocation", role="Implementer", invocation_id="second")
    apply("assistant.progress", role="Implementer", invocation_id="first", activity=activity)
    assert state["local_activity"]["Implementer"]["text"] == "Working on the task…"
    assert state["messages"] == []
    apply("assistant.progress", role="Implementer", invocation_id="second", activity=activity)
    assert state["progress"][-1]["round"] == 2
    apply("room.stopped")
    apply("assistant.progress", role="Implementer", invocation_id="second", activity=activity)
    assert state["local_activity"] == {} and len(state["progress"]) == 2


def test_adapter_subscribes_without_reimplementing_cli_sessions(config, monkeypatch):
    from zippercrew.adapter import assistant_backend, load_process

    observed, calls = [], []

    def factory(selection, *, project_root, on_progress=None):
        def invoke(action, inputs):
            calls.append((selection, project_root, action.access))
            on_progress({"kind": "invocation.started", "invocation_id": "turn"})
            on_progress(
                {
                    "kind": "command",
                    "phase": "started",
                    "invocation_id": "turn",
                    "command": "pytest tests/test_secret.py -q",
                }
            )
            return {action.outputs[0][0]: "done"}

        return invoke

    monkeypatch.setattr("zippercrew.adapter.make_cli_assistant_backend", factory)
    _, module = load_process()
    backend = assistant_backend(config, observed.append)
    backend(module.implement, {"task": "work"})
    assert [event["type"] for event in observed] == ["assistant.invocation", "assistant.progress"]
    assert observed[1]["role"] == "Implementer"
    assert observed[1]["activity"]["text"] == "Running tests…"
    assert "test_secret" not in str(observed)
    assert calls[0][2] == "write"


def test_older_upstream_keeps_action_boundary_fallback(config, monkeypatch):
    from zippercrew.adapter import assistant_backend, load_process

    def old_factory(selection, *, project_root):
        return lambda action, inputs: {action.outputs[0][0]: "done"}

    monkeypatch.setattr("zippercrew.adapter.make_cli_assistant_backend", old_factory)
    _, module = load_process()
    observed = []
    result = assistant_backend(config, observed.append)(module.review, {"proposal": "work"})
    assert list(result.values()) == ["done"]
    assert not observed


def test_result_details_are_observed_bounded_and_exclude_arbitrary_output():
    command = {"kind": "command", "phase": "completed", "command": "pytest -q"}
    assert (
        summarize({**command, "output": "password=SECRET\n2 failed, 14 passed in 1.23s\n"})[
            "detail"
        ]
        == "2 failed · 14 passed"
    )
    assert "detail" not in summarize({**command, "output": "14 passed SECRET=hidden"})
    assert "detail" not in summarize({**command, "phase": "started", "output": "14 passed"})
    assert (
        summarize({**command, "command": "git diff --check", "exit_code": 0})["detail"]
        == "No whitespace errors"
    )
    assert (
        summarize({**command, "command": "git diff --check", "exit_code": 2})["detail"]
        == "Exit status 2"
    )
    assert "detail" not in summarize(
        {**command, "command": "echo '14 passed'", "output": "14 passed"}
    )
    read = {
        "kind": "file",
        "operation": "read",
        "phase": "started",
        "path": "notes.tex",
        "offset": 70,
        "limit": 71,
    }
    assert summarize(read)["detail"] == "lines 70–140"
    assert "detail" not in summarize({**read, "offset": "SECRET"})
    assert "detail" not in summarize({**read, "offset": True})


def test_public_output_is_trace_only(config, monkeypatch):
    from zippercrew.adapter import assistant_backend, load_process

    def factory(selection, *, project_root, on_progress=None):
        def invoke(action, inputs):
            on_progress({"kind": "invocation.started", "invocation_id": "turn"})
            on_progress(
                {
                    "kind": "command",
                    "phase": "completed",
                    "command": "pytest -q",
                    "output": "failure details\n14 passed in 1.0s",
                    "invocation_id": "turn",
                    "tool_id": "tool-1",
                    "exit_code": 0,
                }
            )
            return {action.outputs[0][0]: "done"}

        return invoke

    monkeypatch.setattr("zippercrew.adapter.make_cli_assistant_backend", factory)
    _, module = load_process()
    events = []
    assistant_backend(config, events.append)(module.implement, {"task": "work"})
    assert events[1]["type"] == "assistant.tool_output"
    assert events[1]["output"].startswith("failure details")
    assert events[2]["activity"]["detail"] == "14 passed"
    assert "failure details" not in str(events[2])
