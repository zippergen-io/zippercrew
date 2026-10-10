"""Cooperative pause drains admitted CLI calls and gates subsequent calls."""

import json
import os
import signal
import subprocess
import sys
import time

import pytest
from conftest import request, wait_state

from zippercrew.rooms import Conflict, Run


def eventually(predicate, timeout=5):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if predicate():
            return
        time.sleep(0.03)
    raise AssertionError("Process did not reach expected state")


def test_stop_accepts_denied_cleanup_only_after_the_whole_group_has_exited(
    tmp_path, config, monkeypatch
):
    run = Run(tmp_path / "run", config, "cleanup")
    run.root.mkdir()
    run.process = subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(60)"], start_new_session=True
    )
    run.record({"type": "room.started"})
    real_signal = os.killpg

    def deny_final_cleanup(group, sig):
        if sig == signal.SIGKILL:
            raise PermissionError(1, "Operation not permitted")
        real_signal(group, sig)

    monkeypatch.setattr("zippercrew.rooms.os.killpg", deny_final_cleanup)
    try:
        run.stop()
        assert run.process.poll() is not None
        assert run.snapshot()["status"] == "stopped"
        assert (
            json.loads((run.root / "events.jsonl").read_text().splitlines()[-1])["type"]
            == "room.stopped"
        )
    finally:
        if run.process.poll() is None:
            run.process.kill()
            run.process.wait(timeout=3)


def test_denied_process_control_preserves_state_and_reports_a_useful_error(
    tmp_path, config, monkeypatch
):
    run = Run(tmp_path / "run", config, "denied")
    run.root.mkdir()
    run.process = subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(60)"], start_new_session=True
    )
    run.record({"type": "room.started"})
    previous = run.snapshot()
    real_signal = os.killpg

    def denied(*args):
        raise PermissionError(1, "Operation not permitted")

    monkeypatch.setattr("zippercrew.rooms.os.killpg", denied)
    try:
        with pytest.raises(Conflict, match="operating system denied permission"):
            run.stop()
        assert run.snapshot() == previous
        assert run.process.poll() is None
    finally:
        monkeypatch.setattr("zippercrew.rooms.os.killpg", real_signal)
        run.stop()


@pytest.mark.parametrize("listing", ["123 S\n999 Z\n", "999 S\n", "", "unreadable"])
def test_cleanup_verification_does_not_ignore_live_members(tmp_path, config, monkeypatch, listing):
    from types import SimpleNamespace

    run = Run(tmp_path, config, "cleanup")
    run.process = SimpleNamespace(pid=999)
    monkeypatch.setattr(
        "zippercrew.rooms.subprocess.run",
        lambda *a, **kw: subprocess.CompletedProcess(a, 0, stdout=listing),
    )
    assert run._group_is_gone() is (listing == "123 S\n999 Z\n")


@pytest.mark.parametrize("request_before_finish", [False, True])
def test_pause_before_first_call_blocks_admission_and_repeated_requests_do_not_duplicate_it(
    tmp_path, config, request_before_finish
):
    from io import StringIO
    from types import SimpleNamespace

    run = Run(tmp_path, config, "before-first-call")
    run.process = SimpleNamespace(stdin=StringIO(), poll=lambda: None)
    run.record({"type": "room.started"})
    run.pause()
    assert run.snapshot()["status"] == "pausing"
    call = {
        "type": "assistant.call_requested",
        "call_id": "first",
        "role": "Implementer",
        "action": "implement",
    }
    run._worker_event(call)
    run.pause()
    assert run.snapshot()["status"] == "paused"
    assert not run.snapshot()["active_calls"]
    assert run.process.stdin.getvalue() == ""
    run.resume()
    assert json.loads(run.process.stdin.getvalue()) == {
        "control": "call_allowed",
        "call_id": "first",
    }
    with pytest.raises(Conflict):
        run.resume()
    assert len(run.process.stdin.getvalue().splitlines()) == 1
    run.pause()
    assert run.snapshot()["status"] == "pausing"
    if request_before_finish:
        run._worker_event({**call, "call_id": "second"})
        assert run.snapshot()["status"] == "pausing"
    run._worker_event({"type": "assistant.call_finished", "call_id": "first"})
    if not request_before_finish:
        assert run.snapshot()["status"] == "pausing"
        run._worker_event({**call, "call_id": "second"})
    assert run.snapshot()["status"] == "paused"


def test_http_pause_resume_retains_run_and_rejects_pause_at_human_gate(
    service, config, monkeypatch
):
    monkeypatch.setenv("ZIPPERCREW_DEMO_TURN_SECONDS", "0.7")
    app, base, project = service
    config.update(project=str(project))
    _, first = request(base, "/api/rooms", config)
    run = app.runs.get(first["id"])
    pid = run.process.pid
    wait_state(base, first["id"], lambda state: bool(state["active_calls"]))
    assert request(base, f"/api/runs/{run.state['id']}/pause", {})[0] == 200
    assert run.snapshot()["status"] == "pausing"
    assert request(base, f"/api/runs/{run.state['id']}/pause", {})[0] == 200
    wait_state(base, first["id"], lambda state: state["status"] == "paused")
    assert not run.snapshot()["active_calls"]
    assert request(base, f"/api/runs/{run.state['id']}/resume", {})[0] == 200
    assert run.process.pid == pid
    pending = wait_state(base, first["id"], lambda state: state["pending"])["pending"]
    assert request(base, f"/api/runs/{run.state['id']}/pause", {})[0] == 409
    assert request(base, f"/api/runs/{run.state['id']}/resume", {})[0] == 409
    assert run.snapshot()["pending"]["id"] == pending["id"]
    assert (
        request(
            base,
            f"/api/runs/{run.state['id']}/answer",
            {"request_id": pending["id"], "value": "Ship it"},
        )[0]
        == 200
    )
    wait_state(base, first["id"], lambda state: state["status"] == "completed")
    assert request(base, f"/api/runs/{run.state['id']}/pause", {})[0] == 409
    events = [
        json.loads(line)["type"] for line in (run.root / "events.jsonl").read_text().splitlines()
    ]
    assert (
        events.count("room.pausing")
        == events.count("room.paused")
        == events.count("room.resumed")
        == 1
    )
