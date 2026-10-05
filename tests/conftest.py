from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import pytest

from zippercrew.server import Application


@pytest.fixture
def config(tmp_path: Path) -> dict[str, Any]:
    return {
        "project": str(tmp_path),
        "workspace": str(tmp_path),
        "task": "Fix the rounding error.",
        "human_mode": "brief",
        "max_rounds": 3,
        "agents": {
            role: {"profile": "coding", "backend": "codex", "instructions": ""}
            for role in ("Implementer", "Reviewer")
        },
    }


@pytest.fixture
def service(tmp_path: Path):
    project = tmp_path / "project"
    project.mkdir()
    app = Application(0, tmp_path / "data", project, demo=True)
    thread = threading.Thread(target=app.serve_forever, daemon=True)
    thread.start()
    yield app, f"http://127.0.0.1:{app.server_port}", project
    app.shutdown()
    app.server_close()
    thread.join(timeout=5)


def request(base: str, path: str, data: Any = None, **headers: str) -> tuple[int, Any]:
    defaults = {"Content-Type": "application/json", "X-ZipperCrew": "1"}
    defaults.update(headers)
    req = urllib.request.Request(
        base + path, data=None if data is None else json.dumps(data).encode(), headers=defaults
    )
    try:
        response = urllib.request.urlopen(req, timeout=10)
    except urllib.error.HTTPError as exc:
        response = exc
    with response:
        return response.status, json.loads(response.read())


def wait_state(base: str, room_id: str, predicate: Any, timeout: float = 12) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    state = {}
    while time.monotonic() < deadline:
        _, state = request(base, f"/api/rooms/{room_id}")
        if predicate(state):
            return state
        if state["status"] == "failed":
            pytest.fail(state["error"])
        time.sleep(0.03)
    pytest.fail(f"Room did not reach expected state: {state}")


@pytest.fixture(autouse=True)
def browser_timing(request, monkeypatch):
    if request.node.get_closest_marker("browser"):
        from playwright.sync_api import expect

        # Keep transient scripted phases observable on busy development machines.
        # This affects only fake participants; real CLI execution is never delayed.
        monkeypatch.setenv("ZIPPERCREW_DEMO_TURN_SECONDS", "3")
        expect.set_options(timeout=20000)
