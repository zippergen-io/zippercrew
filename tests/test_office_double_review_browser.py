import pytest
from conftest import request, wait_state
from playwright.sync_api import expect, sync_playwright
from test_office_decisions_browser import capture

pytestmark = pytest.mark.browser


def test_double_review_room_decision_and_workflow_switch(service, config, monkeypatch):
    monkeypatch.setenv("ZIPPERCREW_DEMO_TURN_SECONDS", "1")
    app, base, project = service
    config.update(project=str(project), workspace=str(project))
    _, room = request(
        base,
        "/api/rooms",
        {"name": "Review studio", "brief": "Check a small change", "config": config},
    )
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base + "/office/")
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        page.locator("#room-header").click()
        page.locator(".room-workflow").click()
        expect(page.get_by_role("button", name="Double review", exact=True)).to_be_visible()
        capture(page, "double-review-chooser")
        page.get_by_role("button", name="Double review", exact=True).click()
        page.wait_for_function("() => studio.people.size===4 && !studio.session.busy")
        expect(page.locator("#scene-state")).to_contain_text("Double review")
        page.evaluate("() => {studio.select('planner');}")
        expect(page.locator("#person-role")).to_contain_text("Critical reviewer")
        expect(page.locator(".role-explanation")).to_contain_text("assumptions, edge cases")
        page.get_by_role("button", name="Otto avatar", exact=True).click()
        page.get_by_role("button", name="Save agent", exact=True).click()
        page.wait_for_function(
            "() => studio.people.get('planner').name==='Otto' && !studio.session.busy"
        )
        assert app.rooms.get(room["id"])["config"]["agents"]["Critic"]["avatar"] == "otto"
        page.reload()
        page.wait_for_function("() => studio.session?.initialized && studio.people.size===4")
        capture(page, "double-review-office")
        page.locator("#room-header").click()
        assert page.locator(".extra-options>summary").evaluate(
            "(e)=>getComputedStyle(e).fontSize"
        ) == page.locator(".room-team>summary").evaluate("(e)=>getComputedStyle(e).fontSize")
        assert (
            page.locator(".extra-options>summary").evaluate("(e)=>getComputedStyle(e).gap")
            == "10px"
        )
        capture(page, "double-review-room-options")
        page.get_by_text("How this workflow works", exact=True).click()
        expect(page.locator(".workflow-help")).to_contain_text(
            "Your decision uses both final assessments"
        )
        expect(page.locator(".workflow-help")).to_contain_text("Delivery reviewer:")
        expect(page.locator(".workflow-help")).to_contain_text("Critical reviewer:")
        capture(page, "double-review-workflow-help")
        page.locator("#close-detail").click()
        page.locator("#room-action").click()
        page.wait_for_function("() => !!studio.session.decisions.pending")
        run_id = page.evaluate("() => studio.session.run.id")
        assert page.evaluate("""() => [studio.handoffs.active,...studio.handoffs.queue]
          .filter(Boolean).every(m=>m.recipient==='human'&&['reviewer','planner'].includes(m.sender))""")
        assert page.evaluate("""() => studio.handoffs.completed.some(
          m=>m.from==='worker' && m.to==='human')""")
        assert (
            page.evaluate("""async () => {
          const {boardStatus}=await import('/office/task-board.js');
          const run={status:'running',round:1,participants:{Critic:'reviewing'}};
          return boardStatus(run,true,true).text;
        }""")
            == "R1 - REVIEWING"
        )
        assert page.evaluate("""() => studio.session.run.messages.some(m =>
          m.from==='Reviewer' && m.to==='Critic' && m.send_id && m.receive_id)""")
        page.evaluate("() => {studio.select('human');}")
        expect(page.locator("#detail-title")).to_have_text("Your decision")
        expect(page.locator(".decision-recommendation")).to_have_text("The reviewers disagree")
        expect(page.locator(".reviewer-opinions")).to_contain_text("Delivery reviewer · Ship it")
        expect(page.locator(".reviewer-opinions")).to_contain_text(
            "Critical reviewer · Another round"
        )
        expect(page.locator("#person-card")).not_to_be_visible()
        capture(page, "double-review-decision-day")
        page.get_by_role("button", name="Why another round?", exact=True).click()
        expect(page.locator(".decision-detail-panel:not([hidden])")).to_contain_text(
            "Critical reviewer"
        )
        assert page.locator("dialog[open]").count() == 1
        page.get_by_role("button", name="Why another round?", exact=True).click()
        page.evaluate("() => {studio.setMood('night');}")
        capture(page, "double-review-decision-night")
        page.set_viewport_size({"width": 390, "height": 844})
        capture(page, "double-review-decision-mobile")
        assert page.locator("#detail-dialog").evaluate("(el)=>el.scrollWidth<=el.clientWidth+2")
        page.get_by_role("button", name="Run next round", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.wait_for_function(
            "() => studio.session.run?.round===2 && !!studio.session.decisions.pending"
        )
        page.evaluate("() => {studio.select('human');}")
        expect(page.locator(".decision-recommendation")).to_have_text(
            "Both reviewers recommend shipping"
        )
        page.get_by_role("button", name="Ship it", exact=True).click()
        wait_state(base, run_id, lambda s: s["status"] == "completed")
        page.wait_for_function("() => studio.session.run?.status==='completed'")
        page.locator("#room-header").click()
        page.locator(".room-workflow").click()
        page.get_by_role("button", name="Direct", exact=True).click()
        expect(page.locator("#detail-title")).to_have_text("Switch to Direct?")
        expect(page.locator("#detail-description")).to_contain_text("Critical reviewer")
        page.get_by_role("button", name="Switch to Direct", exact=True).click()
        page.wait_for_function("() => studio.people.size===2 && !studio.session.busy")
        assert "Critic" not in app.rooms.get(room["id"])["config"]["agents"]
        assert not errors
        browser.close()
