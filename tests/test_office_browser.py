from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from conftest import request
from office_helpers import prepare_room
from playwright.sync_api import expect, sync_playwright

pytestmark = pytest.mark.browser


def enter_office(page, base):
    page.goto(base + "/office/")
    page.wait_for_function("() => window.studio?.ready && !window.studio.session.busy")
    expect(page.locator("#studio-menu")).to_be_visible()


def fill_room(page, project):
    prepare_room(page, project, "Fix rounding. Test zero and negative values.",
                 "Rounding workshop", real=not page.evaluate("studio.session.bootstrap.demo"))


def capture(page, name):
    if target := os.environ.get("ZIPPERCREW_SCREENSHOTS"):
        Path(target).mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(Path(target) / f"{name}.png"))


def test_office_real_api_save_reload_two_rounds_history_and_stop(service):
    app, base, project = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "console",
            lambda message: errors.append(message.text) if message.type == "error" else None,
        )
        enter_office(page, base)
        fill_room(page, project)
        capture(page, "office-setup")
        page.locator("#back-to-office").click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        rooms = app.rooms.list()
        assert len(rooms) == 1 and not rooms[0]["runs"]
        room = rooms[0]
        assert room["config"]["agents"]["Reviewer"]["instructions"] == "Check the edge cases."
        assert page.evaluate("window.studio.people.size") == 3
        page.reload()
        expect(page.locator("#room-name")).to_have_text("Rounding workshop")
        page.evaluate("() => {studio.session.showTask();}")
        page.get_by_role("button", name="Edit task").click()
        expect(page.get_by_label("Task", exact=True)).to_have_value(room["brief"])
        page.get_by_role("button", name="Run task", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.evaluate("() => {studio.session.showTask();}")
        expect(page.get_by_role("button", name="Another round", exact=True)).to_be_visible(
            timeout=45000
        )
        assert (
            page.evaluate("window.studio.session.run.config.agents.Implementer.instructions")
            == "Keep the change small."
        )
        capture(page, "office-decision-day")
        page.locator("#back-to-office").click()
        page.get_by_role("button", name="Night mode", exact=True).click()
        page.evaluate("() => {studio.session.showTask();}")
        capture(page, "office-decision-night")
        page.get_by_role("button", name="Another round", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.evaluate("() => {studio.session.showTask();}")
        guidance = page.locator("#decision-guidance")
        expect(guidance).to_be_visible()
        guidance.fill("Also test very small fractions.")
        # New snapshots must not replace a focused input or its draft.
        page.evaluate("window.studio.session.apply(window.studio.session.run)")
        expect(guidance).to_have_value("Also test very small fractions.")
        page.locator("#back-to-office").click()
        page.evaluate("() => {studio.session.showTask();}")
        expect(guidance).to_have_value("Also test very small fractions.")
        page.get_by_role("button", name="Continue", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.evaluate("() => {studio.session.showTask();}")
        expect(page.get_by_role("button", name="Ship it", exact=True)).to_be_visible(timeout=45000)
        assert page.evaluate("window.studio.session.run.round") == 2
        page.get_by_role("button", name="Ship it", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.evaluate("() => {studio.session.showTask();}")
        expect(page.locator(".run-summary")).to_contain_text("Shipped after 2", timeout=45000)
        assert len(app.rooms.list()) == 1
        run_id = page.evaluate("window.studio.session.run.id")
        assert "Also test very small fractions." in str(
            app.runs.get(run_id).snapshot()["transcript"]
        )
        page.locator("#back-to-office").click()
        page.locator("#menu-toggle").click()
        page.locator("#show-history").click()
        page.get_by_role("button", name="Run 1 · completed", exact=True).click()
        expect(page.locator("#detail-kind")).to_contain_text("/ History")
        expect(page.get_by_role("link", name="Download full trace")).to_have_attribute(
            "href", f"/api/runs/{run_id}/trace"
        )
        page.locator("#back-to-office").click()
        page.evaluate("() => {studio.session.showTask();}")
        page.get_by_role("button", name="Edit task").click()
        page.get_by_role("button", name="Run task", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.evaluate("() => {studio.session.showTask();}")
        page.get_by_role("button", name="Stop run", exact=True).click()
        expect(page.locator("#scene-state")).to_contain_text("Stopped")
        page.evaluate("() => {studio.session.showTask();}")
        assert len(app.rooms.get(room["id"])["runs"]) == 2
        # Human movement, sprite anchors and selection still work in a live office.
        page.locator("#back-to-office").click()
        page.evaluate("window.studio.select('worker')")
        expect(page.locator("#person-role")).to_contain_text("Worker")
        expect(page.locator("#person-activity")).to_have_text("stopped")
        assert page.evaluate(
            """() => [...window.studio.people.values()].every(p =>
                Number.isInteger(p.sprite.x) && Number.isInteger(p.sprite.y))"""
        )
        page.locator("#close-person").click()
        page.evaluate("() => {studio.session.showTask();}")
        page.get_by_role("button", name="Edit task").click()
        page.get_by_label("Task", exact=True).fill("Now update the documentation.")
        page.locator("#back-to-office").click()
        expect(page.locator("#scene-state")).to_contain_text("Ready to start")
        page.evaluate("() => {studio.session.showTask();}")
        expect(page.locator(".task-brief")).to_have_text("Now update the documentation.")
        expect(page.locator(".run-reports")).to_contain_text("Open activity history")
        assert len(app.rooms.get(room["id"])["runs"]) == 2
        assert not errors
        browser.close()


def test_office_failed_start_keeps_room_and_creates_native_profile_once(service):
    app, base, project = service
    # Exercise real-mode profile setup; intercept only launch so no paid CLI runs.
    app.demo = False
    app.checks = {"codex": {"supported": True}, "claude": {"supported": True}}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        enter_office(page, base)
        fill_room(page, project)
        page.route(
            "**/api/rooms/*/runs",
            lambda route: (
                route.fulfill(
                    status=400,
                    content_type="application/json",
                    body=json.dumps({"error": "Sign in to the Codex CLI, then try again."}),
                )
                if route.request.method == "POST"
                else route.continue_()
            ),
        )
        page.get_by_role("button", name="Run task", exact=True).click()
        expect(page.locator("#session-error")).to_contain_text("Sign in to the Codex CLI")
        expect(page.get_by_label("Task", exact=True)).to_have_value(
            "Fix rounding. Test zero and negative values."
        )
        assert len(app.rooms.list()) == 1
        record = app.rooms.list()[0]
        assert not record["runs"]
        _, profiles = request(base, "/api/profiles")
        assert profiles["profiles"] == {"office-codex": {"backend": "codex"}}
        assert record["config"]["agents"]["Implementer"]["profile"] == "office-codex"
        page.get_by_role("button", name="Run task", exact=True).click()
        expect(page.locator("#session-error")).to_be_visible()
        assert len(app.rooms.list()) == 1
        bounds = page.locator("#detail-dialog").bounding_box()
        assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= 390
        capture(page, "office-setup-mobile")
        # Failed requests preserve prompts and expose the error; no demo fallback.
        assert "Demo" not in page.locator("#scene-state").inner_text()
        assert not app.runs.items
        browser.close()


def test_office_reconnect_restores_pending_decision_and_room_switch(service):
    app, base, project = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        context = browser.new_context()
        page = context.new_page()
        enter_office(page, base)
        fill_room(page, project)
        page.get_by_role("button", name="Run task", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.evaluate("() => {studio.session.showTask();}")
        expect(page.get_by_role("button", name="Ship it", exact=True)).to_be_visible(timeout=45000)
        run_id = page.evaluate("window.studio.session.run.id")
        context.set_offline(True)
        expect(page.locator("#scene-state")).to_contain_text("Reconnecting", timeout=20000)
        expect(page.get_by_role("button", name="Ship it", exact=True)).not_to_be_visible()
        context.set_offline(False)
        expect(page.get_by_role("button", name="Ship it", exact=True)).to_be_visible(timeout=20000)
        page.reload()
        expect(page.locator("#room-action")).to_have_text("Your decision")
        page.evaluate("() => {studio.session.showTask();}")
        page.get_by_role("button", name="Abandon", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.evaluate("() => {studio.session.showTask();}")
        expect(page.locator(".run-summary")).to_contain_text("Abandoned")
        page.locator("#back-to-office").click()
        page.locator("#menu-toggle").click()
        page.locator("#show-rooms").click()
        page.get_by_role("button", name="+ New room", exact=True).click()
        page.get_by_label("Room name", exact=True).fill("Second room")
        page.get_by_role("button", name="Review", exact=True).click()
        expect(page.locator("#room-name")).to_have_text("Second room")
        assert page.evaluate("window.studio.session.run") is None
        page.locator("#menu-toggle").click()
        page.locator("#show-rooms").click()
        page.get_by_role("button", name="Enter Rounding workshop", exact=True).click()
        expect(page.locator("#room-name")).to_have_text("Rounding workshop")
        assert page.evaluate("window.studio.session.run.id") == run_id
        assert app.runs.get(run_id).snapshot()["status"] == "completed"
        browser.close()
