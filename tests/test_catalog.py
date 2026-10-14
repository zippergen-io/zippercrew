"""Named Rooms own runs; source repositories and shared profiles stay external."""

import json

import pytest
from conftest import request, wait_state

from zippercrew.catalog import Catalog
from zippercrew.rooms import Runs, validate_config


def test_room_rerun_history_restart_rename_and_safe_delete(service, config):
    app, base, project = service
    config.update(project=str(project), human_mode="auto", max_rounds=1)
    source = project / "keep.txt"
    source.write_text("source repository stays intact")
    code, room = request(
        base, "/api/rooms", {"name": "Example review", "config": config, "brief": config["task"]}
    )
    assert code == 201 and room["runs"] == []
    path = f"/api/rooms/{room['id']}"
    code, first = request(base, path + "/runs", {})
    assert code == 201
    assert request(base, path + "/delete", {"confirmation": room["name"]})[0] == 409
    wait_state(base, first["id"], lambda s: s["status"] == "completed")
    first_trace = (app.runs.get(first["id"]).root / "events.jsonl").read_bytes()
    assert (
        request(
            base, path + "/save", {"name": "Example revisions", "brief": "Review the next change"}
        )[0]
        == 200
    )
    code, second = request(base, path + "/runs", {})
    assert code == 201 and second["id"] != first["id"]
    end = wait_state(base, second["id"], lambda s: s["status"] == "completed")
    assert end["round"] == 1 and end["config"]["task"] == "Review the next change"
    assert end["config"]["room_id"] == room["id"]
    assert app.runs.get(first["id"]).process.pid != app.runs.get(second["id"]).process.pid
    assert first_trace == (app.runs.get(first["id"]).root / "events.jsonl").read_bytes()
    history = request(base, path + "/runs")[1]
    assert [r["number"] for r in history] == [2, 1]
    assert all(r["started_at"] and r["ended_at"] for r in history)
    restored = Catalog(app.rooms.root, Runs(app.runs.root))
    assert restored.get(room["id"])["runs"] == [first["id"], second["id"]]
    assert restored.get(room["id"])["name"] == "Example revisions"
    assert request(base, path + "/delete", {"confirmation": "wrong name"})[0] == 400
    assert request(base, path + "/delete", {"confirmation": "Example revisions"})[0] == 200
    assert request(base, "/api/runs/" + first["id"])[0] == 404
    assert request(base, path + "/context")[0] == 404
    assert source.read_text() == "source repository stays intact"
    assert Catalog(app.rooms.root, Runs(app.runs.root)).list() == []


def test_legacy_migration_is_idempotent_and_keeps_journal_bytes(tmp_path, config):
    root = tmp_path / "runs"
    path = root / "legacy"
    path.mkdir(parents=True)
    (path / "config.json").write_text(json.dumps(config))
    journal = json.dumps({"id": 1, "type": "room.completed", "outcome": "Shipped"}) + "\n"
    (path / "events.jsonl").write_text(journal)
    for _ in range(2):
        catalog = Catalog(tmp_path / "catalog", Runs(root))
        record = catalog.get("legacy")
        assert record["runs"] == ["legacy"]
        assert len(catalog.list()) == 1
        assert (path / "events.jsonl").read_text() == journal


def test_drafts_persist_before_workspace_exists_and_validate_at_start(service):
    _, base, project = service
    code, room = request(
        base, "/api/rooms", {"name": "Next task", "config": {"project": str(project)}}
    )
    assert code == 201
    assert request(base, f"/api/rooms/{room['id']}/runs", {})[0] == 400
    assert request(base, f"/api/rooms/{room['id']}/context")[1]["runs"] == []


@pytest.mark.parametrize("avatar", ["planner", "otto"])
def test_avatar_and_model_choices_persist_without_changing_role(service, config, avatar):
    app, base, project = service
    config.update(project=str(project), human_mode="auto", max_rounds=1)
    config["agents"]["Implementer"].update(
        avatar=avatar,
        instructions="Keep the change focused.",
        settings={"model": "chosen-model"},
    )
    code, room = request(
        base, "/api/rooms", {"name": "Team", "config": config, "brief": config["task"]}
    )
    assert code == 201
    path = f"/api/rooms/{room['id']}"
    restored = Catalog(app.rooms.root, Runs(app.runs.root)).get(room["id"])
    binding = restored["config"]["agents"]["Implementer"]
    assert binding["avatar"] == avatar
    assert binding["instructions"] == "Keep the change focused."
    assert binding["settings"] == {"model": "chosen-model"}
    invalid = json.loads(json.dumps(restored["config"]))
    invalid["agents"]["Implementer"]["avatar"] = "unknown-sprite"
    assert request(base, path + "/save", {"config": invalid})[0] == 400
    assert request(base, path + "/context")[1]["config"] == restored["config"]
    assert (
        request(
            base, "/api/profiles", {"project": str(project), "name": "coding", "backend": "codex"}
        )[0]
        == 201
    )
    real_config = validate_config({**restored["config"], "task": room["brief"]})
    assert real_config["agents"]["Implementer"]["model"] == "chosen-model"
    assert "avatar" not in real_config["agents"]["Implementer"]
    code, run = request(base, path + "/runs", {})
    assert code == 201
    execution = run["config"]["agents"]["Implementer"]
    assert execution["instructions"] == "Keep the change focused."
    assert "avatar" not in execution
    wait_state(base, run["id"], lambda state: state["status"] == "completed")
