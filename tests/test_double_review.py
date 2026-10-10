"""Exercise the real ZipperGen choreography; only model calls are scripted."""

import threading

import pytest
from conftest import request, wait_state

from zippercrew.adapter import assistant_backend, load_process
from zippercrew.decisions import double_review_summary
from zippercrew.state import apply_event, initial_state
from zippercrew.worker import execute

APPROVE = "APPROVE\nFINDINGS: 0\nThe requested changes are ready."
REVISE = "REVISE\nFINDINGS: 1\nThe zero-input case still fails.\n\nCounterexample: input 0."


def test_reviews_are_concurrent_independent_and_exchange_once(config):
    config["workflow"] = "double_review"
    barrier = threading.Barrier(2, timeout=5)
    calls, events, decisions = [], [], []
    round_number = 0

    def backend(action, inputs):
        nonlocal round_number
        calls.append((action.name, dict(inputs)))
        if action.name == "implement":
            round_number += 1
            value = "Implemented the requested change."
        else:
            if action.name.startswith("review_"):
                assert set(inputs) == {"task", "proposal"}
                barrier.wait()  # A serial implementation cannot pass this.
            else:
                assert "APPROVE" in inputs["own_review"] + inputs["peer_review"]
                if round_number == 1:
                    assert REVISE in inputs["own_review"] + inputs["peer_review"]
            value = REVISE if round_number == 1 and action.name.endswith("critical") else APPROVE
        return {action.outputs[0][0]: value}

    def human(req):
        decisions.append(req)
        return (
            {"value": "Another round", "note": "Also check negative inputs."}
            if len(decisions) == 1
            else "Ship it"
        )

    result = execute(config, events.append, human, backend)
    assert result.startswith("Shipped after 2 round(s)")
    assert len(calls) == 10  # Worker + two independent reviews + two responses each round.
    assert [r["action"] for r in decisions] == ["judge_turn", "judge_turn"]
    summary = decisions[0]["summary"]
    assert summary["disagreement"] and summary["recommendation"] == "Another round"
    assert [r["recommendation"] for r in summary["reviewers"]] == ["Ship it", "Another round"]
    assert decisions[1]["summary"]["recommendation"] == "Ship it"
    guidance = [inputs["guidance"] for name, inputs in calls if name == "implement"][1]
    assert APPROVE in guidance and REVISE in guidance and "Also check negative inputs." in guidance
    assert "initial" in guidance and "after exchange" in guidance
    state = initial_state("test", config)
    snapshots = []
    for i, event in enumerate(events, 1):
        apply_event(state, {**event, "id": i})
        snapshots.append(dict(state["participants"]))
    assert any(s["Reviewer"] == s["Critic"] == "reviewing" for s in snapshots)
    assert state["round"] == 2
    assert {m["to"] for m in state["messages"] if m["from"] == "Reviewer"} == {"Critic", "Human"}
    assert {m["to"] for m in state["messages"] if m["from"] == "Critic"} == {"Reviewer", "Human"}


@pytest.mark.parametrize(
    "delivery,critical,expected",
    [
        (APPROVE, APPROVE, "Ship it"),
        (APPROVE, REVISE, "Another round"),
        (REVISE, REVISE, "Another round"),
        ("looks good", APPROVE, None),
        ("APPROVE\nFINDINGS: ?\nLooks good", APPROVE, None),
    ],
)
def test_summary_preserves_disagreement_and_invalid_reviews(delivery, critical, expected):
    summary = double_review_summary("Changed the implementation.", delivery, critical)
    assert summary["recommendation"] == expected
    assert summary["findings"] is None  # Never sum potentially overlapping findings.
    assert summary["disagreement"] == ({delivery, critical} == {APPROVE, REVISE})


@pytest.mark.parametrize(
    "mode,choice,ending", [("brief", "Abandon", "Abandoned"), ("auto", None, "Round limit reached")]
)
def test_limit_and_auto_never_drop_objections(config, mode, choice, ending):
    config.update(workflow="double_review", human_mode=mode, max_rounds=1)
    requests = []

    def human(req):
        requests.append(req)
        return choice

    def backend(action, inputs):
        return {action.outputs[0][0]: APPROVE if action.name.endswith("delivery") else REVISE}

    result = execute(config, lambda e: None, human, backend)
    assert result.startswith(ending) and "Files remain in the repository" in result
    assert len(requests) == (0 if mode == "auto" else 1)


@pytest.mark.parametrize("provider", ["codex", "claude"])
def test_each_reviewer_has_its_own_backend_and_read_only_permissions(config, monkeypatch, provider):
    config["agents"]["Critic"] = {"backend": provider, "model": "critical-model"}
    config["agents"]["Reviewer"].update(backend=provider, model="delivery-model")
    instances = []

    def factory(settings, **kwargs):
        calls = []
        instances.append((settings, calls))

        def invoke(action, inputs):
            calls.append(action)
            return {action.outputs[0][0]: APPROVE}

        return invoke

    monkeypatch.setattr("zippercrew.adapter.make_cli_assistant_backend", factory)
    invoke = assistant_backend(config)
    _, module = load_process("double_review")
    for name in ["review_delivery", "respond_delivery", "review_critical", "respond_critical"]:
        invoke(getattr(module, name), {})
    reviewers = [(s, c) for s, c in instances if c]
    assert [s["model"] for s, c in reviewers] == ["delivery-model", "critical-model"]
    assert all(len(c) == 2 for s, c in reviewers)
    for _, calls in reviewers:
        assert all(a.access == "read-only" and a.session == "participant" for a in calls)
        assert all(a.shell == ("restricted" if provider == "claude" else "enabled") for a in calls)


def test_room_switch_preserves_existing_roles_and_confirms_critic_removal(service, config):
    app, base, project = service
    config.update(project=str(project))
    _, room = request(base, "/api/rooms", {"config": config, "brief": config["task"]})
    path = f"/api/rooms/{room['id']}"
    expanded = {**room["config"], "workflow": "double_review"}
    code, saved = request(base, path + "/save", {"config": expanded})
    assert code == 200
    assert set(saved["config"]["agents"]) == {"Implementer", "Reviewer", "Critic"}
    assert saved["config"]["agents"]["Reviewer"] == room["config"]["agents"]["Reviewer"]
    saved["config"]["agents"]["Critic"]["instructions"] = "Check overflow."
    request(base, path + "/save", {"config": saved["config"]})
    assert request(base, path + "/save", {"config": room["config"]})[0] == 409
    _, run = request(base, path + "/runs", {})
    pending = wait_state(base, run["id"], lambda s: s["pending"])
    assert set(pending["participants"]) == {"Human", "Implementer", "Reviewer", "Critic"}
    assert len(pending["pending"]["summary"]["reviewers"]) == 2
    request(
        base,
        f"/api/runs/{run['id']}/answer",
        {"request_id": pending["pending"]["id"], "value": "Ship it"},
    )
    wait_state(base, run["id"], lambda s: s["status"] == "completed")
    assert (
        request(base, path + "/save", {"config": room["config"], "confirm_workflow": True})[0]
        == 200
    )


def test_final_exchange_can_change_the_recommendation(config):
    config.update(workflow="double_review", max_rounds=1)
    events, requests = [], []

    def backend(action, inputs):
        value = REVISE if action.name == "respond_critical" else APPROVE
        return {action.outputs[0][0]: value}

    def human(req):
        requests.append(req)
        assert any(
            e.get("event", {}).get("action") == "respond_critical" and e["event"]["type"] == "act"
            for e in events
        )
        assert any(
            e.get("event", {}).get("action") == "respond_delivery" and e["event"]["type"] == "act"
            for e in events
        )
        return "Abandon"

    execute(config, events.append, human, backend)
    assert requests[0]["summary"]["recommendation"] == "Another round"
    assert requests[0]["summary"]["disagreement"]


MALFORMED_REVIEW = (
    "REVISE is not warranted, so my verdict stays APPROVE.\nFINDINGS: 3\n"
    "The evidence checks out; I found no blockers.\n\nFull findings stay here.\n\n"
    '<decision-summary>{"reason":"Only minor wording suggestions remain.",'
    '"worker":"Rebuilt the document.","task_needs_clarification":false}</decision-summary>'
)


def test_malformed_review_keeps_its_useful_summary_without_guessing_verdict():
    from zippercrew.decisions import review_fields

    fields = review_fields(MALFORMED_REVIEW)
    assert fields["verdict"] is None
    assert fields["reason"] == "Only minor wording suggestions remain."
    assert fields["format_issue"]
    summary = double_review_summary("Worker result.", APPROVE, MALFORMED_REVIEW)
    assert summary["recommendation"] is None
    assert summary["reviewers"][1]["reason"] == fields["reason"]
    assert summary["reviewers"][1]["worker"] == "Rebuilt the document."
    structured = MALFORMED_REVIEW.replace('"reason":', '"verdict":"APPROVE","reason":')
    assert review_fields(structured)["verdict"] == "APPROVE"
    conflict = structured.replace("REVISE is not warranted, so my verdict stays APPROVE.", "REVISE")
    assert review_fields(conflict)["verdict"] is None
    invalid = structured.replace('"verdict":"APPROVE"', '"verdict":[]')
    assert review_fields(invalid)["verdict"] is None


@pytest.mark.parametrize(
    "response,expected",
    [
        ('{"verdict":"APPROVE","findings":3}', "APPROVE"),
        ('```json\n{"verdict":"APPROVE","findings":3}\n```', "APPROVE"),
        ('```\n{"verdict":"REVISE","findings":3}\n```', "REVISE"),
        ('{"verdict":null,"findings":3}', None),
        ('{"verdict":"APPROVE","findings":true}', None),
        ("not JSON", None),
    ],
)
@pytest.mark.parametrize("workflow", ["review", "double_review"])
def test_format_repair_is_bounded_read_only_and_keeps_findings(
    config, monkeypatch, response, expected, workflow
):
    from zippercrew.decisions import review_fields

    config.update(workflow=workflow)
    role = "Critic" if workflow == "double_review" else "Reviewer"
    config["agents"][role] = {"backend": "claude", "model": "critical-model"}
    calls, events = [], []

    def factory(settings, **kwargs):
        def invoke(action, inputs):
            calls.append((action, inputs))
            return {action.outputs[0][0]: MALFORMED_REVIEW if len(calls) == 1 else response}

        return invoke

    monkeypatch.setattr("zippercrew.adapter.make_cli_assistant_backend", factory)
    _, module = load_process(workflow)
    action = module.respond_critical if workflow == "double_review" else module.review
    result = assistant_backend(config, events.append)(action, {})
    report = next(iter(result.values()))
    assert len(calls) == 2 and calls[1][1]["review_to_format"] == MALFORMED_REVIEW
    assert all(a.access == "read-only" and a.shell == "restricted" for a, i in calls)
    assert review_fields(report)["verdict"] == expected
    assert "Full findings stay here." in report
    assert events[-1]["original"] == MALFORMED_REVIEW
    assert events[-1]["repaired"] == (expected is not None)
