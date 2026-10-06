"""Shell acceptance: actual hit targets, scroll boundaries and live canvas resizing."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from conftest import request
from playwright.sync_api import expect, sync_playwright

pytestmark = pytest.mark.browser
LAPTOPS = [(1440, 900), (1366, 768), (1280, 720), (1200, 650), (1000, 600)]


def resize(page, width, height):
    page.set_viewport_size({"width": width, "height": height})
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_function("""async () => {
        const host=document.getElementById('room-host'), canvas=host.querySelector('canvas');
        const view=(await import('/scene.js')).inspectScene();
        return canvas.width===host.clientWidth && canvas.height===host.clientHeight &&
            view.viewport.width===host.clientWidth;
    }""")


def reachable(page, selector):
    control = page.locator(selector)
    control.scroll_into_view_if_needed()
    control.click(trial=True)
    assert control.evaluate("""el => {
        const r=el.getBoundingClientRect();
        return r.top>=0 && r.bottom<=innerHeight+1 && r.left>=0 && r.right<=innerWidth+1 &&
            el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
    }"""), selector


def shell_bounds(page, desktop=True, fits=True):
    data = page.evaluate("""() => {
        const rect=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();
        return {stage:rect('.room-stage'), inspector:rect('#inspector'),
            workspace:rect('main'), dock:rect('.control-dock'), canvas:rect('#room-host canvas'),
            body:getComputedStyle(document.body).overflowY,
            scrollWidth:document.documentElement.scrollWidth,
            scrollHeight:document.documentElement.scrollHeight,
            width:innerWidth,height:innerHeight};
    }""")
    assert data["scrollWidth"] <= data["width"]
    assert data["dock"]["top"] >= data["workspace"]["bottom"] - 1
    assert data["stage"]["bottom"] <= data["dock"]["top"] + 1
    assert abs(data["canvas"]["width"] - data["stage"]["width"]) <= 1
    assert abs(data["canvas"]["height"] - data["stage"]["height"]) <= 1
    assert data["body"] != "hidden"
    if desktop:
        assert abs(data["inspector"]["right"] - data["width"]) <= 1
        assert abs(data["stage"]["right"] - data["inspector"]["left"]) <= 1
        assert 300 <= data["inspector"]["width"] <= 390
    else:
        assert data["inspector"]["top"] >= data["stage"]["bottom"] - 1
    if fits:
        assert data["scrollHeight"] <= data["height"] + 1
        assert data["dock"]["bottom"] <= data["height"] + 1
    return data


def capture(page, label):
    if directory := os.environ.get("ZIPPERCREW_SCREENSHOTS"):
        path = Path(directory)
        path.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(path / f"shell-{label}.png"), full_page=True)


def test_shell_across_heights_widths_and_real_human_decision(service):
    _, base, project = service
    status, room = request(
        base,
        "/api/rooms",
        {
            "name": "A named room with a long but valid project title",
            "brief": "Check the implementation. " * 50,
            "config": {
                "project": str(project),
                "workspace": str(project),
                "human_mode": "full",
                "max_rounds": 3,
                "agents": {
                    role: {"profile": "Scripted demo", "instructions": ""}
                    for role in ("Implementer", "Reviewer")
                },
            },
        },
    )
    assert status == 201
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(reduced_motion="reduce")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"{base}/#room={room['id']}&setup=1")
        expect(page.locator("#room-art")).to_have_attribute("data-ready", "true")
        expect(page.locator("#start")).to_be_enabled()
        canvas = page.locator("#room-host canvas").element_handle()
        sizes = {}
        for width, height in LAPTOPS + [(1920, 900), (2560, 900), (1280, 720)]:
            resize(page, width, height)
            sizes[width] = shell_bounds(page)["stage"]["width"]
            for selector in ("#start", "#task-control", "#activity-control"):
                reachable(page, selector)
            # With DOM targets temporarily disabled, the corresponding canvas
            # point must still select the same participant after every resize.
            human = page.locator("#actor-Human").bounding_box()
            page.locator(".scene-controls button").evaluate_all(
                "nodes => nodes.forEach(n=>n.style.pointerEvents='none')"
            )
            page.mouse.click(human["x"] + human["width"] / 2, human["y"] + human["height"] / 2)
            expect(page.locator("#inspector-title")).to_have_text("Human")
            page.locator(".scene-controls button").evaluate_all(
                "nodes => nodes.forEach(n=>n.style.pointerEvents='')"
            )
            capture(page, f"setup-{width}x{height}")
        assert sizes[2560] > sizes[1920] > sizes[1440] > sizes[1000]
        # A very short window scrolls the document; a narrow window stacks it.
        for width, height in [(1000, 320), (800, 500), (390, 600), (800, 300)]:
            resize(page, width, height)
            shell_bounds(page, desktop=width > 900, fits=False)
            for selector in ("#start", "#task-control", "#activity-control"):
                reachable(page, selector)
            capture(page, f"compact-{width}x{height}")
        resize(page, 1280, 720)
        page.locator("#start").click()
        expect(page.locator("#human-return")).to_be_visible(timeout=30000)
        for width, height in LAPTOPS + [(1000, 320), (390, 600), (1440, 900)]:
            resize(page, width, height)
            shell_bounds(page, desktop=width > 900, fits=height >= 600 and width > 900)
            reachable(page, "#human-return")
            page.locator("#human-return").click()
            for label in ("Ship it", "Another round", "Abandon"):
                button = page.get_by_role("button", name=label, exact=True)
                button.scroll_into_view_if_needed()
                button.click(trial=True)
                assert button.evaluate("""el=>{
                    const r=el.getBoundingClientRect();
                    const body=document.getElementById('inspector-body').getBoundingClientRect();
                    return r.top>=body.top && r.bottom<=body.bottom+1;
                }""")
            capture(page, f"decision-{width}x{height}")
        page.get_by_role("button", name="Ship it", exact=True).click()
        expect(page.locator("#room-status")).to_have_text("Completed")
        for width, height in [(1280, 720), (1000, 600), (1000, 320), (390, 600), (2560, 900)]:
            resize(page, width, height)
            shell_bounds(page, desktop=width > 900, fits=height >= 600 and width > 900)
            for selector in ("#run-again", "#result-control", "#task-control"):
                reachable(page, selector)
        page.locator("#run-again").click()
        expect(page.locator("#start")).to_be_enabled()
        assert canvas.evaluate("el=>el===document.querySelector('#room-host canvas')")
        assert not errors
        browser.close()
