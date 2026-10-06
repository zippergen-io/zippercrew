"""Exercise the running Phaser scene and save real, unmodified browser captures."""

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
URL = "http://127.0.0.1:8774/spikes/pixel-office/"


def click_world(page, x, y):
    canvas = page.locator("#game canvas").bounding_box()
    page.mouse.click(canvas["x"] + x * canvas["width"] / 560,
                     canvas["y"] + y * canvas["height"] / 352)


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 1040})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(URL)
    page.wait_for_function("window.studio?.ready")
    page.wait_for_timeout(700)
    page.screenshot(path=str(HERE / "captures" / "studio.png"), full_page=True)
    if "--capture-only" in sys.argv:
        print(json.dumps(page.evaluate("studio.inspect()"), indent=2))
        print("Browser errors:", errors)
        browser.close()
        sys.exit(bool(errors))

    assert page.evaluate("studio.map.layers.length") == 1
    assert page.evaluate("studio.people.size") == 4
    assert page.evaluate("studio.game.renderer.type === Phaser.CANVAS")
    click_world(page, 368, 187)
    page.wait_for_function("studio.selected === 'planner'")
    assert "Planner" in page.locator("#person-role").inner_text()
    assert "Mira" in page.locator("#person-name").inner_text()
    assert not page.evaluate("studio.people.get('human').route.length")
    page.screenshot(path=str(HERE / "captures" / "meet-mira.png"))
    page.locator("#close-person").click()

    click_world(page, 320, 207)
    page.wait_for_function("!studio.people.get('human').route.length", timeout=15000)
    assert abs(page.evaluate("studio.people.get('human').y") - 208) < 5
    print("PASS sprite selection, role details and real click-to-walk", flush=True)

    page.locator("#menu-toggle").click()
    page.locator("#pause").click()
    page.keyboard.press("Escape")
    before = page.evaluate("studio.inspect()")
    page.wait_for_timeout(350)
    after = page.evaluate("studio.inspect()")
    assert before["time"] == after["time"]
    assert before["people"] == after["people"]
    page.locator("#game").focus()
    page.keyboard.down("ArrowDown")
    page.wait_for_timeout(400)
    page.keyboard.up("ArrowDown")
    assert page.evaluate("studio.people.get('human').y") > 214
    print("PASS pause and keyboard control while agents are paused", flush=True)

    # Run two whole scripted cycles through the exact scene update function.
    # Sample every frame to catch wall/furniture collisions and stuck routes.
    page.evaluate("""() => {
      studio.game.loop.stop(); studio.paused=false;
      const you=studio.people.get('human'); you.x=320;you.y=281;
      window.samples=[]; window.collisions=[];
      for(let frame=0;frame<6300;frame++) {
        studio.update(0,1000/30);
        for(const p of studio.people.values())if(!studio.nav.free(p.x,p.y,p.seated))
          collisions.push({frame,id:p.id,x:p.x,y:p.y});
        const people=[...studio.people.values()];
        for(let i=0;i<people.length;i++)for(let j=i+1;j<people.length;j++)
          if(Math.hypot(people[i].x-people[j].x,people[i].y-people[j].y)<10.9)
            collisions.push({frame,pair:[people[i].id,people[j].id]});
        if(frame%300===0)samples.push(studio.inspect());
      }
    }""")
    collisions = page.evaluate("collisions")
    assert not collisions, collisions[:5]
    samples = page.evaluate("samples")
    assert any(s["people"][1]["walking"] for s in samples), "Worker never takes a break"
    assert any(s["conversation"] for s in samples), "No face-to-face conversations"
    positions = {samples[0]["people"][i]["id"]:
                 sorted({(round(s["people"][i]["x"]), round(s["people"][i]["y"]))
                         for s in samples}) for i in range(3)}
    assert all(len(points) > 2 for points in positions.values()), positions
    print("PASS two activity cycles, three walking agents, furniture clearance and conversations",
          flush=True)

    page.locator("#zoom-in").click()
    assert page.evaluate("studio.physicalScale") >= 2
    page.locator("#fit").click()
    page.set_viewport_size({"width": 1280, "height": 800})
    page.wait_for_timeout(150)
    page.screenshot(path=str(HERE / "captures" / "compact.png"))
    assert page.evaluate("Number.isInteger(studio.physicalScale)")
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(150)
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    assert page.evaluate("Number.isInteger(studio.physicalScale)")
    page.screenshot(path=str(HERE / "captures" / "mobile.png"))
    print("PASS zoom, integer display pixels and small viewport", flush=True)

    reduced = browser.new_page(viewport={"width": 1440, "height": 1040},
                               device_scale_factor=2, reduced_motion="reduce")
    reduced.goto(URL)
    reduced.wait_for_function("studio?.ready")
    assert reduced.evaluate("studio.paused")
    assert reduced.evaluate("Number.isInteger(studio.physicalScale)")
    reduced.locator('#people-toggle').click()
    reduced.locator('[data-person="reviewer"]').focus()
    reduced.keyboard.press("Enter")
    assert reduced.evaluate("studio.selected") == "reviewer"
    print("PASS Retina scaling, reduced motion and keyboard character selection", flush=True)
    assert not errors, errors
    browser.close()
    print("PASS no browser errors")
