"""Room formations change execution participants, not just presentation."""

import copy

import pytest
from conftest import request, wait_state

from zippercrew.preferences import Preferences
from zippercrew.worker import execute


@pytest.mark.parametrize("note", ["Check zero too.", ""])
def test_direct_has_only_worker_and_human_and_carries_followup(config, note):
    config.update(workflow="direct", max_rounds=3)
    replies = iter(["Another round", note, "Done"])
    calls, events = [], []

    def backend(action, inputs):
        calls.append((action.name, dict(inputs)))
        return {action.outputs[0][0]: "Updated rounding; all checks pass."}

    result = execute(config, events.append, lambda _: next(replies), backend)
    assert result.startswith("Completed after 2 round(s)")
    assert [name for name, _ in calls] == ["implement", "implement"]
    guidance = calls[1][1]["guidance"]
    if note:
        assert guidance == note
    else:
        assert "human requested another attempt without further guidance" in guidance
        assert "Recheck the task" in guidance
    assert not any(e["type"] == "review.verdict" for e in events)
    messages = [
        e["event"] for e in events if e["type"] == "runtime" and e["event"]["type"] == "send"
    ]
    assert {m["from"] for m in messages} == {"Human", "Implementer"}
    assert {m["to"] for m in messages} == {"Human", "Implementer"}


def test_direct_api_snapshot_and_workflow_change_confirmation(service, config):
    app, base, project = service
    config.update(project=str(project))
    config["agents"]["Reviewer"]["instructions"] = "Review edge cases."
    _, room = request(base, "/api/rooms", {"config": config, "brief": config["task"]})
    path = f"/api/rooms/{room['id']}"
    direct = {**room["config"], "workflow": "direct"}
    assert request(base, path + "/save", {"config": direct})[0] == 409
    assert request(base, path + "/context")[1]["config"]["workflow"] == "review"
    code, updated = request(base, path + "/save", {"config": direct, "confirm_workflow": True})
    assert code == 200
    assert set(updated["config"]["agents"]) == {"Implementer"}
    assert updated["config"]["agents"]["Implementer"] == room["config"]["agents"]["Implementer"]
    code, run = request(base, path + "/runs", {})
    assert code == 201
    assert set(run["participants"]) == {"Implementer", "Human"}
    assert set(run["config"]["agents"]) == {"Implementer"}
    assert request(base, path + "/save", {"config": room["config"]})[0] == 409
    pending = wait_state(base, run["id"], lambda s: s["pending"])
    assert pending["pending"]["spec"]["rendered"]["prefill"] == "Done\nAnother round\nAbandon"
    request(
        base,
        f"/api/runs/{run['id']}/answer",
        {"request_id": pending["pending"]["id"], "value": "Done"},
    )
    end = wait_state(base, run["id"], lambda s: s["status"] == "completed")
    assert set(end["participants"]) == {"Implementer", "Human"}
    restored = copy.deepcopy(updated["config"])
    restored["workflow"] = "review"
    code, review = request(base, path + "/save", {"config": restored})
    assert code == 200 and review["config"]["agents"]["Reviewer"]["instructions"] == ""
    assert app.runs.get(run["id"]).snapshot()["config"]["workflow"] == "direct"


def test_preferences_are_global_and_persist_without_editing_rooms(service):
    app, base, project = service
    _, room = request(base, "/api/rooms", {"config": {"project": str(project)}})
    assert request(base, "/api/preferences", {"workspace": str(project)})[0] == 400
    code, prefs = request(base, "/api/preferences", {"motion": "reduced", "appearance": "night"})
    assert code == 200
    assert Preferences(app.preferences.path).get() == prefs
    assert request(base, "/api/bootstrap")[1]["preferences"] == prefs
    assert request(base, f"/api/rooms/{room['id']}/context")[1] == room


@pytest.mark.parametrize("workflow", ["review", "double_review"])
def test_human_scope_amendments_reach_every_role_and_survive_empty_notes(config, workflow):
    config.update(workflow=workflow, max_rounds=4)
    config["task"] = "Keep the change minimal."
    calls, events = [], []
    notes = iter(["Also add a one-line docstring.", "", "Use plain language in the docstring."])
    round_number = 0

    def backend(action, inputs):
        nonlocal round_number
        if action.name == "implement":
            round_number += 1
        calls.append((round_number, action.name, dict(inputs)))
        return {
            action.outputs[0][0]: "Updated the function."
            if action.name == "implement"
            else "APPROVE\nFINDINGS: 0\nThe change meets the amended task."
        }

    def human(request):
        return {"value": "Another round", "note": next(notes)} if round_number < 4 else "Ship it"

    execute(config, events.append, human, backend)
    for number, _, inputs in calls:
        task = inputs["task"]
        assert task.startswith("Keep the change minimal.")
        assert task.count("Also add a one-line docstring.") == (1 if number >= 2 else 0)
        assert task.count("Use plain language in the docstring.") == (1 if number == 4 else 0)
        if number >= 2:
            assert "takes precedence" in task
    # Every role receives precisely the same task, including final assessments.
    for number in range(1, 5):
        assert len({inputs["task"] for n, _, inputs in calls if n == number}) == 1
    assert len(calls) == 4 * (5 if workflow == "double_review" else 2)
    # The amendment crosses the protocol boundary, not a hidden adapter side channel.
    sends = [e["event"] for e in events if e["type"] == "runtime" and e["event"]["type"] == "send"]
    for role in ["Reviewer", "Critic"] if workflow == "double_review" else ["Reviewer"]:
        assert any(
            m["from"] == "Human" and m["to"] == role and "Also add a one-line docstring." in str(m)
            for m in sends
        )
