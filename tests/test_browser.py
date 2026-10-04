from __future__ import annotations

import os
import re
import tomllib
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

pytestmark = pytest.mark.browser


def screenshot(page, name):
    if os.environ.get("ZIPPERCREW_SCREENSHOTS"):
        target = Path(os.environ["ZIPPERCREW_SCREENSHOTS"])
        target.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(target / f"{name}.png"), full_page=True)


def configure(page, project, mode="brief"):
    for role in ("Implementer", "Reviewer"):
        page.locator(f"#actor-{role}").click()
        page.get_by_label("Assistant profile", exact=True).select_option("Scripted demo")
    page.locator("#actor-Human").click()
    page.get_by_label("Your involvement").select_option(mode)
    page.get_by_label("Maximum rounds").fill("3")
    page.get_by_role("button", name="Close inspector").click()
    page.locator("#project-board").click()
    page.get_by_label("Working repository").fill(str(project))
    page.get_by_label("The task", exact=True).fill(
        "Fix the rounding error and add a regression test."
    )
    page.get_by_role("button", name="Done", exact=True).click()
    expect(page.locator("#room-status")).to_have_text("Ready")


def test_continuous_room_through_two_rounds_and_history(service):
    _, base, project = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base)
        expect(page.locator("#room-art")).to_be_visible()
        expect(page.locator("#actor-Implementer")).to_have_class(re.compile("empty"))
        expect(page.locator("#actor-Reviewer")).to_have_class(re.compile("empty"))
        expect(page.locator("#actor-Human")).to_have_class(re.compile("bound"))
        expect(page.locator("#start")).to_be_disabled()
        assert page.get_by_text("Open the room", exact=False).count() == 0
        screenshot(page, "first-frame")
        configure(page, project)
        screenshot(page, "ready")
        scene = page.locator("#room-art").element_handle()
        page.get_by_role("button", name="Start working").click()
        expect(page.locator("#actor-Implementer")).to_have_class(re.compile("working"))
        expect(page.locator("#actor-Reviewer")).to_have_class(re.compile("waiting"))
        assert scene.evaluate("node => node === document.getElementById('room-art')")
        expect(page.locator("#actor-Reviewer")).to_have_class(re.compile("reviewing"))
        screenshot(page, "reviewing")
        expect(page.get_by_role("button", name="Another round", exact=True)).to_be_visible(
            timeout=15000
        )
        expect(page.locator("#actor-Human")).to_have_class(re.compile("needs-human"))
        expect(page.locator("#message-paths path")).to_have_count(1)
        screenshot(page, "human-turn")
        page.reload()
        expect(page.get_by_role("button", name="Another round", exact=True)).to_be_visible()
        # Historical messages do not pretend to be new transfers on reconnect.
        expect(page.locator("#message-tokens")).to_be_empty()
        page.get_by_role("button", name="Another round", exact=True).click()
        page.get_by_label("Guidance for the Implementer").fill("Check zero as well.")
        page.get_by_role("button", name="Continue the conversation").click()
        expect(page.locator("#round-label")).to_have_text("ROUND 2 / 3", timeout=15000)
        expect(page.get_by_role("button", name="Ship it", exact=True)).to_be_visible(timeout=15000)
        page.locator("#actor-Implementer").click()
        expect(page.locator("#transcript")).to_contain_text("Check zero as well.")
        expect(page.locator("#role-access")).to_have_text("Write access")
        screenshot(page, "inspector")
        page.locator("#human-return").click()
        page.get_by_role("button", name="Ship it", exact=True).click()
        expect(page.locator("#outcome")).to_contain_text("Shipped after 2 round(s)", timeout=15000)
        expect(page.locator("#room-status")).to_have_text("Completed")
        assert page.locator("#trace-link").get_attribute("href").endswith("/trace")
        page.get_by_role("button", name="Close inspector").click()
        screenshot(page, "completed")
        page.get_by_role("button", name="New room").click()
        page.get_by_role("button", name="Rooms", exact=True).click()
        page.locator(".history-item").first.click()
        expect(page.locator("#room-status")).to_have_text("Completed")
        expect(page.locator("#outcome")).to_contain_text("Shipped after 2 round(s)")
        page.set_viewport_size({"width": 390, "height": 844})
        page.locator("#actor-Reviewer").click()
        expect(page.locator("#role-access")).to_have_text("Read-only access")
        screenshot(page, "mobile")
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        assert not errors
        browser.close()


def test_profile_creation_with_model_pins_from_empty_station(service):
    app, base, project = service
    app.demo = False  # Use real profile storage; this test never launches an assistant.
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(base)
        expect(page.locator("#room-art")).to_be_visible()
        screenshot(page, "first-frame-real")
        page.locator("#actor-Implementer").focus()
        page.keyboard.press("Enter")
        page.get_by_role("button", name="Create a profile").click()
        page.get_by_label("Profile name", exact=True).fill("precise-implementer")
        page.get_by_label("Model", exact=False).fill("model-for-implementation")
        page.get_by_label("Reasoning effort", exact=False).fill("high")
        page.get_by_role("button", name="Save profile").click()
        expect(page.locator("#actor-Implementer")).to_have_class(re.compile("bound"))
        expect(page.locator("#role-profile")).to_have_value("precise-implementer")
        expect(page.locator("#profile-summary")).to_contain_text(
            "model-for-implementation · high effort"
        )
        page.locator("#actor-Reviewer").click()
        expect(page.locator("#actor-Reviewer")).to_have_class(re.compile("empty"))
        page.get_by_label("Assistant profile", exact=True).select_option("precise-implementer")
        expect(page.locator("#role-access")).to_have_text("Read-only access")
        saved = tomllib.loads((project / "zippergen.toml").read_text())
        assert (
            saved["assistants"]["configurations"]["precise-implementer"]["reasoning_effort"]
            == "high"
        )
        expect(page.locator("#error")).to_be_hidden()
        browser.close()


@pytest.mark.parametrize("motion", ["reduce", "no-preference"])
def test_autonomous_review_same_room_and_motion_preference(service, motion):
    _, base, project = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1180, "height": 820}, reduced_motion=motion)
        page.goto(base)
        configure(page, project, "auto")
        scene = page.locator("#room-art").element_handle()
        page.get_by_role("button", name="Start working").click()
        expect(page.locator("#outcome")).to_contain_text("Shipped after 2 round(s)", timeout=15000)
        expect(page.locator("#human-panel")).to_be_hidden()
        assert scene.evaluate("node => node === document.getElementById('room-art')")
        assert page.locator("animateMotion").count() == (0 if motion == "reduce" else 1)
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        browser.close()
