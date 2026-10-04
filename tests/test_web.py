from __future__ import annotations

import json
import threading
import urllib.request
from pathlib import Path

import pytest
from conftest import request, wait_state

from zippercrew.rooms import Rooms, validate_config


def create(service, config, **overrides):
    _, base, project = service
    config.update(project=str(project), **overrides)
    code, room = request(base, "/api/rooms", config)
    assert code == 201, room
    return room["id"]


def test_web_another_round_guidance_reconnect_trace_and_completion(service, config):
    app, base, _ = service
    room_id = create(service, config)
    path = f"/api/rooms/{room_id}"
    state = wait_state(base, room_id, lambda s: s["pending"])
    pending = state["pending"]
    assert state["participants"]["Human"] == "needs human"
    with urllib.request.urlopen(base + path + "/events", timeout=5) as stream:
        assert stream.headers["Content-Type"] == "text/event-stream"
        assert stream.readline().decode().startswith("id: ")
        assert stream.readline() == b"event: state\n"
        latest = json.loads(stream.readline().decode().removeprefix("data: "))
        assert latest["pending"]["id"] == pending["id"]
    code, _ = request(base, path + "/answer", {"request_id": pending["id"], "value": "wrong"})
    assert code == 400
    code, _ = request(
        base, path + "/answer", {"request_id": pending["id"], "value": "Another round"}
    )
    assert code == 200
    code, _ = request(base, path + "/answer", {"request_id": pending["id"], "value": "Ship it"})
    assert code == 409
    state = wait_state(
        base, room_id, lambda s: s["pending"] and s["pending"]["action"] == "ask_note"
    )
    request(base, path + "/answer", {"request_id": state["pending"]["id"], "value": "Test zero."})
    state = wait_state(base, room_id, lambda s: s["pending"] and s["round"] == 2)
    implement = [entry for entry in state["transcript"] if entry["role"] == "Implementer"]
    assert "Test zero." in implement[1]["inputs"]["guidance"]
    assert "FINDINGS: 1" in implement[1]["inputs"]["guidance"]
    request(base, path + "/answer", {"request_id": state["pending"]["id"], "value": "Ship it"})
    ended = wait_state(base, room_id, lambda s: s["status"] == "completed")
    assert "Shipped after 2" in ended["outcome"]
    with urllib.request.urlopen(base + path + "/trace", timeout=5) as response:
        events = [json.loads(line) for line in response]
    assert [e["id"] for e in events] == list(range(1, len(events) + 1))
    assert events[-1]["type"] == "room.completed"
    assert any(e["type"] == "runtime" and e["event"]["type"] == "send" for e in events)
    restored = Rooms(app.rooms.root).get(room_id).snapshot()
    assert restored == ended


def test_auto_mode_requires_no_human_and_reports_limit(service, config):
    _, base, _ = service
    room_id = create(service, config, human_mode="auto", max_rounds=1)
    state = wait_state(base, room_id, lambda s: s["status"] == "completed")
    assert "1-round limit" in state["outcome"] and state["pending"] is None
    assert not any(entry["role"] == "Human" for entry in state["transcript"])


def test_stop_clears_human_request_and_worker_and_blocks_workspace_overlap(service, config):
    app, base, _ = service
    room_id = create(service, config)
    state = wait_state(base, room_id, lambda s: s["pending"])
    assert request(base, "/api/rooms", config)[0] == 409
    child = Path(config["workspace"]) / "nested"
    child.mkdir()
    assert request(base, "/api/rooms", {**config, "workspace": str(child)})[0] == 409
    code, stopped = request(base, f"/api/rooms/{room_id}/stop", {})
    assert code == 200 and stopped["status"] == "stopped" and stopped["pending"] is None
    assert app.rooms.get(room_id).process.poll() is not None
    assert (
        request(
            base,
            f"/api/rooms/{room_id}/answer",
            {"request_id": state["pending"]["id"], "value": "Ship it"},
        )[0]
        == 409
    )


def test_stop_during_assistant_turn(service, config):
    app, base, _ = service
    room_id = create(service, config)
    wait_state(base, room_id, lambda s: s["participants"]["Implementer"] == "working")
    code, state = request(base, f"/api/rooms/{room_id}/stop", {})
    assert code == 200 and state["status"] == "stopped"
    app.rooms.get(room_id).thread.join(timeout=5)
    assert not app.rooms.get(room_id).thread.is_alive()


def test_only_one_response_wins(service, config):
    _, base, _ = service
    room_id = create(service, config)
    state = wait_state(base, room_id, lambda s: s["pending"])
    results = []

    def answer():
        results.append(
            request(
                base,
                f"/api/rooms/{room_id}/answer",
                {"request_id": state["pending"]["id"], "value": "Abandon"},
            )[0]
        )

    threads = [threading.Thread(target=answer) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(results) == [200, 409]
    ended = wait_state(base, room_id, lambda s: s["status"] == "completed")
    assert "Abandoned" in ended["outcome"]


def test_profiles_use_upstream_configuration_and_validate_before_execution(service, config):
    _, base, project = service
    code, _ = request(
        base, "/api/profiles", {"project": str(project), "name": "coding", "backend": "codex"}
    )
    assert code == 201
    assert "coding" in (project / "zippergen.toml").read_text()
    code, body = request(base, f"/api/profiles?project={project}")
    assert body["profiles"] == {"coding": {"backend": "codex"}}
    config["project"] = str(project)
    checked = validate_config(config)
    assert checked["agents"]["Reviewer"]["access"] == "read-only"
    assert checked["agents"]["Implementer"]["backend"] == "codex"
    config["agents"]["Reviewer"]["profile"] = "missing"
    with pytest.raises(ValueError, match="existing ZipperGen profile"):
        validate_config(config)
    for invalid in (
        {"max_rounds": 0},
        {"max_rounds": True},
        {"human_mode": "guess"},
        {"workspace": "/not/a/real/directory"},
        {"task": ""},
    ):
        assert request(base, "/api/rooms", {**config, **invalid})[0] == 400


def test_local_origin_protection(service, config):
    _, base, _ = service
    assert request(base, "/api/bootstrap", Origin="https://hostile.example")[0] == 403
    assert request(base, "/api/bootstrap", Host="hostile.example")[0] == 403
    assert request(base, "/api/rooms", config, **{"X-ZipperCrew": ""})[0] == 403
    assert request(base, "/api/rooms", config, **{"Content-Type": "text/plain"})[0] == 403


def test_restart_marks_interrupted_room_stopped(tmp_path, config):
    root = tmp_path / "rooms"
    room = root / "test"
    room.mkdir(parents=True)
    (room / "config.json").write_text(json.dumps(config))
    (room / "events.jsonl").write_text(json.dumps({"id": 1, "type": "room.started"}) + "\n")
    state = Rooms(root).get("test").snapshot()
    assert state["status"] == "stopped" and "interrupted" in state["error"]
