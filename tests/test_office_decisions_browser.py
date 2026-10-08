import json
import os
from pathlib import Path

import pytest
from conftest import request, wait_state
from playwright.sync_api import expect, sync_playwright

pytestmark = pytest.mark.browser


def pending_room(service, config):
    app, base, project = service
    config.update(project=str(project), workspace=str(project))
    _, room = request(
        base,
        "/api/rooms",
        {
            "name": "ANR workspace",
            "brief": "We work on the ANR project.",
            "config": config,
        },
    )
    _, run = request(base, f"/api/rooms/{room['id']}/runs", {})
    state = wait_state(base, run["id"], lambda state: state["pending"], timeout=20)
    return app, base, room, state


def capture(page, name):
    if directory := os.environ.get("ZIPPERCREW_OFFICE_CAPTURES"):
        target = Path(directory)
        target.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(target / f"{name}.png"), animations="disabled")


def enter(page, base):
    page.goto(base + "/office/")
    page.wait_for_function("() => studio.session?.connected && !!studio.session.run?.pending")


@pytest.mark.parametrize("legacy", [False, True])
def test_human_card_can_request_another_round_and_finish_without_opening_a_panel(
    service, config, legacy
):
    app, base, _, first = pending_room(service, config)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        if legacy:

            def old_bootstrap(route):
                response = route.fetch()
                data = response.json()
                data.pop("decision_notes", None)
                route.fulfill(response=response, json=data)

            page.route("**/api/bootstrap", old_bootstrap)
        enter(page, base)
        page.evaluate("() => {studio.select('human');}")
        card = page.locator("#human-decision")
        expect(card).to_contain_text("Decision required")
        expect(card).to_contain_text("Reviewer recommends: Another round")
        expect(card).to_contain_text(first["pending"]["summary"]["reason"])
        expect(
            page.get_by_text("Walk with the arrow keys or WASD.", exact=True)
        ).not_to_be_visible()
        expect(page.locator("#person-task-title")).to_contain_text("ANR project")
        expect(card.get_by_label("Optional note")).not_to_be_visible()
        capture(page, "human-decision-card-day")
        card.get_by_role("button", name="Another round", exact=True).click()
        expect(page.locator("#person-card")).not_to_be_visible()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.wait_for_function("() => studio.session.run.round===2 && !!studio.session.run.pending")
        assert page.evaluate("studio.session.run.pending.action") == "judge_turn"
        page.evaluate("() => {studio.select('human');}")
        expect(card).to_contain_text("Reviewer recommends: Ship it")
        card.get_by_role("button", name="Ship it", exact=True).click()
        expect(page.locator("#person-card")).not_to_be_visible()
        page.wait_for_function("() => studio.session.run.status==='completed'")
        state = app.runs.get(first["id"]).snapshot()
        guidance = next(
            e for e in state["transcript"] if e["role"] == "Implementer" and e["round"] == 2
        )["inputs"]["guidance"]
        assert "FINDINGS: 1" in guidance
        events = [
            json.loads(line)
            for line in (app.runs.get(first["id"]).root / "events.jsonl").read_text().splitlines()
        ]
        actions = [e["request"]["action"] for e in events if e["type"] == "human.required"]
        assert actions == (
            ["judge_turn", "ask_note", "judge_turn"] if legacy else ["judge_turn", "judge_turn"]
        )
        assert not errors
        browser.close()


def test_single_decision_sheet_has_optional_note_collapsed_evidence_and_retry(service, config):
    app, base, _, first = pending_room(service, config)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(
            viewport={"width": 1440, "height": 1000}, device_scale_factor=2
        )
        page = context.new_page()
        enter(page, base)
        page.evaluate("() => {studio.select('human');}")
        card = page.locator("#human-decision")
        card.locator(".decision-note summary").click()
        card.get_by_label("Optional note").fill("Keep the current office layout.")
        page.route(
            "**/api/runs/*/answer",
            lambda route: route.fulfill(
                status=503, content_type="application/json", body='{"error":"Please try again."}'
            ),
        )
        card.get_by_role("button", name="Another round", exact=True).click()
        expect(card.locator(".decision-error")).to_have_text("Please try again.")
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        expect(card.get_by_label("Optional note")).to_have_value("Keep the current office layout.")
        page.unroute("**/api/runs/*/answer")
        card.get_by_role("button", name="Review & decide →", exact=True).click()
        expect(page.locator("#detail-title")).to_have_text("Your decision")
        expect(page.locator("#detail-kind")).to_have_text("Round 1")
        expect(page.get_by_label("Optional note")).to_have_value("Keep the current office layout.")
        assert page.get_by_role("button", name="Continue", exact=True).count() == 0
        assert page.get_by_text("Over to you", exact=True).count() == 0
        assert page.locator("#detail-body .repository-path").count() == 0
        for disclosure in page.locator(".decision-disclosure").all():
            expect(disclosure).not_to_have_attribute("open", "")
        page.locator(".decision-note summary").click()
        capture(page, "human-decision-panel-day")
        page.locator("#back-to-office").click()
        page.get_by_role("button", name="Night mode", exact=True).click()
        page.locator("#room-action").click()
        capture(page, "human-decision-panel-night")
        page.get_by_text("Why?", exact=True).click()
        expect(page.locator(".decision-evidence")).to_have_text(
            [
                "Demo proposal, round 1.",
                "Scripted participant; no CLI was called.",
            ]
        )
        page.get_by_text("Technical details", exact=True).click()
        expect(page.get_by_role("link", name="Download full trace")).to_have_count(1)
        context.set_offline(True)
        expect(page.get_by_role("button", name="Another round", exact=True)).to_be_disabled()
        context.set_offline(False)
        expect(page.get_by_role("button", name="Another round", exact=True)).to_be_enabled()
        expect(page.get_by_label("Optional note")).to_have_value("Keep the current office layout.")
        page.get_by_role("button", name="Another round", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.wait_for_function("() => studio.session.run.round===2 && !!studio.session.run.pending")
        guidance = next(
            e
            for e in app.runs.get(first["id"]).snapshot()["transcript"]
            if e["role"] == "Implementer" and e["round"] == 2
        )["inputs"]["guidance"]
        assert "Keep the current office layout." in guidance and "FINDINGS: 1" in guidance
        page.locator("#room-action").click()
        page.get_by_role("button", name="Abandon", exact=True).click()
        page.wait_for_function("() => studio.session.run.status==='completed'")
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        browser.close()


def test_explicit_task_issue_opens_whiteboard_and_preserves_previous_run(service, config):
    app, base, room, first = pending_room(service, config)
    run = app.runs.get(first["id"])
    pending = first["pending"]
    # An explicit reviewer-supplied summary, using the same persisted event API
    # as native runs. No keyword guessing or special-case task text in the UI.
    pending["summary"].update(
        task_issue=True, reason="The task needs a concrete outcome before work can proceed."
    )
    run.record({"type": "human.required", "request": pending})
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        enter(page, base)
        page.locator("#room-action").click()
        expect(page.locator(".decision-reason")).to_have_text(pending["summary"]["reason"])
        bounds = page.locator("#detail-dialog").bounding_box()
        assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= 390
        capture(page, "human-decision-mobile")
        page.get_by_role("button", name="Edit task before rerunning", exact=True).click()
        expect(page.locator("#detail-title")).to_have_text("Your task")
        expect(page.get_by_label("Task", exact=True)).to_have_value(room["brief"])
        assert run.snapshot()["status"] == "stopped"
        assert len(app.rooms.get(room["id"])["runs"]) == 1
        page.get_by_label("Task", exact=True).fill("Add an ANR project summary to the README.")
        page.get_by_role("button", name="Run task", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        assert page.evaluate("studio.session.run.id") != first["id"]
        assert len(app.rooms.get(room["id"])["runs"]) == 2
        page.get_by_role("button", name="Stop", exact=True).click()
        expect(page.locator("#scene-state")).to_contain_text("Stopped")
        browser.close()
