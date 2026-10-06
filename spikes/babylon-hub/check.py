"""Browser verification and unmodified screenshots of the actual Babylon spike."""

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
URL = "http://127.0.0.1:8773/spikes/babylon-hub/"

if __name__ == "__main__":
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL)
        page.wait_for_function("window.hub?.ready")
        page.evaluate("hub.schedule.manual=true")
        page.wait_for_timeout(1600)
        geometry = page.evaluate("""() => {
          const mesh=hub.scene.getMeshByName('grounded reviewer mantle');
          const pos=mesh.getVerticesData('position'),normal=mesh.getVerticesData('normal');
          const i=10*33*3;
          return {position:pos.slice(i,i+3),normal:normal.slice(i,i+3),state:hub.inspect()};
        }""")
        assert geometry["normal"][0] > 0, "Custom mesh faces must point outwards"
        assert geometry["state"]["triangles"] < 60000
        assert page.evaluate("hub.camera.mode===BABYLON.Camera.PERSPECTIVE_CAMERA")
        assert page.evaluate("hub.shadows.getShadowMap().renderList.length > 100")
        assert page.evaluate("""[...hub.people.values()].every(p=>p.root.getChildMeshes()
            .filter(m=>m.name!=='small test object').every(m=>m.receiveShadows))""")
        page.screenshot(path=str(HERE / "captures" / "normal-view.png"))
        if "--capture-only" in sys.argv:
            print(json.dumps(geometry["state"], indent=2))
            browser.close()
            sys.exit(0)
        before = page.evaluate("hub.inspect().participants")
        page.wait_for_timeout(1400)
        after = page.evaluate("hub.inspect().participants")
        for a, b in zip(before, after, strict=True):
            assert a["hands"] != b["hands"] or a["head"] != b["head"], a["id"]
        print("PASS geometry, shared shadows, camera and living poses", flush=True)

        # A rendering arrival must never invent a runtime receive.
        page.click("#send")
        page.wait_for_function("hub.inspect().time > 5")
        page.screenshot(path=str(HERE / "captures" / "handoff.png"))
        page.wait_for_function("hub.inspect().packet?.delivered", timeout=20000)
        assert page.evaluate("[...hub.protocol.messages.values()][0].receiveSeq") is None
        assert page.evaluate("hub.people.get('reviewer').phase") != "reviewing"
        page.screenshot(path=str(HERE / "captures" / "awaiting-receive.png"))

        # Observe actual movement footprints on every rendered frame.
        page.evaluate("""() => {
          window.collisions=[];
          window.checkSeparation=()=>{
            for(const p of hub.people.values()) {
              const pos=p.root.position;
              for(const o of hub.world.obstacles)if(
                Math.abs(pos.x-o.x)<o.w/2+p.radius-.055 &&
                Math.abs(pos.z-o.z)<o.d/2+p.radius-.055)
                collisions.push({id:p.id,obstacle:o,position:pos.asArray()});
            }
            const cast=[...hub.people.values()];
            for(let i=0;i<cast.length;i++)for(let j=i+1;j<cast.length;j++) {
              const a=cast[i],b=cast[j];
              if(BABYLON.Vector3.Distance(a.root.position,b.root.position)<a.radius+b.radius-.05)collisions.push({pair:[a.id,b.id]});
            }
          };
          hub.scene.onBeforeRenderObservable.add(checkSeparation);
          window.finishWalk=id=>{
            const p=hub.people.get(id);
            for(let i=0;i<2400&&p.route.length;i++){hub.step(1/30);checkSeparation();}
            if(p.route.length)throw Error(JSON.stringify({id,
              position:p.root.position.asArray(),route:p.route.map(v=>v.asArray()),
              blocked:p.blockedFor,others:hub.inspect().participants}));
          };
        }""")
        assert page.evaluate("hub.takeBreak('reviewer','coffee')")
        page.wait_for_function("hub.people.get('reviewer').route.length > 0")
        start = page.evaluate("hub.people.get('reviewer').root.position.asArray()")
        page.wait_for_timeout(700)
        assert start != page.evaluate("hub.people.get('reviewer').root.position.asArray()")
        page.click("#receive")
        assert page.evaluate("hub.people.get('reviewer').ambient") is None
        assert page.evaluate("hub.people.get('reviewer').phase") == "reviewing"
        page.evaluate("finishWalk('reviewer')")
        print("PASS send / visual arrival / authoritative receive, ambient preemption", flush=True)

        for role, action in [
            ("human", "window"),
            ("implementer", "inspect"),
            ("reviewer", "coffee"),
        ]:
            page.click("#work")
            page.evaluate("[...hub.people.keys()].forEach(finishWalk)")
            assert page.evaluate("([id,action])=>hub.takeBreak(id,action)", [role, action]), role
            try:
                page.evaluate("finishWalk", role)
            except Exception:
                print("ROUTE FAILURE", page.evaluate("hub.inspect()"), flush=True)
                print(
                    page.evaluate(
                        "id=>({route:hub.people.get(id).route.map(p=>p.asArray()),blocked:hub.people.get(id).blockedFor})",
                        role,
                    ),
                    flush=True,
                )
                raise
            actual = page.evaluate("id=>hub.people.get(id).root.position.asArray()", role)
            target = page.evaluate("id=>hub.world.stations[id].working.asArray()", action)
            assert actual == target, (role, actual, target)
            page.screenshot(path=str(HERE / "captures" / f"{role}-break.png"))
            page.click("#work")
            page.evaluate("finishWalk", role)
            print(f"PASS {role} walk, {action} interaction, and return", flush=True)
        assert page.evaluate("window.collisions") == [], page.evaluate(
            "window.collisions.slice(0,3)"
        )

        page.click("#attention")
        assert page.locator("#decision").is_visible()
        page.wait_for_timeout(800)
        page.screenshot(path=str(HERE / "captures" / "human-attention.png"))
        page.click('[data-decision="Another round"]')
        assert not page.locator("#decision").is_visible()
        page.click("#pause")
        before = page.evaluate("hub.inspect().participants")
        page.wait_for_timeout(700)
        assert page.evaluate("hub.inspect().participants") == before
        # A receive before visual arrival is also valid and cannot be undone by travel.
        page.click("#send")
        page.click("#receive")
        assert page.evaluate("[...hub.protocol.messages.values()].at(-1).receiveSeq") is not None
        assert page.evaluate("hub.people.get('reviewer').phase") == "reviewing"
        page.click("#pause")
        page.wait_for_timeout(1400)
        page.set_viewport_size({"width": 1100, "height": 800})
        page.wait_for_timeout(600)
        page.screenshot(path=str(HERE / "captures" / "compact-view.png"))
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert not errors, errors
        print(
            "PASS no route collisions, Human decisions, pause, early receive, compact viewport",
            flush=True,
        )
        summary = page.evaluate("hub.inspect()")
        print(
            json.dumps(
                {
                    "triangles": summary["triangles"],
                    "meshes": summary["meshes"],
                    "errors": errors,
                    "checks": "passed",
                },
                indent=2,
            )
        )

        reduced = browser.new_page(viewport={"width": 1280, "height": 900}, reduced_motion="reduce")
        reduced.goto(URL)
        reduced.wait_for_function("window.hub?.ready")
        assert reduced.evaluate("hub.inspect().paused")
        assert reduced.evaluate("hub.people.get('human').handTargets[0].y") > 0.5
        reduced.close()
        assert not errors, errors
        browser.close()
