import pytest
from conftest import request
from playwright.sync_api import expect, sync_playwright
from test_office_room_interface_browser import capture

pytestmark = pytest.mark.browser


def test_avatar_identity_persists_and_portraits_survive_theme_changes(service, config):
    app, base, project = service
    config.update(project=str(project), workspace=str(project))
    code, room = request(
        base,
        "/api/rooms",
        {
            "name": "Character studio",
            "brief": "A little blue colleague",
            "config": config,
        },
    )
    assert code == 201
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base + "/office/")
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        page.evaluate("() => {studio.select('worker');}")
        expect(page.locator("#person-name")).to_have_text("Theo")
        page.get_by_role("button", name="Otto avatar", exact=True).click()
        page.get_by_role("button", name="Save agent", exact=True).click()
        expect(page.locator("#person-card")).not_to_be_visible()

        def check_identity(name, appearance):
            page.wait_for_function(
                """([name,appearance]) => {
                  const p=studio.people.get('worker');
                  return p.name===name&&p.appearance===appearance;
                }""",
                arg=[name, appearance],
            )
            assert page.evaluate(
                """() => {const p=studio.people.get('worker');
                  return p.nameTag.texture.key===studio.nameTexture(p);}"""
            )
            assert (
                app.rooms.get(room["id"])["config"]["agents"]["Implementer"]["avatar"] == appearance
            )

        check_identity("Otto", "otto")
        page.reload()
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        check_identity("Otto", "otto")
        page.evaluate("() => {studio.select('worker');}")
        expect(page.locator("#person-name")).to_have_text("Otto")
        expect(page.locator("#person-role")).to_contain_text("Worker")
        capture(page, "otto-agent-day")
        # Each choice must keep its own portrait when the theme changes.
        for mood in ["night", "day"]:
            page.evaluate("mood => studio.setMood(mood)", mood)
            assert (
                page.locator(".agent-avatar-options canvas").evaluate_all(
                    "els => new Set(els.map(c=>c.toDataURL())).size"
                )
                == 5
            )
        page.locator("#close-person").click()
        page.evaluate("() => {studio.session.configuration.avatarChooser('worker');}")
        capture(page, "otto-chooser-day")
        page.get_by_role("button", name="Choose Mira avatar", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        check_identity("Mira", "planner")
        page.evaluate("() => {studio.select('worker');}")
        expect(page.locator("#person-name")).to_have_text("Mira")
        page.get_by_role("button", name="Otto avatar", exact=True).click()
        page.get_by_role("button", name="Save agent", exact=True).click()
        expect(page.locator("#person-card")).not_to_be_visible()
        # Exercise the entire sprite sheet, including idle/typing at the chair.
        check_identity("Otto", "otto")
        page.evaluate("""() => {
          studio.game.loop.stop();studio.ambient.cancel();studio.handoffs.cancel();
          const p=studio.people.get('worker');
          const texture=studio.textures.get('day:person-otto');
          for(let f=0;f<28;f++)if(!texture.has(f))throw Error('Missing Otto frame '+f);
          studio.seating.stand(p);
          for(let i=0;i<90;i++)studio.update(0,1000/30);
          studio.moveTo('worker',{x:320,y:220});
          for(let i=0;i<180;i++)studio.update(0,1000/30);
          if(p.route.length||p.seated)throw Error('Otto did not leave the desk');
          p.direction='down';p.motion.face('down');p.sprite.setFrame(0);
          p.nameTag.setVisible(true);
          studio.game.step(performance.now(),0);
        }""")
        capture(page, "otto-standing-day")
        page.evaluate("() => {studio.setMood('night');studio.game.step(performance.now(),0);}")
        capture(page, "otto-standing-night")
        page.set_viewport_size({"width": 320, "height": 844})
        page.evaluate("() => {studio.select('worker');}")
        card = page.locator("#person-card")
        assert card.evaluate("e => e.scrollWidth <= e.clientWidth+1")
        expect(page.get_by_role("button", name="Otto avatar", exact=True)).to_be_visible()
        assert not errors
        browser.close()
