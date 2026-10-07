from __future__ import annotations

import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

pytestmark = pytest.mark.browser


def capture(page, name):
    if directory := os.environ.get("ZIPPERCREW_OFFICE_CAPTURES"):
        target = Path(directory)
        target.mkdir(parents=True, exist_ok=True)
        page.evaluate("() => {studio.game.loop.wake();}")
        page.wait_for_timeout(100)
        page.evaluate("() => {studio.game.loop.stop();}")
        page.screenshot(path=str(target / f"{name}.png"))


def test_office_tool_feedback_ambient_priority_and_clock(service):
    _, base, project = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base + "/office/")
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        page.locator("#setup-name").fill("The workshop")
        page.locator("#setup-workspace").fill(str(project))
        page.locator("#setup-brief").fill(
            "Refine the workspace\nMake activity legible\nKeep the office calm"
        )
        page.get_by_role("button", name="Save room", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.evaluate("""() => {
          studio.game.loop.stop();
          window.tick=n=>{for(let i=0;i<n;i++)studio.update(0,1000/30);};
          tick(120);
          window.check=(ok,message)=>{if(!ok)throw Error(message);};
          const run={id:'public-events',version:1,status:'running',round:1,
            config:{task:studio.session.room.brief},participants:{Implementer:'working',Reviewer:'waiting',Human:'waiting'},
            transcript:[],progress:[],local_activity:{},messages:[]};
          window.progress=(id,phase='started',detail=null)=>{
            const event={id,role:'Implementer',round:1,source:'assistant.progress',category:'tests',
              phase,text:phase==='started'?'Running tests…':'Test command succeeded.',detail};
            run.version=id;run.progress.push(event);run.local_activity.Implementer=event;
            studio.session.apply(structuredClone(run));
          };
          window.runState=run;progress(2);tick(2);
          check(studio.people.get('worker').bubbleKind==='work','No work bubble');
          check(studio.people.get('reviewer').sprite.frame.name===18,'Idle agent is typing');
          const frames=new Set();const screen=studio.surfaces.screens.find(s=>s.owner==='worker');
          const images=new Set();
          for(let i=0;i<24;i++){tick(1);
            frames.add(studio.people.get('worker').sprite.frame.name);
            images.add(screen.source.toDataURL());}
          check(frames.size===2,'No typing animation');check(images.size>1,'Frozen active monitor');
          const reviewer=studio.surfaces.screens.find(s=>s.owner==='reviewer');
          const idle=reviewer.source.toDataURL();tick(50);
          check(idle===reviewer.source.toDataURL(),'Idle monitor pretends to work');
          const head=(frame)=>{const c=document.createElement('canvas');c.width=32;c.height=17;
            c.getContext('2d').drawImage(
              studio.textures.get('day:person-worker').getSourceImage(),
              frame%4*32,Math.floor(frame/4)*36,32,17,0,0,32,17);return c.toDataURL();};
          check(head(16)===head(17),'Typing changes head alignment');
          progress(3,'completed','12 passed');tick(250);
          check(studio.people.get('worker').bubbleKind==='work','Result bubble missing');
          studio.select('worker');
        }""")
        expect(page.locator("#person-activity")).to_contain_text("12 passed")
        expect(page.locator("#person-recent")).to_contain_text("Running tests")
        capture(page, "office-activity-card")
        page.locator("#person-task").click()
        expect(page.locator(".run-progress")).to_contain_text("12 passed")
        page.locator("#back-to-office").click()
        capture(page, "office-activity-day")
        page.get_by_role("button", name="Night mode", exact=True).click()
        capture(page, "office-activity-night")
        page.evaluate("""() => {
          const s=studio;
          // Receipt-free progress never invents a message handoff.
          check(!s.handoffs.active&&!s.handoffs.queue.length,'Progress invented courier');
          const before=s.people.get('worker').bubbleUntil;
          s.session.apply(s.session.run);tick(1);
          check(s.people.get('worker').bubbleUntil===before,'Snapshot repeated speech');
          s.session.connected=false;tick(10);
          check(!s.activity.isWorking(s.people.get('worker')),'Disconnected agent still typing');
          s.session.connected=true;
          s.session.apply(s.session.run,{replay:true});
          check(!s.activity.pending.size,'Replayed tool progress');
          s.surfaces.update(new Date(2026,9,7,15,42));
          check(s.surfaces.clockTime.hours===15&&s.surfaces.clockTime.minutes===42,
            'Clock ignores wall time');
          const clock=s.surfaces.clock.source.toDataURL();s.paused=true;
          s.surfaces.update(new Date(2026,9,7,15,43));
          check(clock!==s.surfaces.clock.source.toDataURL(),'Paused clock frozen');s.paused=false;
          s.session.apply({...s.session.run,version:4,status:'completed',participants:{Implementer:'completed',Reviewer:'completed'},local_activity:{}});
          s.ambient.next=s.elapsed;s.ambient.turn=0;tick(1);
          check(s.ambient.trip?.ids.length===2,'No idle conversation');
          const start=s.elapsed;
          for(let i=0;i<500&&s.ambient.trip?.phase!=='rest';i++){
            tick(1);
            for(const p of s.people.values())check(s.nav.free(p.x,p.y,p.seated),
            'Ambient walk crossed furniture');
          }
          check(s.ambient.trip?.phase==='rest','Agents never reached coffee');
          check(s.elapsed-start<8,'Coffee walk still too slow');
          check(s.people.get('worker').bubbleKind==='conversation','Thought bubbles not distinct');
        }""")
        capture(page, "office-coffee-night")
        page.get_by_role("button", name="Day mode", exact=True).click()
        capture(page, "office-coffee-day")
        page.evaluate("""() => {
          const s=studio;tick(115);
          check(s.people.get('reviewer').bubbleText==='JUST A MINUTE.','No coffee reply');
          // Starting real work interrupts the break and safely restores seating.
          runState.version=5;runState.local_activity={};s.session.apply(structuredClone(runState));
          check(!s.ambient.trip,'Real work did not interrupt break');tick(320);
          check(s.people.get('worker').seated==='chair-1','Worker did not return');
          // An idle reviewer can still take a solo break while Worker works.
          s.ambient.next=s.elapsed;tick(1);
          check(s.ambient.trip?.ids.join()==='reviewer','Busy agent took a break');
          s.paused=true;tick(1);check(!s.ambient.trip,'Pause left ambient conversation');
          const positions=JSON.stringify([...s.people.values()].map(p=>[p.x,p.y]));tick(120);
          check(positions===JSON.stringify([...s.people.values()].map(p=>[p.x,p.y])),
            'Paused avatars moved');
          s.paused=false;tick(350);
          for(const p of s.people.values())check(
            Number.isInteger(p.sprite.x)&&Number.isInteger(p.sprite.y),
            'Fractional sprite');
          s.session.apply({...s.session.run,version:6,status:'stopped',participants:{Implementer:'stopped',Reviewer:'stopped'},local_activity:{}});
          tick(1500);check(!s.ambient.trip&&!s.activity.pending.size,'Stop left activity running');
        }""")
        assert not errors
        browser.close()


def test_office_framing_and_pixel_grid(service):
    _, base, _ = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        for width, height, dpr in [
            (1440, 900, 1),
            (1600, 1080, 1.25),
            (1440, 1000, 2),
            (390, 844, 2),
        ]:
            context = browser.new_context(
                viewport={"width": width, "height": height}, device_scale_factor=dpr
            )
            page = context.new_page()
            page.goto(base + "/office/")
            page.wait_for_function("() => window.studio?.ready")
            result = page.evaluate("""() => {
              const s=studio,r=s.game.canvas.getBoundingClientRect();
              return {width:r.width,height:r.height,scale:r.width/512*devicePixelRatio,
                smoothing:s.game.canvas.getContext('2d').imageSmoothingEnabled,
                scrollX:s.cameras.main.scrollX,scrollY:s.cameras.main.scrollY};
            }""")
            assert abs(result["scale"] - round(result["scale"])) < 0.001
            assert not result["smoothing"]
            assert (result["scrollX"], result["scrollY"]) == (24, 16)
            if width > 1000:
                assert result["width"] >= width * 0.85
                assert result["height"] >= height * 0.85
                assert result["width"] <= width * 1.08
                assert result["height"] <= height * 1.08
            context.close()
        browser.close()
