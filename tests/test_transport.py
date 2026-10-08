"""Pause must suspend real local work, retain context, and remain stoppable."""

import json
import subprocess
import sys
import time

import pytest
from conftest import request, wait_state

from zippercrew.rooms import Run


def eventually(predicate, timeout=5):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if predicate():
            return
        time.sleep(0.03)
    raise AssertionError("Process did not reach expected state")


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
