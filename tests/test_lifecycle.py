"""A disappearing service must not leave an assistant working unobserved."""

import fcntl
import json
import subprocess
import sys

from zippercrew.rooms import Run


def test_duplicate_launch_reports_existing_instance_without_traceback(tmp_path):
    with (tmp_path / "service.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "zippercrew.server",
                "--data-dir",
                str(tmp_path),
                "--project",
                str(tmp_path),
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
    assert result.returncode == 1
    assert "ZipperCrew is already running" in result.stderr
    assert str(tmp_path) in result.stderr
    assert "Ctrl-C" in result.stderr
    assert "Traceback" not in result.stderr


def test_worker_exits_when_service_pipe_closes(config, tmp_path):
    config["demo"] = True
    process = subprocess.Popen(
        [sys.executable, "-m", "zippercrew.worker"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    try:
        process.stdin.write(json.dumps(config) + "\n")
        process.stdin.flush()
        assert json.loads(process.stdout.readline())["type"] == "runtime"
        process.stdin.close()
        assert process.wait(timeout=5) != 0
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)
        process.stdout.close()
        process.stderr.close()


def test_launch_failure_is_visible_in_room_and_trace(config, tmp_path, monkeypatch):
    def fail(*args, **kwargs):
        raise OSError("Cannot start interpreter")

    monkeypatch.setattr("zippercrew.rooms.subprocess.Popen", fail)
    room = Run(tmp_path / "room", config, "test")
    room.start()
    assert room.state["status"] == "failed"
    assert "Cannot start interpreter" in room.state["error"]
    events = [json.loads(line) for line in (room.root / "events.jsonl").read_text().splitlines()]
    assert events[0]["config"] == config
    assert events[-1]["type"] == "room.failed"
