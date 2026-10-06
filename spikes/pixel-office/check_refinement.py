"""Verify palette changes and real seating, including every chair and exit path."""

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
    page.locator("#menu-toggle").click()
    page.locator("#pause").click()
    page.locator("#sit").click()
    page.wait_for_function("studio.people.get('human').seated && "
                           "!studio.people.get('human').transition", timeout=15000)
    assert page.locator("#sit").inner_text() == "Stand up"

    # Paused identical poses make the captures a direct color comparison.
    before = page.evaluate("studio.inspect()")
    for mood in ["day", "night", "day"]:
        page.locator(f'[data-mood-choice="{mood}"]').click()
        page.wait_for_timeout(150)
        after = page.evaluate("studio.inspect()")
        assert after["people"] == before["people"]
        assert after["time"] == before["time"]
        assert after["paused"]
        assert page.evaluate("document.documentElement.dataset.mood") == mood
        assert page.evaluate("studio.floorTiles.image.key") == f"{mood}:floor-tiles"
        wall = page.evaluate("""() => Array.from(studio.game.canvas.getContext('2d')
          .getImageData(40,35,1,1).data).slice(0,3)""")
        assert wall == ([238, 235, 228] if mood == "day" else [52, 61, 74]), wall
        if mood == "night":
            light = page.evaluate("""() => {
              const sofa=studio.themedImages.find(item=>item.key==='sofa').sprite;
              const c=sofa.texture.getSourceImage().getContext('2d');
              return {near:Array.from(c.getImageData(15,4,1,1).data),
                far:Array.from(c.getImageData(75,4,1,1).data),
                person:studio.people.get('planner').sprite.texture.key,
                sky:Array.from(studio.game.canvas.getContext('2d')
                  .getImageData(120,39,1,1).data)};
            }""")
            # Two points on the same coral upholstery have different local light.
            assert light["near"][0] > light["far"][0] + 10, light
            assert light["near"][2] < light["far"][2], light
            assert light["person"].startswith("night:lit-person:planner:"), light
            assert light["sky"][:3] == [49, 76, 104], light
        page.screenshot(path=str(HERE / "captures" / f"{mood}.png"), full_page=True)
        page.locator("#game canvas").screenshot(path=str(HERE / "captures" / f"{mood}-room.png"))
    print("PASS day/night colors, local material/character lighting, dark windows and seating",
          flush=True)

    # A floor click must first stand up, then follow the requested path.
    click_world(page, 320, 281)
    page.wait_for_function("!studio.people.get('human').seated && "
                           "!studio.people.get('human').route.length", timeout=15000)
    assert abs(page.evaluate("studio.people.get('human').x") - 320) < 3

    # Keep scheduling out of these seat-specific checks. Normal activity is
    # exercised separately for two complete cycles by check.py.
    page.evaluate("""() => {
      studio.game.loop.stop(); studio.paused=false; studio.activity.update=()=>{};
      window.seatCollisions=[];
      window.advance=()=>{
        studio.update(0,1000/30);
        const people=[...studio.people.values()];
        for(const p of people)if(!studio.nav.free(p.x,p.y,p.seated))
          seatCollisions.push({id:p.id,x:p.x,y:p.y,seat:p.seated});
        for(let i=0;i<people.length;i++)for(let j=i+1;j<people.length;j++)
          if(Math.hypot(people[i].x-people[j].x,people[i].y-people[j].y)<10.9)
            seatCollisions.push({pair:[people[i].id,people[j].id]});
      };
      window.settle=id=>{
        const p=studio.people.get(id);
        for(let i=0;i<1800&&(p.route.length||p.transition);i++)advance();
        if(p.route.length||p.transition)throw Error('Stuck: '+id);
      };
    }""")
    # Every participant uses the same anchor contract, not hand-tuned offsets.
    for person in ["planner", "worker", "reviewer", "human"]:
        assert page.evaluate("id=>studio.requestSit(id,studio.people.get(id).chairId)", person)
        page.evaluate("settle", person)
        seat = page.evaluate("id=>studio.seating.inspect(studio.people.get(id))", person)
        assert seat["posture"] == "seated"
        assert seat["anchor"] == seat["actualHip"], seat
        assert seat["depth"] == seat["feet"]["y"], seat
        assert page.evaluate("""id=>{
          const p=studio.people.get(id),c=studio.seating.chairs.get(p.seated);
          return c.back.depth<p.sprite.depth&&c.front.depth>p.sprite.depth;
        }""", person)
    assert not page.evaluate("studio.requestSit('human','chair-1')"), "Occupied chair accepted"

    # Capture everyone actually seated, preserving the normal Phaser rendering.
    page.evaluate("studio.paused=true;studio.updatePauseUI();studio.game.loop.wake()")
    page.wait_for_timeout(100)
    page.locator("#game canvas").screenshot(path=str(HERE / "captures" / "seated-day.png"))
    page.locator('[data-mood-choice="night"]').click()
    page.wait_for_timeout(100)
    page.locator("#game canvas").screenshot(path=str(HERE / "captures" / "seated-night.png"))
    page.evaluate("studio.game.loop.stop();studio.paused=false")

    # Vacate the three AI chairs, then have the human physically use every chair.
    page.evaluate("""() => {
      studio.moveTo('planner',{x:320,y:110});settle('planner');
      studio.moveTo('worker',{x:320,y:160});settle('worker');
      studio.moveTo('reviewer',{x:320,y:230});settle('reviewer');
    }""")
    for chair in ["chair-0", "chair-1", "chair-2", "chair-3", "lounge-chair"]:
        assert page.evaluate("chair=>studio.requestSit('human',chair)", chair)
        page.evaluate("settle('human')")
        seat = page.evaluate("studio.seating.inspect(studio.people.get('human'))")
        assert seat["chair"] == chair, seat
        assert seat["anchor"] == seat["actualHip"], seat
        assert page.evaluate("""() => {
          const p=studio.people.get('human'),c=studio.seating.chairs.get(p.seated);
          return c.back.depth<p.sprite.depth&&c.front.depth>p.sprite.depth;
        }""")
    assert not page.evaluate("seatCollisions"), page.evaluate("seatCollisions.slice(0,8)")
    print("PASS five chairs: hip alignment, foot depth, layers, occupancy, sit/stand paths",
          flush=True)

    # Keyboard movement also exits the seat before returning to normal walking.
    page.evaluate("studio.game.loop.wake()")
    page.locator("#game").focus()
    page.keyboard.down("ArrowRight")
    page.wait_for_timeout(650)
    page.keyboard.up("ArrowRight")
    assert page.evaluate("studio.people.get('human').seated") is None
    assert not errors, errors
    print("PASS keyboard exit and no browser errors", flush=True)
    browser.close()
