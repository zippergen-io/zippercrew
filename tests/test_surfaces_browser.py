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


def test_every_persona_receives_partial_shadows_and_ambient_is_interruptible(service, tmp_path):
    _, base, _ = service
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 950})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(base)
        expect(page.locator("#room-art")).to_have_attribute("data-ready", "true")
        page.evaluate("""async () => {
            const {launchRoom}=await import('/room-engine.js');
            const host=document.createElement('div');
            host.style.cssText='position:fixed;inset:0;z-index:9000'; document.body.append(host);
            await new Promise(resolve=>launchRoom(host,{onReady(s){
                window.surfaceScene=s;
                window.surfaceView={states:{Implementer:'waiting',Reviewer:'waiting',Human:'waiting'},
                    bindings:{Implementer:{profile:'test'},Reviewer:{profile:'test'}},
                    task:'Inspect cleanup and run regression tests',activities:{}};
                s.setReducedMotion(true); s.present(surfaceView); resolve();
            }}));
        }""")
        for role in ("Implementer", "Reviewer", "Human"):
            # Walk the actual renderer, not just a mathematical mask. Inspect
            # alpha only where the character has opaque pixels, in all three poses.
            for name, x, y in [
                ("desk", 515, 805),
                ("counter", 620, 350),
                ("window", 950, 755),
                ("lit", 1390, 520),
            ]:
                page.evaluate(
                    """async ({role,x,y})=>{
                    const s=surfaceScene,p=s.people.get(role);
                    await new Promise(resolve=>s.walk(p,{x,y},resolve,true));
                }""",
                    {"role": role, "x": x, "y": y},
                )
                result = page.evaluate(
                    """({role})=>{
                    const s=surfaceScene,p=s.people.get(role),result=[];
                    for(const frame of ['idle','walk-a','work']) {
                        p.sprite.setFrame(frame).setFlipX(false); s.lighting.update(p);
                        const f=p.sprite.frame, c=document.createElement('canvas');
                        c.width=f.width;c.height=f.height;
                        const ctx=c.getContext('2d');
                        ctx.drawImage(p.sprite.texture.getSourceImage(),f.cutX,f.cutY,f.width,f.height,0,0,f.width,f.height);
                        const source=ctx.getImageData(0,0,f.width,f.height).data;
                        const mask=p.lightTexture.context.getImageData(0,0,f.width,f.height).data;
                        let dark=0,lit=0;
                        for(let i=3;i<source.length;i+=4) if(source[i]>220) {
                            if(mask[i]>22) dark++; else if(mask[i]<5) lit++;
                        }
                        result.push({dark,lit});
                    }
                    return {samples:result,depth:p.sprite.depth,
                        contact:p.shadow.x===p.sprite.x && p.shadow.visible,
                        cast:p.castShadow.visible,state:p.state};
                }""",
                    {"role": role},
                )
                assert result["contact"] and result["cast"]
                assert result["state"] == "waiting"
                for sample in result["samples"]:
                    assert sample["lit"] > 100
                    if name == "lit":
                        assert sample["dark"] == 0
                    else:
                        assert sample["dark"] > 100
                if name == "counter":
                    assert result["depth"] < 365  # Counter front is above the sprite.
                page.screenshot(path=str(tmp_path / f"{role}-{name}.png"))
            page.evaluate(
                """role=>{
                const s=surfaceScene,p=s.people.get(role);
                s.setReducedMotion(false); p.tween?.stop();
                s.ambient.step(role,'waiting',s.time.now);
                Object.assign(s.ambient.people.get(role),{action:'coffee',until:s.time.now+10000});
                s.ambientPose(p,'coffee');
            }""",
                role,
            )
            page.wait_for_function(
                "(role)=>surfaceScene.people.get(role).ambientTween?.isPlaying()", arg=role
            )
            page.evaluate(
                """role=>{
                surfaceView.states[role]=role==='Human'?'needs human':
                    role==='Reviewer'?'reviewing':'working';
                surfaceScene.present(surfaceView);
            }""",
                role,
            )
            assert (
                page.evaluate("(role)=>surfaceScene.people.get(role).ambientAction", role) is None
            )
            page.evaluate("""()=>{ surfaceScene.setReducedMotion(true); }""")
        assert not errors
        browser.close()
