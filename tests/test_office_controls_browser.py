import json

import pytest
from conftest import request
from playwright.sync_api import expect, sync_playwright
from test_office_room_interface_browser import capture

pytestmark = pytest.mark.browser


def create_room(base, project, *, profile="demo"):
    code, room = request(
        base,
        "/api/rooms",
        {
            "name": "Quiet workshop",
            "config": {
                "workflow": "direct",
                "project": str(project),
                "workspace": str(project),
                "agents": {"Implementer": {"profile": profile, "instructions": ""}},
            },
            "brief": "",
        },
    )
    assert code == 201
    return room


def test_task_autosave_serializes_retries_and_run_uses_latest_draft(service):
    app, base, project = service
    room = create_room(base, project)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base + "/office/")
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        expect(page.locator("#scene-state")).to_have_attribute("data-state", "setup")
        expect(page.get_by_role("button", name="Run", exact=True)).to_be_disabled()
        page.locator("#scene-state").click()
        expect(page.locator("#detail-title input")).to_have_value(room["name"])
        page.locator("#close-detail").click()
        page.evaluate("() => {studio.session.configuration.editTask();}")
        task = page.get_by_label("Task", exact=True)
        task.fill("First task")
        expect(page.locator(".autosave-status")).to_have_text("Saved automatically")
        assert app.rooms.get(room["id"])["brief"] == "First task"
        assert page.get_by_role("button", name="Save task", exact=True).count() == 0
        expect(page.locator("#scene-state")).to_have_attribute("data-state", "ready")

        held = []

        def delayed_save(route):
            if route.request.post_data_json.get("brief") == "Slow edit":
                held.append((route, route.fetch()))
            else:
                route.continue_()

        page.route("**/api/rooms/*/save", delayed_save)
        task.fill("Slow edit")
        page.wait_for_timeout(800)
        assert len(held) == 1
        task.fill("Newer edit")
        held[0][0].fulfill(response=held[0][1])
        expect(page.locator(".autosave-status")).to_have_text("Saved automatically")
        assert app.rooms.get(room["id"])["brief"] == "Newer edit"
        page.unroute("**/api/rooms/*/save")

        page.route(
            "**/api/rooms/*/save",
            lambda route: route.fulfill(
                status=503, content_type="application/json", body=json.dumps({"error": "Try again"})
            ),
        )
        task.fill("Keep this unsaved draft")
        expect(page.locator(".autosave-status")).to_contain_text("Not saved")
        page.locator("#close-detail").click()
        page.evaluate("() => {studio.session.configuration.editTask();}")
        expect(task).to_have_value("Keep this unsaved draft")
        expect(page.locator(".autosave-status")).to_contain_text("Not saved")
        page.unroute("**/api/rooms/*/save")
        page.get_by_role("button", name="Retry save", exact=True).click()
        expect(page.locator(".autosave-status")).to_have_text("Saved automatically")
        capture(page, "office-task-autosave-day")
        # Running immediately after typing must flush the debounce first.
        task.fill("Use this latest task for the run")
        page.get_by_role("button", name="Run task", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        expect(page.locator("#run-stop")).to_be_enabled()
        run_id = page.evaluate("studio.session.run.id")
        assert app.runs.get(run_id).config["task"] == "Use this latest task for the run"
        page.locator("#run-stop").click()
        page.locator("#confirm-stop").click()
        expect(page.locator("#scene-state")).to_contain_text("Stopped")
        assert app.runs.get(run_id).snapshot()["status"] == "stopped"
        # A stopped task can run again directly from the header.
        expect(page.locator("#room-action")).to_be_visible()
        page.get_by_role("button", name="Run", exact=True).click()
        expect(page.locator("#run-stop")).to_be_enabled()
        assert page.evaluate("studio.session.run.id") != run_id
        page.locator("#run-stop").click()
        page.locator("#confirm-stop").click()
        expect(page.locator("#scene-state")).to_contain_text("Stopped")
        assert len(app.rooms.get(room["id"])["runs"]) == 2
        assert not errors
        browser.close()


def test_room_options_autosave_keeps_newer_edits_and_flushes_before_workflow_and_run(service):
    app, base, project = service
    room = create_room(base, project)
    request(base, f"/api/rooms/{room['id']}/save", {"brief": "Check the office feedback."})
    first_folder, final_folder = project / "first folder", project / "final folder"
    first_folder.mkdir()
    final_folder.mkdir()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base + "/office/")
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        page.locator("#room-header").click()
        name = page.get_by_label("Room name", exact=True)
        expect(page.locator("#detail-title input")).to_have_value(room["name"])
        assert page.locator(".room-form #settings-room-name").count() == 0
        assert page.get_by_role("button", name="Save room options", exact=True).count() == 0
        name.fill("Calm workshop")
        expect(page.locator("#room-name")).to_have_text("Calm workshop")
        expect(page.locator(".room-save-status .autosave-status")).to_have_text(
            "Saved automatically"
        )

        held = []

        def delayed_option(route):
            if route.request.post_data_json.get("config", {}).get("workspace") == str(first_folder):
                held.append((route, route.fetch()))
            else:
                route.continue_()

        page.route("**/api/rooms/*/save", delayed_option)
        path = page.get_by_label("Repository", exact=True)
        path.fill(str(first_folder))
        page.wait_for_timeout(800)
        assert len(held) == 1
        path.fill(str(final_folder))
        page.locator(".extra-options summary").click()
        rounds = page.get_by_label("Maximum rounds", exact=True)
        rounds.fill("7")
        held[0][0].fulfill(response=held[0][1])
        expect(page.locator(".room-save-status .autosave-status")).to_have_text(
            "Saved automatically"
        )
        expect(path).to_have_value(str(final_folder))
        assert app.rooms.get(room["id"])["config"]["workspace"] == str(final_folder)
        assert app.rooms.get(room["id"])["config"]["max_rounds"] == 7
        page.unroute("**/api/rooms/*/save")

        # Changing workflow must use the latest options, even before debounce.
        rounds.fill("9")
        page.locator(".room-workflow").click()
        page.get_by_role("button", name="Review", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        assert app.rooms.get(room["id"])["config"]["max_rounds"] == 9
        assert app.rooms.get(room["id"])["config"]["workflow"] == "review"
        page.locator("#room-header").click()
        page.locator(".extra-options summary").click()
        page.get_by_label("Your involvement", exact=True).select_option("full")
        expect(page.locator(".room-save-status .autosave-status")).to_have_text(
            "Saved automatically"
        )
        assert app.rooms.get(room["id"])["config"]["human_mode"] == "full"
        rounds.fill("0")
        rounds.press("Tab")
        expect(page.locator(".room-save-status .autosave-status")).to_contain_text(
            "between 1 and 100"
        )
        assert app.rooms.get(room["id"])["config"]["max_rounds"] == 9
        rounds.fill("10")
        expect(page.locator(".room-save-status .autosave-status")).to_have_text(
            "Saved automatically"
        )

        page.route(
            "**/api/rooms/*/save",
            lambda route: route.fulfill(
                status=503, content_type="application/json", body=json.dumps({"error": "Try again"})
            ),
        )
        name.fill("Gentle studio")
        expect(page.locator(".room-save-status .autosave-status")).to_contain_text("Not saved")
        page.locator("#close-detail").click()
        page.locator("#room-header").click()
        expect(name).to_have_value("Gentle studio")
        expect(page.locator(".room-save-status .autosave-status")).to_contain_text("Not saved")
        page.unroute("**/api/rooms/*/save")
        page.get_by_role("button", name="Retry save", exact=True).click()
        expect(page.locator("#room-name")).to_have_text("Gentle studio")
        expect(page.locator(".room-save-status .autosave-status")).to_have_text(
            "Saved automatically"
        )
        capture(page, "room-options-autosave-day")
        page.locator("#close-detail").click()
        page.get_by_role("button", name="Night mode", exact=True).click()
        page.locator("#room-header").click()
        capture(page, "room-options-autosave-night")

        # Closing and immediately pressing Play must await the pending save.
        held.clear()
        page.route("**/api/rooms/*/save", lambda route: held.append((route, route.fetch())))
        page.locator(".extra-options summary").click()
        rounds.fill("11")
        page.locator("#close-detail").click()
        page.get_by_role("button", name="Run", exact=True).click()
        page.wait_for_timeout(100)
        assert len(held) == 1 and not app.runs.items
        held[0][0].fulfill(response=held[0][1])
        expect(page.locator("#run-stop")).to_be_enabled()
        run = app.runs.get(page.evaluate("studio.session.run.id"))
        assert run.config["max_rounds"] == 11
        assert run.config["human_mode"] == "full"
        assert run.config["workspace"] == str(final_folder)
        page.unroute("**/api/rooms/*/save")
        page.locator("#run-stop").click()
        page.locator("#confirm-stop").click()
        expect(page.locator("#scene-state")).to_contain_text("Stopped")
        assert not errors
        browser.close()


def test_inline_agent_models_hide_profiles_and_preserve_effective_settings(service):
    app, base, project = service
    app.demo = False  # Configure native bindings without executing any assistant.
    app.models = [
        {
            "backend": "codex",
            "model": "local-model",
            "label": "Local Model",
            "efforts": ["low", "high", "ultra"],
        }
    ]
    for name in ["careful-implementer", "another-nickname"]:
        assert (
            request(
                base,
                "/api/profiles",
                {
                    "project": str(project),
                    "name": name,
                    "backend": "codex",
                    "model": "local-model",
                    "reasoning_effort": "high",
                },
            )[0]
            == 201
        )
    room = create_room(base, project, profile="careful-implementer")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
        page.goto(base + "/office/")
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        page.evaluate("() => {studio.select('worker');}")
        expect(page.get_by_label("Model", exact=True).locator("option")).to_have_text(
            [
                "Select a model",
                "Codex default",
                "Claude default",
                "Local Model",
            ]
        )
        expect(page.get_by_label("Reasoning effort")).to_have_value("high")
        expect(page.get_by_label("Reasoning effort").locator("option")).to_have_text(
            [
                "Default",
                "Low",
                "High",
                "Ultra",
            ]
        )
        assert "careful-implementer" not in page.locator("#person-card").inner_text()
        assert page.get_by_role("button", name="Choose model", exact=True).count() == 0
        page.get_by_role("button", name="Mira avatar", exact=True).click()
        page.get_by_label("Reasoning effort").select_option("ultra")
        capture(page, "office-agent-simple-day")
        page.get_by_role("button", name="Save agent", exact=True).click()
        expect(page.locator("#person-card")).not_to_be_visible()
        binding = app.rooms.get(room["id"])["config"]["agents"]["Implementer"]
        assert binding["settings"] == {"model": "local-model", "reasoning_effort": "ultra"}
        assert binding["avatar"] == "planner" and binding["instructions"] == ""
        assert not app.runs.items
        page.reload()
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        page.evaluate("() => {studio.select('worker');}")
        expect(page.get_by_label("Reasoning effort")).to_have_value("ultra")
        browser.close()


@pytest.mark.parametrize("dpr", [1, 1.25, 2])
def test_fine_zoom_keeps_unfiltered_sprites_and_fit(service, dpr):
    _, base, _ = service
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=dpr)
        page.goto(base + "/office/")
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        original = page.locator("#game canvas").bounding_box()["width"]
        page.get_by_role("button", name="Zoom out", exact=True).click()
        smaller = page.locator("#game canvas").bounding_box()["width"]
        assert abs(original - smaller - 64) < 1
        page.get_by_role("button", name="Zoom in", exact=True).click()
        assert abs(page.locator("#game canvas").bounding_box()["width"] - original) < 1
        page.get_by_role("button", name="Zoom in", exact=True).click()
        page.locator("#fit").click()
        assert abs(page.locator("#game canvas").bounding_box()["width"] - original) < 1
        assert page.evaluate("""() => !studio.game.canvas.getContext('2d').imageSmoothingEnabled
          && [...studio.people.values()].every(p=>Number.isInteger(p.sprite.x)
          && Number.isInteger(p.sprite.y))""")
        browser.close()
