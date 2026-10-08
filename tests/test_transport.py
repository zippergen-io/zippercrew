"""Pause must suspend real local work, retain context, and remain stoppable."""

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


@pytest.mark.parametrize("action", ["stop", "pause", "resume"])
def test_denied_process_control_preserves_state_and_reports_a_useful_error(
    tmp_path, config, monkeypatch, action
):
    run = Run(tmp_path / "run", config, "denied")
    run.root.mkdir()
    run.process = subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(60)"], start_new_session=True
    )
    run.record({"type": "room.started"})
    if action == "resume":
        run.pause()
    previous = run.snapshot()
    real_signal = os.killpg

    def denied(*args):
        raise PermissionError(1, "Operation not permitted")

    monkeypatch.setattr("zippercrew.rooms.os.killpg", denied)
    try:
        with pytest.raises(Conflict, match="operating system denied permission"):
            getattr(run, action)()
        assert run.snapshot() == previous
        assert run.process.poll() is None
        if action == "resume":
            # A buffered Human event must not turn a denied resume into success.
            with pytest.raises(Conflict, match="operating system denied permission"):
                run.record({"type": "human.required", "request": {"id": "buffered"}})
            assert run.snapshot() == previous
        if action == "pause":
            assert run.pause_guard is None
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


@pytest.mark.parametrize("finish", ["resume", "human_gate", "stop", "service_lost"])
def test_pause_suspends_children_and_never_leaves_a_frozen_group(tmp_path, config, finish):
    run = Run(tmp_path / "run", config, "test")
    run.root.mkdir()
    heartbeat = tmp_path / "heartbeat"
    child = (
        "import pathlib,sys,time\n"
        "p=pathlib.Path(sys.argv[1])\n"
        "while True:\n"
        "    p.write_text(str(time.monotonic_ns()))\n"
        "    time.sleep(.03)\n"
    )
    parent = (
        "import subprocess,sys,time; "
        "subprocess.Popen([sys.executable,'-c',sys.argv[1],sys.argv[2]]); time.sleep(60)"
    )
    run.process = subprocess.Popen(
        [sys.executable, "-c", parent, child, str(heartbeat)], start_new_session=True
    )
    run.record({"type": "room.started"})
    try:
        eventually(heartbeat.exists)
        run.pause()
        assert run.snapshot()["status"] == "paused"
        time.sleep(0.1)  # Allow delivery of SIGSTOP to the whole group.
        stamp = heartbeat.read_text()
        time.sleep(0.2)
        assert heartbeat.read_text() == stamp
        if finish in {"resume", "human_gate"}:
            pid = run.process.pid
            if finish == "resume":
                run.resume()
            else:
                # A Human request already buffered in stdout when Pause arrived.
                run.record({"type": "human.required", "request": {"id": "buffered"}})
                assert run.snapshot()["pending"]["id"] == "buffered"
            assert run.snapshot()["status"] == "running" and run.process.pid == pid
            eventually(lambda: heartbeat.read_text() != stamp)
            assert run.pause_guard is None
        elif finish == "service_lost":
            guard = run.pause_guard
            run.pause_guard = None
            guard.stdin.close()  # The same EOF the guard receives on a service crash.
            run.process.wait(timeout=5)
            guard.wait(timeout=5)
            after = heartbeat.read_text()
            time.sleep(0.1)
            assert heartbeat.read_text() == after
        else:
            run.stop()
            assert run.snapshot()["status"] == "stopped"
            assert run.process.poll() is not None and run.pause_guard is None
    finally:
        run.stop()


def test_http_pause_resume_retains_native_run_and_rejects_pause_at_human_gate(service, config):
    app, base, project = service
    config.update(project=str(project))
    _, first = request(base, "/api/rooms", config)
    run = app.runs.get(first["id"])
    pid = run.process.pid
    wait_state(base, first["id"], lambda state: state["round"] == 1)
    assert request(base, f"/api/runs/{run.state['id']}/pause", {})[0] == 200
    assert run.snapshot()["status"] == "paused"
    assert request(base, f"/api/runs/{run.state['id']}/pause", {})[0] == 200
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
    assert events.count("room.paused") == events.count("room.resumed") == 1
