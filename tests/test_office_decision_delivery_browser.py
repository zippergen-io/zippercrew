"""Bounded catch-up never obstructs an actual human decision."""

import pytest
from conftest import request
from playwright.sync_api import expect, sync_playwright

pytestmark = pytest.mark.browser


def room(service, config, workflow, monkeypatch):
    monkeypatch.setenv("ZIPPERCREW_DEMO_TURN_SECONDS", ".15")
    app, base, project = service
    config.update(project=str(project), workspace=str(project), workflow=workflow)
    if workflow == "double_review":
        config["agents"]["Critic"] = dict(config["agents"]["Reviewer"])
    if workflow == "direct":
        config["agents"].pop("Reviewer")
    code, _ = request(
        base, "/api/rooms", {"name": "Handover", "brief": "Check the change", "config": config}
    )
    assert code == 201
    return app, base


def enter(page, base):
    page.goto(base + "/office/")
    page.wait_for_function(
        "() => studio.ready && studio.session.initialized && !studio.session.busy"
    )
    page.evaluate("() => {studio.game.loop.stop();}")
    page.clock.install()
    page.clock.pause_at("2030-01-01T00:00:00")


def start(page):
    page.locator("#room-action").click()
    page.wait_for_function("() => !!studio.session.run?.pending && !studio.session.busy")


@pytest.mark.parametrize("workflow", ["direct", "review", "double_review"])
def test_decision_catches_up_in_two_seconds_without_animation_frames(
    service, config, monkeypatch, workflow
):
    app, base = room(service, config, workflow, monkeypatch)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        enter(page, base)
        start(page)
        expect(page.locator("#scene-state")).to_contain_text("arriving")
        expect(page.locator("#run-pause")).to_be_disabled()
        expect(page.locator("#run-stop")).to_be_enabled()
        assert not page.evaluate(
            "!!studio.session.decisions.pending || studio.attention.sprite.visible"
        )
        width = page.locator(".controls-bar").bounding_box()["width"]
        page.clock.fast_forward(2000)
        expect(page.locator("#scene-state")).to_contain_text("Your decision")
        assert page.locator(".controls-bar").bounding_box()["width"] == width
        assert page.evaluate("studio.handoffs.satisfied(studio.session.run.pending.after)")
        assert page.evaluate(
            "studio.session.run.messages.filter(m=>!m.control&&m.receive_id).every(m=>studio.handoffs.completed.some(d=>d.id===m.id))"
        )
        assert not page.evaluate("!!studio.handoffs.active || studio.handoffs.note.visible")
        assert app.runs.get(page.evaluate("studio.session.run.id")).snapshot()["pending"]
        browser.close()


@pytest.mark.parametrize("workflow", ["direct", "review", "double_review"])
@pytest.mark.parametrize("entry", ["human", "header"])
def test_direct_decision_access_does_not_wait_for_animation(
    service, config, monkeypatch, entry, workflow
):
    app, base = room(service, config, workflow, monkeypatch)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        enter(page, base)
        start(page)
        assert page.evaluate("studio.session.decisions.arriving")
        if entry == "human":
            page.locator('[data-room-object="human"]').focus()
            page.keyboard.press("Enter")
        else:
            page.locator("#room-header").click()
        expect(page.locator("#detail-title")).to_have_text("Your decision")
        expect(page.locator("#person-card")).not_to_be_visible()
        expect(page.locator("#scene-state")).to_contain_text("Your decision")
        expect(page.locator("#scene-state")).to_have_attribute("data-state", "attention")
        assert page.evaluate("studio.people.get('human').liveStatus") == "Your decision"
        assert page.evaluate("studio.attention.sprite.visible")
        page.locator("#close-detail").click()
        page.clock.fast_forward(8000)
        expect(page.locator("#scene-state")).to_contain_text("Your decision")
        page.locator("#room-header").click()
        assert page.evaluate("studio.handoffs.satisfied(studio.session.run.pending.after)")
        page.get_by_role("button", name="Run next round", exact=True).click()
        page.wait_for_function("() => studio.session.run.round===2 && !!studio.session.run.pending")
        assert page.evaluate("studio.session.decisions.arriving")
        page.locator("#room-header").click()
        expect(page.locator("#detail-title")).to_have_text("Your decision")
        page.locator("#close-detail").click()
        page.clock.fast_forward(8000)
        expect(page.locator("#scene-state")).to_contain_text("Your decision")
        assert page.evaluate("studio.people.get('human').liveStatus") == "Your decision"
        assert page.evaluate("studio.attention.sprite.visible")
        browser.close()


@pytest.mark.parametrize(
    "escape",
    ["reload", "reconnect", "reduced_motion", "visibility", "stop", "failure", "room_switch"],
)
def test_catch_up_has_safe_exit_paths(service, config, monkeypatch, escape):
    app, base = room(service, config, "double_review", monkeypatch)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        enter(page, base)
        start(page)
        assert page.evaluate("studio.session.decisions.arriving")
        if escape == "reload":
            page.reload()
            page.wait_for_function(
                "() => studio.session?.connected && !!studio.session.decisions.pending"
            )
        elif escape == "reconnect":
            page.evaluate("() => studio.session.apply(studio.session.run,{replay:true})")
        elif escape == "reduced_motion":
            page.evaluate("() => {studio.paused=true;studio.update(0,16);}")
        elif escape == "visibility":
            page.evaluate("() => document.dispatchEvent(new Event('visibilitychange'))")
        elif escape == "room_switch":
            run = app.runs.get(page.evaluate("studio.session.run.id"))
            code, other = request(base, "/api/rooms", {"name": "Other office", "config": config})
            assert code == 201
            page.evaluate("id => studio.session.openRoom(id)", other["id"])
            assert not page.evaluate(
                "studio.session.decisions.delivery || studio.attention.sprite.visible"
            )
            assert run.snapshot()["pending"]
            browser.close()
            return
        elif escape in {"stop", "failure"}:
            run = app.runs.get(page.evaluate("studio.session.run.id"))
            if escape == "stop":
                run.stop()
                page.wait_for_function("() => studio.session.run.status==='stopped'")
            else:
                page.evaluate(
                    "() => studio.session.apply({"
                    "...studio.session.run,status:'failed',pending:null})"
                )
            page.clock.fast_forward(2000)
            assert not page.evaluate(
                "studio.session.decisions.delivery || studio.attention.sprite.visible"
                " || studio.handoffs.active"
            )
            assert page.evaluate(
                "studio.session.run.messages.filter(m=>!m.control&&m.receive_id).every(m=>studio.handoffs.done.has(m.id))"
            )
            browser.close()
            return
        expect(page.locator("#scene-state")).to_contain_text("Your decision")
        if escape != "reduced_motion":
            assert not page.evaluate("!!studio.handoffs.active || studio.handoffs.note.visible")
        browser.close()
