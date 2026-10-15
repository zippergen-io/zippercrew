import os
from pathlib import Path

import pytest
from conftest import request
from playwright.sync_api import expect, sync_playwright

pytestmark = pytest.mark.browser


def click_setup_highlight(page, actor):
    point = page.evaluate(
        """id => {
          const s=studio, label=s.session.configuration.markers.get(id).ring;
          const bounds=label.getBounds(), camera=s.cameras.main;
          const canvas=s.game.canvas.getBoundingClientRect();
          return {
            x:canvas.x+(bounds.centerX-camera.worldView.x)*camera.zoom*canvas.width/s.scale.width,
            y:canvas.y+(bounds.centerY-camera.worldView.y)*camera.zoom*canvas.height/s.scale.height
          };
        }""",
        actor,
    )
    page.mouse.click(point["x"], point["y"])


def test_missing_setup_stays_visible_and_highlights_open_configuration(service, config):
    _, base, project = service
    config.update(project=str(project), workspace=str(project))
    for binding in config["agents"].values():
        binding["profile"] = ""
    request(base, "/api/rooms", {"name": "New room", "brief": "", "config": config})
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 960})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(base + "/office/")
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        page.wait_for_function(
            "() => studio.session.configuration.markers.get('worker')?.ring.visible"
        )
        for mood in ("day", "night"):
            page.evaluate("mood => {studio.setMood(mood);studio.paused=true;}", mood)
            page.wait_for_function(
                "mood => studio.session.configuration.markers.get('board')"
                ".ring.texture.key.startsWith(mood)",
                arg=mood,
            )
            assert page.evaluate("""() => ['worker','reviewer','board'].every(id => {
              const m=studio.session.configuration.markers.get(id);
              return m.ring.visible && !m.label.hidden && !m.label.disabled;
            })""")
            if target := os.environ.get("ZIPPERCREW_OFFICE_CAPTURES"):
                Path(target).mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(Path(target) / f"setup-highlights-{mood}.png"))
        # HTML guidance follows the same world point when zoom changes.
        for control in ("#zoom-out", "#zoom-in"):
            page.locator(control).click()
            page.wait_for_function("""() => {
              const s=studio, m=s.session.configuration.markers.get('worker');
              const label=m.label.getBoundingClientRect();
              const canvas=s.game.canvas.getBoundingClientRect();
              const camera=s.cameras.main;
              const x=canvas.x+(m.ring.x-camera.worldView.x)*camera.zoom*canvas.width/s.scale.width;
              const y=canvas.y+(m.ring.y-camera.worldView.y)
                *camera.zoom*canvas.height/s.scale.height;
              return Math.abs(label.x+label.width/2-x)<2 && Math.abs(label.y+label.height/2-y)<2;
            }""")
        # The action is inside the square, so speech above it need not hide setup.
        page.evaluate("() => studio.say('worker','HELLO.',.2)")
        page.wait_for_function("() => !studio.people.get('worker').bubble")
        assert page.evaluate("studio.session.configuration.markers.get('worker').ring.visible")
        assert page.evaluate("!studio.session.configuration.markers.get('worker').label.hidden")
        click_setup_highlight(page, "worker")
        expect(page.locator("#person-card")).to_be_visible()
        page.get_by_label("Model", exact=True).select_option('["demo",""]')
        page.get_by_role("button", name="Save agent", exact=True).click()
        page.wait_for_function(
            "() => !studio.session.configuration.markers.get('worker').ring.visible"
        )
        assert page.evaluate("studio.session.configuration.markers.get('worker').label.hidden")
        click_setup_highlight(page, "board")
        expect(page.locator("#detail-title")).to_have_text("Your task")
        page.get_by_label("Task", exact=True).fill("Check the office setup")
        page.locator("#close-detail").click()
        page.wait_for_function(
            "() => !studio.session.configuration.markers.get('board').ring.visible"
        )
        assert page.evaluate("studio.session.configuration.markers.get('reviewer').ring.visible")
        assert not errors
        browser.close()
