from __future__ import annotations

import os
import re

import pytest
from playwright.sync_api import expect, sync_playwright

pytestmark = pytest.mark.browser


def test_complete_browser_conversation(service, tmp_path):
    _, base, project = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1100}, reduced_motion="reduce")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base)
        expect(page.get_by_role("heading", name="Two minds.")).to_be_visible()
        page.locator("#workspace").fill(str(project))
        page.locator("#task").fill("Fix the rounding error and add a regression test.")
        page.locator("#max-rounds").fill("3")
        page.screenshot(path=str(tmp_path / "setup.png"), full_page=True)
        page.get_by_role("button", name="Open the room").click()
        expect(page.locator("#actor-Implementer")).to_have_class(re.compile("working"))
        expect(page.locator("#actor-Reviewer")).to_have_class(re.compile("waiting"))
        expect(page.get_by_role("button", name="Another round", exact=True)).to_be_visible(
            timeout=15000
        )
        expect(page.locator("#actor-Human")).to_have_class(re.compile("needs-human"))
        page.reload()
        expect(page.get_by_role("button", name="Another round", exact=True)).to_be_visible()
        page.screenshot(path=str(tmp_path / "human-turn.png"), full_page=True)
        page.get_by_role("button", name="Another round", exact=True).click()
        page.get_by_label("Guidance for the Implementer").fill("Check zero as well.")
        page.get_by_role("button", name="Continue the conversation").click()
        expect(page.locator("#round-label")).to_have_text("ROUND 2 / 3", timeout=15000)
        expect(page.get_by_role("button", name="Ship it", exact=True)).to_be_visible(timeout=15000)
        page.get_by_role("tab", name="Implementer", exact=True).click()
        expect(page.locator("#transcript")).to_contain_text("Check zero as well.")
        page.get_by_role("button", name="Ship it", exact=True).click()
        expect(page.locator("#outcome")).to_contain_text("Shipped after 2 round(s)", timeout=15000)
        expect(page.locator("#room-status")).to_have_text("completed")
        page.set_viewport_size({"width": 390, "height": 844})
        page.screenshot(path=str(tmp_path / "mobile.png"), full_page=True)
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        assert not errors
        if os.environ.get("ZIPPERCREW_SCREENSHOTS"):
            import shutil
            from pathlib import Path

            target = Path(os.environ["ZIPPERCREW_SCREENSHOTS"])
            target.mkdir(parents=True, exist_ok=True)
            for name in ("setup.png", "human-turn.png", "mobile.png"):
                shutil.copy(tmp_path / name, target / name)
        browser.close()
