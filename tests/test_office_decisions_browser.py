import json
import os
from pathlib import Path

import pytest
from conftest import request, wait_state
from playwright.sync_api import expect, sync_playwright

from zippercrew.rooms import Conflict

pytestmark = pytest.mark.browser


def pending_room(service, config):
    app, base, project = service
    config.update(project=str(project), workspace=str(project))
    _, room = request(
        base,
        "/api/rooms",
        {
            "name": "Example workspace",
            "brief": "We work on the example project.",
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
    page.wait_for_function("() => studio.session?.connected && !!studio.session.decisions.pending")


@pytest.mark.parametrize("legacy", [False, True])
def test_human_opens_single_decision_panel_and_recommended_action_finishes(service, config, legacy):
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
        card = page.locator("#detail-dialog")
        expect(card).to_be_visible()
        expect(page.locator("#person-card")).not_to_be_visible()
        assert page.get_by_text("Review & decide →", exact=True).count() == 0
        assert page.locator("#detail-body .primary-action").count() == 1
        expect(card).to_contain_text("Reviewer recommends another round")
        expect(card).to_contain_text(first["pending"]["summary"]["reason"])
        expect(
            page.get_by_text("Walk with the arrow keys or WASD.", exact=True)
        ).not_to_be_visible()
        expect(page.locator("#person-task")).not_to_be_visible()
        expect(card.get_by_label("Optional note")).not_to_be_visible()
        expect(
            page.get_by_role("button", name="Back to the office", exact=True)
        ).not_to_be_visible()
        expect(card.get_by_role("heading", name="More information", exact=True)).to_be_visible()
        primary = card.get_by_role("button", name="Run next round", exact=True).bounding_box()
        expect(card.get_by_role("button", name="Other choices", exact=True)).to_have_count(0)
        for label in ("Ship it", "Abandon"):
            choice = card.get_by_role("button", name=label, exact=True)
            expect(choice).to_be_visible()
            assert abs(primary["y"] - choice.bounding_box()["y"]) < 1
        capture(page, "single-decision-day")
        card.get_by_role("button", name="Run next round", exact=True).click()
        expect(page.locator("#person-card")).not_to_be_visible()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.wait_for_function(
            "() => studio.session.run.round===2 && !!studio.session.decisions.pending"
        )
        assert page.evaluate("studio.session.run.pending.action") == "judge_turn"
        page.evaluate("() => {studio.select('human');}")
        expect(card).to_contain_text("Reviewer recommends shipping")
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
        card = page.locator("#detail-dialog")
        card.locator(".decision-note summary").click()
        card.get_by_label("Optional note").fill("Keep the current office layout.")
        page.route(
            "**/api/runs/*/answer",
            lambda route: route.fulfill(
                status=503, content_type="application/json", body='{"error":"Please try again."}'
            ),
        )
        card.get_by_role("button", name="Run next round", exact=True).click()
        expect(page.locator("#session-error")).to_have_text("Please try again.")
        expect(page.locator("#detail-dialog")).to_be_visible()
        expect(card.get_by_label("Optional note")).to_have_value("Keep the current office layout.")
        page.unroute("**/api/runs/*/answer")
        expect(page.locator("#detail-title")).to_have_text("Your decision")
        expect(page.locator("#detail-kind")).to_have_text("Round 1")
        expect(page.get_by_label("Optional note")).to_have_value("Keep the current office layout.")
        assert page.get_by_role("button", name="Continue", exact=True).count() == 0
        assert page.get_by_text("Over to you", exact=True).count() == 0
        assert page.locator("#detail-body .repository-path").count() == 0
        for disclosure in page.locator(".decision-disclosure").all():
            expect(disclosure).to_have_attribute("aria-expanded", "false")
        page.locator(".decision-note summary").click()
        capture(page, "human-decision-panel-day")
        page.locator("#close-detail").click()
        page.get_by_role("button", name="Night mode", exact=True).click()
        page.locator("#scene-state").click()
        capture(page, "human-decision-panel-night")
        page.get_by_text("Why another round?", exact=True).click()
        expect(page.locator(".decision-evidence")).to_have_text(
            [
                "Demo proposal, round 1.",
                "Demo review of the proposal.",
            ]
        )
        page.get_by_text("Technical details", exact=True).click()
        expect(page.get_by_role("link", name="Download full trace")).to_have_count(1)
        context.set_offline(True)
        expect(page.get_by_role("button", name="Run next round", exact=True)).to_be_disabled()
        context.set_offline(False)
        expect(page.get_by_role("button", name="Run next round", exact=True)).to_be_enabled()
        expect(page.get_by_label("Optional note")).to_have_value("Keep the current office layout.")
        page.get_by_role("button", name="Run next round", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.wait_for_function(
            "() => studio.session.run.round===2 && !!studio.session.decisions.pending"
        )
        guidance = next(
            e
            for e in app.runs.get(first["id"]).snapshot()["transcript"]
            if e["role"] == "Implementer" and e["round"] == 2
        )["inputs"]["guidance"]
        assert "Keep the current office layout." in guidance and "FINDINGS: 1" in guidance
        page.locator("#scene-state").click()
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
        page.locator("#scene-state").click()
        expect(page.locator(".decision-reason")).to_have_text(pending["summary"]["reason"])
        bounds = page.locator("#detail-dialog").bounding_box()
        assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= 390
        capture(page, "human-decision-mobile")
        page.get_by_role("button", name="Edit task before rerunning", exact=True).click()
        expect(page.locator("#detail-title")).to_have_text("Clarify the task")
        expect(page.get_by_label("Task", exact=True)).to_have_value(room["brief"])
        assert run.snapshot()["pending"]["id"] == pending["id"]
        assert len(app.rooms.get(room["id"])["runs"]) == 1
        page.get_by_label("Task", exact=True).fill("Add an example project summary to the README.")
        page.get_by_role("button", name="Back to decision", exact=True).click()
        expect(page.locator("#detail-title")).to_have_text("Your decision")
        assert run.snapshot()["pending"]["id"] == pending["id"]
        page.get_by_role("button", name="Edit task before rerunning", exact=True).click()
        expect(page.get_by_label("Task", exact=True)).to_have_value(
            "Add an example project summary to the README."
        )
        page.get_by_role("button", name="Save task and start new run", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        assert page.evaluate("studio.session.run.id") != first["id"]
        assert len(app.rooms.get(room["id"])["runs"]) == 2
        page.locator("#run-stop").click()
        page.locator("#confirm-stop").click()
        expect(page.locator("#scene-state")).to_contain_text("Stopped")
        browser.close()


@pytest.mark.parametrize("width", [1440, 390])
def test_transport_icons_follow_real_run_state_and_stop_requires_confirmation(
    service, config, monkeypatch, width
):
    app, base, project = service
    config.update(project=str(project), workspace=str(project))
    _, room = request(
        base,
        "/api/rooms",
        {"name": "Focus room", "brief": "Check the proposed layout.", "config": config},
    )
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base + "/office/")
        page.wait_for_function("() => window.studio?.session?.connected && !studio.session.busy")

        def transport_positions():
            expect(page.locator("#scene-state")).not_to_contain_text("round")
            return page.evaluate("""() => ({
              buttons:[...document.querySelectorAll('.run-controls button')]
                .map(el=>el.getBoundingClientRect().x),
              header:document.querySelector('#room-header').getBoundingClientRect().width
            })""")

        positions = transport_positions()
        expect(page.locator(".run-controls button:visible")).to_have_count(3)
        expect(page.locator("#run-pause")).to_be_disabled()
        expect(page.locator("#run-stop")).to_be_disabled()
        padding = page.locator("#room-header").evaluate("""el =>
          el.getBoundingClientRect().width - Math.max(...[...el.children]
            .map(child=>child.getBoundingClientRect().width))""")
        assert 10 <= padding <= 20
        expect(page.locator("#room-action use")).to_have_attribute("href", "#i-play")
        expect(page.locator("#room-action")).to_have_text("")
        page.get_by_role("button", name="Run", exact=True).click()
        pause = page.get_by_role("button", name="Pause run", exact=True)
        expect(pause).to_be_visible()
        assert transport_positions() == positions
        page.wait_for_function("() => Object.keys(studio.session.run.active_calls||{}).length>0")
        pause.click()
        expect(page.locator("#scene-state")).to_contain_text("Pausing…")
        expect(pause).to_be_disabled()
        expect(page.get_by_role("button", name="Resume run", exact=True)).to_be_enabled()
        assert transport_positions() == positions
        page.wait_for_function("() => studio.activity.isWorking(studio.people.get('worker'))")
        capture(page, "run-pausing")
        expect(page.locator("#scene-state")).to_contain_text("Paused")
        assert transport_positions() == positions
        run_id = page.evaluate("studio.session.run.id")
        pid = app.runs.get(run_id).process.pid
        assert page.evaluate("studio.activity.isWorking(studio.people.get('worker'))") is False
        expect(page.get_by_role("button", name="Resume run", exact=True)).to_be_visible()
        page.reload()
        expect(page.get_by_role("button", name="Resume run", exact=True)).to_be_visible()
        capture(page, "run-paused")
        page.locator("#run-stop").click()
        expect(page.locator("#stop-confirmation")).to_be_visible()
        assert app.runs.get(run_id).snapshot()["status"] == "paused"
        with monkeypatch.context() as patch:

            def denied_stop(**kwargs):
                raise Conflict("Could not stop this run: the operating system denied permission.")

            patch.setattr(app.runs.get(run_id), "stop", denied_stop)
            page.locator("#confirm-stop").click()
            expect(page.locator("#stop-confirmation .session-error")).to_contain_text(
                "operating system denied permission"
            )
            expect(page.locator("#detail-dialog")).not_to_be_visible()
            assert app.runs.get(run_id).snapshot()["status"] == "paused"
            assert transport_positions() == positions
        page.locator("#cancel-stop").click()
        expect(page.locator("#stop-confirmation")).not_to_be_visible()
        page.get_by_role("button", name="Resume run", exact=True).click()
        expect(pause).to_be_visible()
        assert app.runs.get(run_id).process.pid == pid
        page.wait_for_function("() => !!studio.session.decisions.pending", timeout=45000)
        expect(pause).to_be_visible()
        expect(pause).to_be_disabled()
        expect(page.locator("#scene-state")).to_have_attribute("data-state", "attention")
        assert transport_positions() == positions
        expect(page.locator("#room-action")).to_be_visible()
        expect(page.locator("#room-action")).to_be_disabled()
        page.locator("#room-name").click()
        expect(page.locator("#detail-title")).to_have_text("Your decision")
        expect(page.locator("#person-card")).not_to_be_visible()
        assert page.locator("#close-detail").evaluate("""el => {
          el.focus();const s=getComputedStyle(el);
          return s.borderTopWidth==='0px'&&s.outlineStyle==='none'&&s.boxShadow==='none';
        }""")
        page.locator("#close-detail").click()
        page.locator("#run-stop").click()
        capture(page, "run-stop-confirmation")
        page.locator("#confirm-stop").click()
        expect(page.locator("#scene-state")).to_contain_text("Stopped")
        expect(page.locator(".run-controls button:visible")).to_have_count(3)
        expect(page.locator("#run-pause")).to_be_disabled()
        expect(page.locator("#run-stop")).to_be_disabled()
        expect(page.locator("#room-action")).to_be_visible()
        expect(page.locator("#room-action")).to_be_enabled()
        assert transport_positions() == positions
        assert len(app.rooms.get(room["id"])["runs"]) == 1
        assert not errors
        browser.close()


@pytest.mark.parametrize("workflow", ["review", "double_review"])
def test_last_round_offers_visible_terminal_choices(service, config, workflow):
    config.update(workflow=workflow, max_rounds=1)
    if workflow == "double_review":
        config["agents"]["Critic"] = dict(config["agents"]["Reviewer"])
    app, base, room, state = pending_room(service, config)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        enter(page, base)
        page.get_by_role("button", name="Your decision", exact=True).click()
        expect(page.get_by_role("button", name="Run next round", exact=True)).to_have_count(0)
        expect(page.get_by_role("button", name="Ship it", exact=True)).to_be_enabled()
        expect(page.get_by_role("button", name="Abandon", exact=True)).to_be_visible()
        expect(page.get_by_role("button", name="Reviewer rationale", exact=True)).to_be_visible()
        expect(page.get_by_label("Optional note")).to_have_count(0)
        summary = state["pending"]["summary"]
        reason = summary["reason"]
        if workflow == "double_review" and summary.get("disagreement"):
            expect(page.locator(".decision-recommendation")).to_have_text("The reviewers disagree")
            reason = reason.removeprefix("The reviewers disagree. ")
        expect(page.locator(".decision-reason")).to_have_text(reason)
        capture(page, f"audit-round-limit-{workflow}")
        page.get_by_role("button", name="Abandon", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        wait_state(base, state["id"], lambda s: s["status"] == "completed")
        browser.close()


def test_verification_gaps_are_visible_without_opening_details(service, config):
    app, base, _, state = pending_room(service, config)
    pending = state["pending"]
    pending["summary"].update(
        recommendation="Ship it",
        reason="The new guard fixes the reported bug.",
        worker="Added test_negative in test_calc.py.",
        verification=["Worker: Test command was blocked. Approval was required."],
    )
    app.runs.get(state["id"]).record({"type": "human.required", "request": pending})
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 844})
        enter(page, base)
        page.locator("#scene-state").click()
        expect(page.locator(".decision-recommendation")).to_have_text(
            "Reviewer recommends shipping"
        )
        expect(page.locator(".decision-worker")).to_have_text(
            "Worker: Added test_negative in test_calc.py."
        )
        expect(page.locator(".decision-verification")).to_have_text(
            pending["summary"]["verification"][0]
        )
        expect(page.locator(".decision-verification")).to_be_visible()
        expect(page.locator(".decision-detail-panel:visible")).to_have_count(0)
        expect(page.get_by_role("button", name="Ship it", exact=True)).to_be_enabled()
        browser.close()


def test_model_picker_explains_cli_verification_limits(service, config):
    _, base, project = service
    config.update(project=str(project), workspace=str(project))
    request(base, "/api/rooms", {"name": "Capabilities", "brief": "Add tests.", "config": config})
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(base + "/office/")
        page.wait_for_function("() => studio.session?.connected")
        # Show real CLI choices without running a model or saving a binding.
        page.evaluate("""() => {
          studio.session.bootstrap.demo=false;
          studio.select('worker');
        }""")
        model = page.get_by_label("Model", exact=True)
        model.select_option('["claude",""]')
        expect(page.locator(".agent-access")).to_contain_text("Edits only")
        expect(page.locator(".agent-access")).to_contain_text("cannot run tests")
        model.select_option('["codex",""]')
        expect(page.locator(".agent-access")).not_to_be_visible()
        page.locator("#close-person").click()
        page.evaluate("studio.select('reviewer')")
        model.select_option('["claude",""]')
        expect(page.locator(".agent-access")).to_contain_text("File review only")
        model.select_option('["codex",""]')
        expect(page.locator(".agent-access")).to_contain_text(
            "Checks that need to write files may be blocked"
        )
        browser.close()


def test_legacy_decision_formats_separate_emphasis_without_damaging_code_names(service, config):
    _, base, _, _ = pending_room(service, config)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        enter(page, base)
        page.evaluate("""() => {
          studio.session.stream?.close();
          const run=studio.session.taskRun;
          delete run.pending.summary;
          run.review.headline='Use _x_ and _y_ in `test_negative` and __init__.';
          studio.session.decisions.open();
        }""")
        expect(page.locator(".decision-reason")).to_have_text(
            "Use x and y in test_negative and __init__."
        )
        browser.close()
