"""Visual surfaces and saving are presentation; they cannot advance the protocol."""

import pytest
from playwright.sync_api import expect, sync_playwright

pytestmark = pytest.mark.browser


def test_autosave_survives_closing_editor_failure_retry_and_reload(service):
    _, base, _ = service
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        page.goto(base)
        expect(page.locator("#task")).to_be_visible()
        page.locator("#task").fill("First saved brief")
        expect(page.locator("#save-status")).to_have_text("Saved")
        page.route(
            "**/api/rooms/*/save",
            lambda route: route.fulfill(
                status=503, content_type="application/json", body='{"error":"Disk unavailable"}'
            ),
        )
        page.locator("#task").fill("Keep this brief even if saving fails")
        expect(page.locator("#save-status")).to_have_text("Saving…")
        page.locator("#actor-Reviewer").click()
        expect(page.locator("#save-status")).to_have_text("Not saved")
        expect(page.locator("#retry-save")).to_be_visible()
        page.unroute("**/api/rooms/*/save")
        page.locator("#retry-save").click()
        expect(page.locator("#save-status")).to_have_text("Saved")
        page.reload()
        page.locator("#project-board").click()
        expect(page.locator("#task")).to_have_value("Keep this brief even if saving fails")
        assert page.get_by_role("button", name="Done", exact=True).count() == 0
        browser.close()
