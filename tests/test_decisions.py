import json

import pytest
from conftest import request, wait_state

from zippercrew.decisions import decision_summary


def test_summary_uses_review_evidence_and_requires_explicit_task_issue():
    review = "REVISE\nFINDINGS: 3\nThe task lacks an actionable objective.\n\nThree full findings."
    header = "REVISE|3|The task lacks an actionable objective."
    summary = decision_summary("No edits: the task has no requested change.", review, header)
    assert summary["reason"] == "The task lacks an actionable objective."
    assert summary["worker"] == "No edits: the task has no requested change."
    assert summary["recommendation"] == "Another round" and summary["findings"] == 3
    assert summary["task_issue"] is False
    review += '<decision-summary>{"task_needs_clarification": true}</decision-summary>'
    assert decision_summary("No edits.", review, header)["task_issue"] is True
    assert (
        decision_summary("No edits.", review.replace("true", '"true"'), header)["task_issue"]
        is False
    )
    assert (
        decision_summary("Result ready.", "", "REVISE|?|The review was empty.")["recommendation"]
        is None
    )
    assert (
        decision_summary("# Summary\nThe tests passed.", "", None)["reason"] == "The tests passed."
    )


def test_model_summary_is_optional_bounded_and_keeps_native_recommendation():
    review = "REVISE\nFINDINGS: 1\nOne edge case remains.\n\nFull finding."
    header = "REVISE|1|One edge case remains."
    metadata = json.dumps(
        {
            "reason": "**Negative amounts** still round incorrectly.",
            "worker": "Updated rounding; added tests.",
            "recommendation": "Ship it",
            "task_needs_clarification": False,
        }
    )
    summary = decision_summary(
        "Implementation report.",
        review + f"<decision-summary>{metadata}</decision-summary>",
        header,
    )
    assert summary["reason"] == "Negative amounts still round incorrectly."
    assert summary["worker"] == "Updated rounding; added tests."
    assert summary["recommendation"] == "Another round"
    for invalid in ("{bad json}", "[]", '{"reason": null, "worker": 3}'):
        fallback = decision_summary(
            "Implementation report.",
            review + f"<decision-summary>{invalid}</decision-summary>",
            header,
        )
        assert fallback["reason"] == "One edge case remains."
        assert fallback["worker"] == "Implementation report."
    long_reason = json.dumps({"reason": "A long explanation. " * 100})
    summary = decision_summary(
        "Result.", review + f"<decision-summary>{long_reason}</decision-summary>", header
    )
    assert len(summary["reason"]) <= 281 and summary["reason"].endswith("…")


@pytest.mark.parametrize("note", ["", "Check negative amounts too."])
def test_combined_answer_crosses_process_transport_and_preserves_full_review(service, config, note):
    app, base, project = service
    config.update(project=str(project))
    code, run = request(base, "/api/rooms", config)
    assert code == 201
    run_id = run["id"]
    initial = wait_state(base, run_id, lambda s: s["pending"])
    pending = initial["pending"]["id"]
    assert initial["pending"]["summary"]["recommendation"] == "Another round"
    code, _ = request(
        base,
        f"/api/runs/{run_id}/answer",
        {
            "request_id": pending,
            "value": "Another round",
            "note": note,
        },
    )
    assert code == 200
    assert (
        request(
            base,
            f"/api/runs/{run_id}/answer",
            {
                "request_id": pending,
                "value": "Another round",
                "note": note,
            },
        )[0]
        == 409
    )
    second = wait_state(base, run_id, lambda s: s["pending"] and s["round"] == 2)
    guidance = next(
        e for e in second["transcript"] if e["role"] == "Implementer" and e["round"] == 2
    )["inputs"]["guidance"]
    critique = next(e for e in initial["transcript"] if e["role"] == "Reviewer")["outputs"][
        "critique"
    ]
    assert critique in guidance and note in guidance
    journal = [
        json.loads(line)
        for line in (app.runs.get(run_id).root / "events.jsonl").read_text().splitlines()
    ]
    assert [e["request"]["action"] for e in journal if e["type"] == "human.required"] == [
        "judge_turn",
        "judge_turn",
    ]
    assert next(e for e in second["transcript"] if e["role"] == "Human")["outputs"]["note"] == note


def test_invalid_note_and_stale_edit_cannot_consume_or_stop_a_decision(service, config):
    app, base, project = service
    config.update(project=str(project))
    _, run = request(base, "/api/rooms", config)
    run_id = run["id"]
    state = wait_state(base, run_id, lambda s: s["pending"])
    pending = state["pending"]["id"]
    for value, note in [
        ("Another round", []),
        ("Another round", "x" * 30001),
        ("Ship it", "a note"),
    ]:
        assert (
            request(
                base,
                f"/api/runs/{run_id}/answer",
                {
                    "request_id": pending,
                    "value": value,
                    "note": note,
                },
            )[0]
            == 400
        )
    assert request(base, f"/api/runs/{run_id}/stop", {"request_id": "old-decision"})[0] == 409
    assert app.runs.get(run_id).snapshot()["pending"]["id"] == pending
    assert request(base, f"/api/runs/{run_id}/stop", {"request_id": pending})[0] == 200


def test_invalid_review_keeps_the_actual_reason():
    review = "**APPROVE**\nFINDINGS: 0\nThe requested tests pass."
    summary = decision_summary("Added tests.", review, "REVISE|?|Invalid header.")
    assert summary["recommendation"] is None
    assert summary["reason"] == "The requested tests pass."
    assert summary["format_issue"]


def test_round_limit_rejects_another_round_without_consuming_decision(service, config):
    app, base, project = service
    config.update(project=str(project), max_rounds=1)
    _, run = request(base, "/api/rooms", config)
    state = wait_state(base, run["id"], lambda s: s["pending"])
    pending = state["pending"]["id"]
    for note in (None, "Do not discard this note."):
        payload = {"request_id": pending, "value": "Another round"}
        if note is not None:
            payload["note"] = note
        code, result = request(base, f"/api/runs/{run['id']}/answer", payload)
        assert code == 409 and "round limit" in result["error"]
        assert app.runs.get(run["id"]).snapshot()["pending"]["id"] == pending
    assert (
        request(
            base,
            f"/api/runs/{run['id']}/answer",
            {
                "request_id": pending,
                "value": "Abandon",
            },
        )[0]
        == 200
    )


@pytest.mark.parametrize("header", ["**APPROVE**\nFINDINGS: 0", "APPROVE\nFINDINGS: ?"])
@pytest.mark.parametrize(
    "repair,ships",
    [
        ('```json\n{"verdict":"APPROVE","findings":0}\n```', True),
        ('{"verdict":null,"findings":0}', False),
    ],
)
def test_review_auto_uses_repaired_verdict_and_fails_closed(
    config, monkeypatch, header, repair, ships
):
    from zippercrew.worker import execute

    config.update(workflow="review", human_mode="auto", max_rounds=1)
    calls, events = [], []

    def factory(settings, **kwargs):
        def invoke(action, inputs):
            calls.append((action.name, inputs))
            report = (
                "Implemented the change."
                if action.name == "implement"
                else (repair if "review_to_format" in inputs else header + "\nThe tests pass.")
            )
            return {action.outputs[0][0]: report}

        return invoke

    monkeypatch.setattr("zippercrew.adapter.make_cli_assistant_backend", factory)
    result = execute(config, events.append, lambda request: pytest.fail("Unexpected human step"))
    assert ("Shipped" in result) is ships
    if not ships:
        assert "round limit, still unresolved" in result
    assert len(calls) == 3
    assert [e["repaired"] for e in events if e["type"] == "assistant.review_format"] == [ships]
