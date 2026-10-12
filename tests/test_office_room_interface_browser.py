from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from conftest import request
from playwright.sync_api import expect, sync_playwright

pytestmark = pytest.mark.browser


def capture(page, name):
    if directory := os.environ.get("ZIPPERCREW_OFFICE_CAPTURES"):
        target = Path(directory)
        target.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(target / f"{name}.png"), animations="disabled")


def test_studio_room_workflow_objects_and_direct_execution(service):
    app, base, project = service
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base + "/office/")
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        assert page.locator("#show-agents,#show-workflows,#sit,#walk-over").count() == 0
        expect(page.locator(".drawer-tabs button")).to_have_text(["Rooms", "History"])
        page.get_by_role("button", name="+ New room", exact=True).click()
        page.get_by_label("Room name", exact=True).fill("The workshop")
        assert page.locator("#setup-workspace").count() == 0
        capture(page, "studio-new-room-day")
        page.get_by_role("button", name="Review", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        expect(page.locator("#scene-state")).to_contain_text("Review · Setup needed")
        assert set(page.evaluate("[...studio.people.keys()]")) == {"worker", "reviewer", "human"}
        assert not app.runs.items
        # Missing models keep both agents available at their desks,
        # even after several ambient scheduling intervals.
        page.evaluate("""() => {
          studio.game.loop.stop();
          for(const b of Object.values(studio.session.room.config.agents))b.profile='';
          studio.session.configuration.sync();
          for(let i=0;i<120;i++)studio.update(0,1000/30);
          const positions=JSON.stringify([...studio.people.values()].map(p=>[p.x,p.y]));
          for(let i=0;i<1800;i++)studio.update(0,1000/30);
          if(studio.ambient.trip||positions!==JSON.stringify([...studio.people.values()].map(p=>[p.x,p.y])))
            throw Error('Unconfigured agents walked away');
          for(const b of Object.values(studio.session.room.config.agents))b.profile='demo';
          studio.session.configuration.sync();studio.game.loop.wake();
        }""")
        aligned = page.evaluate("""() => {
          const title=document.getElementById('room-name');
          const status=document.getElementById('scene-state');
          const range=document.createRange();range.selectNodeContents(title);
          return Math.abs(range.getBoundingClientRect().x-status.getBoundingClientRect().x)<.5;
        }""")
        assert aligned
        assert page.locator(".room-presence").evaluate("el => el.tagName === 'BUTTON'")
        assert page.locator(".room-presence button").count() == 0
        page.locator("#room-name").click()
        expect(page.locator(".room-workflow")).to_contain_text("Review")
        (project / "client app #1").mkdir()
        (project / "notes.txt").write_text("Do not upload this file")
        page.get_by_label("Repository", exact=True).fill(str(project))
        page.get_by_label("Room name", exact=True).fill("The workshop draft")
        page.get_by_role("button", name="Browse", exact=True).click()
        expect(page.locator(".folder-entry")).to_have_count(1)
        page.get_by_role("button", name="Open client app #1", exact=True).click()
        expect(page.locator(".folder-location")).to_have_text(str(project / "client app #1"))
        page.locator(".folder-actions").get_by_role("button", name="Cancel", exact=True).click()
        expect(page.get_by_label("Repository", exact=True)).to_have_value(str(project))
        expect(page.get_by_label("Room name", exact=True)).to_have_value("The workshop draft")
        page.get_by_label("Room name", exact=True).fill("The workshop")
        page.get_by_role("button", name="Browse", exact=True).click()
        page.get_by_role("button", name="Open client app #1", exact=True).click()
        page.get_by_role("button", name="Use this folder", exact=True).click()
        expect(page.get_by_label("Repository", exact=True)).to_have_value(
            str(project / "client app #1")
        )
        page.get_by_role("button", name="Browse", exact=True).click()
        page.get_by_role("button", name="Parent folder", exact=True).click()
        expect(page.locator(".folder-location")).to_have_text(str(project))
        capture(page, "studio-repository-browser-day")
        page.get_by_role("button", name="Use this folder", exact=True).click()
        expect(page.locator(".room-save-status .autosave-status")).to_have_text("")
        page.locator("#close-detail").click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        for actor in ["worker", "reviewer"]:
            page.evaluate("id => {studio.select(id);}", actor)
            page.locator(".agent-instructions summary").click()
            page.get_by_label("Instructions", exact=True).fill(f"{actor}: verify the result.")
            page.get_by_role("button", name="Save agent", exact=True).click()
            expect(page.locator("#person-card")).not_to_be_visible()
        page.locator("#room-name").click()
        page.locator(".room-team summary").click()
        expect(page.locator(".readiness")).to_have_text(["✓ Ready", "✓ Ready"])
        capture(page, "studio-room-review-day")
        page.get_by_role("button", name="Worker avatar", exact=True).click()
        page.get_by_role("button", name="Choose Mira avatar", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.locator("#room-name").click()
        page.locator(".room-workflow").click()
        page.get_by_role("button", name="Direct", exact=True).click()
        expect(page.locator("#detail-title")).to_have_text("Switch to Direct?")
        page.get_by_role("button", name="Keep Review", exact=True).click()
        assert "reviewer" in page.evaluate("[...studio.people.keys()]")
        page.locator(".room-workflow").click()
        page.get_by_role("button", name="Direct", exact=True).click()
        page.get_by_role("button", name="Switch to Direct", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        assert set(page.evaluate("[...studio.people.keys()]")) == {"worker", "human"}
        assert page.evaluate(
            "!studio.cast.get('reviewer').sprite.visible && "
            "!studio.cast.get('reviewer').sprite.input.enabled"
        )
        room = app.rooms.list()[0]
        assert set(room["config"]["agents"]) == {"Implementer"}
        assert room["config"]["agents"]["Implementer"]["avatar"] == "planner"
        page.reload()
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        assert set(page.evaluate("[...studio.people.keys()]")) == {"worker", "human"}
        # The actual board opens the task editor, without moving the human.
        bounds = page.locator("#game canvas").bounding_box()
        page.mouse.click(
            bounds["x"] + (245 - 24) * bounds["width"] / 512,
            bounds["y"] + (39 - 16) * bounds["height"] / 320,
        )
        expect(page.locator("#detail-title")).to_have_text("Your task")
        page.get_by_label("Task", exact=True).fill("Polish the workspace\nKeep the room calm")
        capture(page, "studio-task-day")
        page.get_by_role("button", name="Run task", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.locator("#room-name").click()
        expect(page.locator(".room-workflow")).to_be_disabled()
        page.locator("#close-detail").click()
        page.wait_for_function("() => !!studio.session.decisions.pending", timeout=45000)
        assert set(page.evaluate("Object.keys(studio.session.run.participants)")) == {
            "Implementer",
            "Human",
        }
        page.locator("#scene-state").click()
        expect(page.locator(".decision")).to_contain_text("Demo proposal")
        page.get_by_role("button", name="Done", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.wait_for_function("() => studio.session.run.status==='completed'")
        expect(page.locator("#room-action")).to_be_visible()
        expect(page.locator("#room-action")).to_be_enabled()
        assert page.evaluate("studio.people.get('human').bubbleText").startswith("Result accepted.")
        page.locator("#menu-toggle").click()
        assert page.locator("#show-settings,.drawer-help").count() == 0
        page.get_by_role("button", name="Night mode", exact=True).click()
        page.wait_for_function("() => studio.mood==='night' && !studio.session.busy")
        page.locator("#menu-toggle").click()
        page.locator("#show-history").click()
        expect(page.locator(".history-room")).to_have_text("The workshop")
        expect(page.locator(".history-entry")).to_contain_text("completed")
        page.locator("#show-rooms").click()
        capture(page, "studio-rooms-night")
        expect(page.locator(".enter-room[aria-current=location]")).to_have_attribute(
            "aria-label", "Enter The workshop"
        )
        assert page.locator(".room-list input").count() == 0
        expect(page.locator(".room-list")).not_to_contain_text("In this room")
        page.get_by_role("button", name="Enter The workshop", exact=True).click()
        expect(page.locator("#studio-menu")).not_to_be_visible()
        page.locator("#room-name").click()
        page.get_by_label("Room name", exact=True).fill("Quiet studio")
        page.locator("#close-detail").click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        expect(page.locator("#room-name")).to_have_text("Quiet studio")
        page.locator("#menu-toggle").click()
        page.get_by_role("button", name="+ New room", exact=True).click()
        page.get_by_role("button", name="Direct", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.locator("#menu-toggle").click()
        page.locator("#show-history").click()
        expect(page.locator(".history-room")).to_have_text("Quiet studio")
        page.locator("#show-rooms").click()
        expect(page.locator(".enter-room[aria-current=location]")).to_have_attribute(
            "aria-label", "Enter Untitled room"
        )
        capture(page, "studio-rooms-night")
        page.get_by_role("button", name="Enter Quiet studio", exact=True).click()
        expect(page.locator("#room-name")).to_have_text("Quiet studio")
        expect(page.locator("#studio-menu")).not_to_be_visible()
        page.locator("#room-name").click()
        page.locator(".room-workflow").click()
        page.get_by_role("button", name="Review", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        assert set(page.evaluate("[...studio.people.keys()]")) == {"worker", "reviewer", "human"}
        assert page.evaluate("studio.session.configuration.binding('reviewer').instructions") == ""
        page.locator("#room-name").click()
        capture(page, "studio-room-night")
        page.locator("#close-detail").click()
        page.evaluate("() => {studio.select('worker');}")
        capture(page, "studio-agent-night")
        page.locator("#close-person").click()
        page.set_viewport_size({"width": 390, "height": 844})
        page.locator("#room-name").click()
        panel = page.locator("#detail-dialog").bounding_box()
        assert panel["x"] >= 0 and panel["x"] + panel["width"] <= 390
        capture(page, "studio-room-mobile")
        page.locator("#close-detail").click()
        page.locator("#menu-toggle").click()
        page.locator("#show-rooms").click()
        page.get_by_role("button", name="Delete Quiet studio", exact=True).click()
        page.get_by_role("button", name="Cancel", exact=True).click()
        assert len(app.rooms.list()) == 2
        page.get_by_role("button", name="Delete Quiet studio", exact=True).click()
        page.get_by_role("button", name="Delete room", exact=True).click()
        expect(page.locator("#studio-menu")).to_be_visible()
        assert len(app.rooms.list()) == 1
        assert not errors
        browser.close()


def test_room_list_rename_and_tab_switches_keep_content_stable(service):
    app, base, project = service
    rooms = []
    for name in ["A longer room name", "Design review"]:
        code, room = request(
            base,
            "/api/rooms",
            {
                "name": name,
                "brief": "Refine the office feedback.",
                "config": {
                    "project": str(project),
                    "workspace": str(project),
                    "workflow": "direct",
                    "agents": {"Implementer": {"profile": "demo"}},
                },
            },
        )
        assert code == 201
        rooms.append(room)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base + "/office/#room=" + rooms[0]["id"])
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        page.locator("#menu-toggle").click()
        expect(page.locator(".room-row")).to_have_count(2)
        capture(page, "compact-rooms-day")

        # Neither a blank page nor a close/reopen should occur while fetching
        # another section. Responses arriving out of order must not change tabs.
        page.evaluate("""() => {
          window.drawerHides=0;
          new MutationObserver(records=>{window.drawerHides+=records.length;})
            .observe(document.getElementById('studio-menu'),
              {attributes:true,attributeFilter:['hidden']});
        }""")
        held = []
        page.route("**/api/rooms", lambda route: held.append((route, route.fetch())))
        before = page.locator("#studio-menu").bounding_box()
        page.locator("#show-history").click()
        expect(page.locator("#drawer-content")).to_have_attribute("aria-busy", "true")
        expect(page.locator(".room-row")).to_have_count(2)
        assert page.locator("#studio-menu").bounding_box() == before
        page.locator("#show-rooms").click()
        page.wait_for_timeout(100)
        assert len(held) == 2
        held[1][0].fulfill(response=held[1][1])
        expect(page.locator("#drawer-content")).to_have_attribute("aria-busy", "false")
        held[0][0].fulfill(response=held[0][1])
        page.wait_for_timeout(100)
        expect(page.locator(".drawer-page")).to_have_attribute("data-section", "rooms")
        expect(page.locator("#show-rooms")).to_have_attribute("aria-current", "true")
        assert page.evaluate("window.drawerHides") == 0
        page.unroute("**/api/rooms")
        page.locator("#show-history").click()
        expect(page.locator(".drawer-page")).to_have_attribute("data-section", "history")
        page.locator("#show-rooms").click()
        expect(page.locator(".room-row")).to_have_count(2)

        # Editing a name never enters that room. Escape cancels; Enter saves.
        page.get_by_role("button", name="Rename Design review", exact=True).click()
        editor = page.get_by_role("textbox", name="Rename Design review", exact=True)
        editor.fill("Discard this name")
        editor.press("Escape")
        expect(page.locator("#studio-menu")).to_be_visible()
        assert app.rooms.get(rooms[1]["id"])["name"] == "Design review"
        expect(page.locator("#room-name")).to_have_text("A longer room name")

        page.get_by_role("button", name="Rename A longer room name", exact=True).click()
        editor = page.get_by_role("textbox", name="Rename A longer room name", exact=True)
        editor.fill("Quiet workshop")
        page.route(
            "**/api/rooms/*/save",
            lambda route: route.fulfill(
                status=503, content_type="application/json", body=json.dumps({"error": "Try again"})
            ),
        )
        editor.press("Enter")
        expect(page.locator("#drawer-error")).to_have_text("Try again")
        expect(editor).to_have_value("Quiet workshop")
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.unroute("**/api/rooms/*/save")
        editor.press("Enter")
        expect(page.locator("#room-name")).to_have_text("Quiet workshop")
        expect(page.get_by_role("button", name="Delete Quiet workshop", exact=True)).to_be_visible()
        assert app.rooms.get(rooms[0]["id"])["name"] == "Quiet workshop"

        page.get_by_role("button", name="Rename Design review", exact=True).click()
        editor = page.get_by_role("textbox", name="Rename Design review", exact=True)
        editor.fill("Design notes")
        editor.press("Tab")  # Leaving the field also saves, without changing rooms.
        expect(page.get_by_role("button", name="Rename Design notes", exact=True)).to_be_visible()
        expect(page.locator("#room-name")).to_have_text("Quiet workshop")
        page.get_by_role("button", name="Enter Design notes", exact=True).click(
            position={"x": 12, "y": 20}
        )
        expect(page.locator("#room-name")).to_have_text("Design notes")
        expect(page.locator("#studio-menu")).not_to_be_visible()
        page.get_by_role("button", name="Night mode", exact=True).click()
        page.locator("#menu-toggle").click()
        expect(page.locator(".room-row")).to_have_count(2)
        capture(page, "compact-rooms-night")
        assert not errors
        browser.close()
