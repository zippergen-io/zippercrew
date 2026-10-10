import pytest
from conftest import request
from playwright.sync_api import expect, sync_playwright

pytestmark = pytest.mark.browser


def tab_to(page, selector):
    visited = []
    for _ in range(40):
        if page.locator(selector).evaluate("el => el === document.activeElement"):
            return
        visited.append(page.evaluate("document.activeElement.outerHTML.slice(0,180)"))
        page.keyboard.press("Tab")
    raise AssertionError(f"Cannot reach {selector} with Tab: {visited}")


def test_room_setup_and_decision_are_keyboard_accessible(service, config):
    _, base, project = service
    config.update(project=str(project), workspace=str(project))
    for binding in config["agents"].values():
        binding["profile"] = ""
    request(base, "/api/rooms", {"name": "Keyboard office", "brief": "", "config": config})
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(base + "/office/")
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        tab_to(page, '[data-room-object="task-board"]')
        page.keyboard.press("Enter")
        expect(page.get_by_label("Task", exact=True)).to_be_focused()
        page.keyboard.type("Check the keyboard workflow.")
        page.keyboard.press("Escape")
        expect(page.locator("#game")).to_be_focused()
        for actor in ("worker", "reviewer"):
            tab_to(page, f'[data-room-object="{actor}"]')
            page.keyboard.press("Enter")
            tab_to(page, "#agent-model")
            # Native select type-ahead also works in macOS headless Chromium.
            page.keyboard.type("Scripted demo")
            expect(page.locator("#agent-model")).to_have_value('["demo",""]')
            page.keyboard.press("Tab")
            tab_to(page, "#agent-controls button[type=submit]")
            page.keyboard.press("Enter")
            expect(page.locator("#person-card")).not_to_be_visible()
            expect(page.locator("#session-error")).not_to_be_visible()
        tab_to(page, "#room-action")
        expect(page.locator("#room-action")).to_be_enabled()
        page.keyboard.press("Enter")
        expect(page.locator("#scene-state")).to_contain_text("Your decision")
        expect(page.locator("#scene-state")).to_have_attribute("aria-live", "polite")
        expect(page.locator("#scene-state")).to_have_attribute("aria-atomic", "true")
        tab_to(page, '[data-room-object="human"]')
        page.keyboard.press("Enter")
        expect(page.locator("#detail-title")).to_have_text("Your decision")
        page.keyboard.press("Escape")
        # Enter on the office also opens the nearby Human when needed.
        expect(page.locator("#game")).to_be_focused()
        page.keyboard.press("Enter")
        expect(page.locator("#detail-title")).to_have_text("Your decision")
        assert not errors
        browser.close()


def test_small_ui_text_has_sufficient_contrast(service):
    _, base, _ = service
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(base + "/office/")
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        for mood in ("day", "night"):
            page.evaluate("mood => studio.setMood(mood)", mood)
            ratios = page.evaluate("""() => {
              const root=getComputedStyle(document.documentElement);
              const luminance=color=>{
                const rgb=color.startsWith('#')?color.slice(1).match(/../g).map(v=>parseInt(v,16)):
                  color.match(/[\\d.]+/g).slice(0,3).map(Number);
                return rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
                  .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
              };
              const contrast=(fg,bg)=>{const a=luminance(fg),b=luminance(bg);
                return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
              const ratios=['--paper','--panel'].map(bg=>contrast(
                root.getPropertyValue('--muted').trim(),root.getPropertyValue(bg).trim()));
              for(const state of ['setup','ready','attention']){
                const el=document.createElement('span');
                el.className='room-status';el.dataset.state=state;
                if(state==='attention')el.className='attention-state';document.body.append(el);
                ratios.push(contrast(getComputedStyle(el).color,root.getPropertyValue('--paper').trim()));el.remove();
              }
              return ratios;
            }""")
            assert min(ratios) >= 4.5, (mood, ratios)
        browser.close()


def test_invalid_room_option_returns_to_its_field(service, config):
    _, base, project = service
    config.update(project=str(project), workspace=str(project))
    _, room = request(base, "/api/rooms", {"name": "First", "brief": "Task", "config": config})
    _, other = request(base, "/api/rooms", {"name": "Second", "brief": "Task", "config": config})
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(base + "/office/#room=" + room["id"])
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        page.get_by_role("button", name="Room options", exact=True).click()
        page.get_by_text("Advanced", exact=True).click()
        page.get_by_label("Maximum rounds", exact=True).fill("0")
        expect(page.locator(".room-save-status")).to_contain_text("between 1 and 100")
        page.locator("#close-detail").click()
        page.get_by_role("button", name="Studio menu", exact=True).click()
        page.get_by_role("button", name="Rooms", exact=True).click()
        page.get_by_role("button", name="Enter Second", exact=True).click()
        expect(page.locator("#detail-kind")).to_have_text("Studio / Room")
        expect(page.get_by_label("Maximum rounds", exact=True)).to_be_visible()
        expect(page.get_by_label("Maximum rounds", exact=True)).to_have_attribute(
            "aria-invalid", "true"
        )
        assert page.evaluate("studio.session.room.id") == room["id"]
        page.get_by_label("Maximum rounds", exact=True).fill("3")
        page.locator("#close-detail").click()
        page.get_by_role("button", name="Studio menu", exact=True).click()
        page.get_by_role("button", name="Rooms", exact=True).click()
        page.get_by_role("button", name="Enter Second", exact=True).click()
        expect(page.locator("#room-name")).to_have_text("Second")
        assert page.evaluate("studio.session.room.id") == other["id"]
        browser.close()


def test_theme_choice_survives_opening_the_plain_office_address(service):
    app, base, _ = service
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(base + "/office/")
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        page.get_by_role("button", name="Night mode", exact=True).click()
        page.wait_for_function("() => !studio.session.busy")
        assert app.preferences.get()["appearance"] == "night"
        page.goto(base + "/office/")
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        expect(page.locator("html")).to_have_attribute("data-mood", "night")
        page.goto(base + "/office/?mood=day")
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        expect(page.locator("html")).to_have_attribute("data-mood", "day")
        assert app.preferences.get()["appearance"] == "night"
        browser.close()
