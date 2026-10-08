from __future__ import annotations

import os
from pathlib import Path

import pytest
from office_helpers import prepare_room
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


def test_task_board_and_real_message_couriers(service):
    app, base, project = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1600, "height": 1080})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base + "/office/")
        page.wait_for_function("() => window.studio?.session?.initialized && !studio.session.busy")
        prepare_room(page, project, "", "The workshop")
        brief = (
            "Prepare small release\n"
            "- Tighten workspace layout\n"
            "- Improve character identity and preserve the existing calm palette\n"
            "- Keep this full final line in the overlay: café <script>not HTML</script>"
        )
        page.locator("#setup-brief").fill(brief)
        page.get_by_role("button", name="Run task", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.evaluate("() => {studio.session.showTask();}")
        expect(page.get_by_role("button", name="Stop run", exact=True)).to_be_visible()
        page.locator("#back-to-office").click()
        page.wait_for_function("() => studio.handoffs.active?.sender === 'worker'")
        # The courier is carrying an actual backend proposal, not a scripted timer.
        actual = page.evaluate("studio.session.run")
        assert any(
            m["from"] == "Implementer" and m["to"] == "Reviewer" and m["send_id"]
            for m in actual["messages"]
        )
        page.evaluate(
            """() => {studio.game.loop.stop();
                window.tick=n=>{for(let i=0;i<n;i++)studio.update(0,1000/30);};}"""
        )
        board = page.evaluate("studio.board.inspect()")
        assert board["title"] == "PREPARE SMALL RELEASE"
        assert len(board["lines"]) == 2
        assert all(len(line) <= 31 for line in board["lines"])
        page.evaluate("() => tick(60)")
        capture(page, "office-carrying-day")
        page.wait_for_function("() => !!studio.session.run.pending", timeout=20000)
        assert page.evaluate("studio.board.inspect().status") == "R1 - YOUR DECISION"
        result = page.evaluate("""() => {
          const assert=(ok,text)=>{if(!ok)throw Error(text);};
          const before=studio.handoffs.queue.length;
          studio.session.apply(studio.session.run);
          assert(studio.handoffs.queue.length===before,'Duplicate snapshot replayed messages');
          let steps=0;
          while(studio.handoffs.active?.phase!=='received'&&steps++<700){
            tick(1);
            for(const person of studio.people.values()) {
              assert(studio.nav.free(person.x,person.y,person.seated),'Walk through furniture');
              assert(Number.isInteger(person.sprite.x)&&Number.isInteger(person.sprite.y),
                'Subpixel sprite');
            }
          }
          const h=studio.handoffs,trip=h.active;
          assert(trip?.phase==='received'&&trip.acknowledged&&trip.noteOwner===trip.recipient,
            'No received handoff');
          assert(Math.hypot(studio.people.get(trip.sender).x-studio.people.get(trip.recipient).x,
            studio.people.get(trip.sender).y-studio.people.get(trip.recipient).y)<49,
            'Remote acknowledgment');
          assert(studio.people.get(trip.recipient).bubbleText==='PROPOSAL RECEIVED.',
            'Missing reaction');
          assert(h.note.visible,'Missing carried document');
          assert([h.note,h.caption,studio.board.sprite].every(s=>
            Number.isInteger(s.x)&&Number.isInteger(s.y)&&s.frame.source.scaleMode===1),
            'Smoothed or fractional props');
          tick(40);
          assert(h.active?.noteOwner===trip.recipient&&h.note.visible,'Recipient dropped note');
          const receiver=studio.people.get(trip.recipient),sender=studio.people.get(trip.sender);
          assert(Math.abs(h.note.y-(Math.round(receiver.y)-24))<=1,'Note did not follow recipient');
          assert(sender.route.length||sender.transition||sender.seated,
            'Empty-handed sender did not return to work');
          return h.inspect();
        }""")
        assert result["active"]["from"] == "worker"
        capture(page, "office-handoff-day")
        page.get_by_role("button", name="Night mode", exact=True).click()
        page.evaluate("() => tick(1)")
        capture(page, "office-handoff-night")
        # Every queued agent envelope gets its own calm exchange and returns home.
        deliveries = page.evaluate("""() => {
          tick(1800);
          if(studio.handoffs.active||studio.handoffs.queue.length)
            throw Error('Unfinished exchange');
          for(const id of ['worker','reviewer']) {
            const p=studio.people.get(id);
            if(p.seated!==p.chairId||p.transition)throw Error('Did not return to chair: '+id);
          }
          return studio.handoffs.completed;
        }""")
        assert {(d["from"], d["to"]) for d in deliveries} == {
            ("worker", "reviewer"),
            ("worker", "human"),
            ("reviewer", "human"),
        }
        # A board click opens the full safe-text overlay and never moves the user.
        before = page.evaluate("({x:studio.people.get('human').x,y:studio.people.get('human').y})")
        bounds = page.locator("#game canvas").bounding_box()
        page.mouse.click(
            bounds["x"] + (245 - 24) * bounds["width"] / 512,
            bounds["y"] + (39 - 16) * bounds["height"] / 320,
        )
        expect(page.locator(".task-brief")).to_have_text(brief)
        assert page.locator(".task-brief script").count() == 0
        assert before == page.evaluate(
            "({x:studio.people.get('human').x,y:studio.people.get('human').y})"
        )
        page.locator("#back-to-office").click()
        # Reconnect/history snapshots seed the seen set; old handoffs stay quiet.
        page.evaluate("""() => {
          studio.session.apply(studio.session.run,{replay:true});
          studio.session.apply(studio.session.run);tick(120);
          if(studio.handoffs.active||studio.handoffs.queue.length)throw Error('Replayed history');
        }""")
        assert app.runs.get(actual["id"]).snapshot()["pending"]
        assert not errors
        browser.close()


def test_receipts_cancellation_and_reduced_motion(service):
    _, base, _ = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()
        page.goto(base + "/office/")
        page.wait_for_function("() => window.studio?.ready && !studio.session.busy")
        result = page.evaluate("""() => {
          document.getElementById('detail-dialog').close();studio.game.loop.stop();
          const h=studio.handoffs,assert=(ok,text)=>{if(!ok)throw Error(text);};
          const tick=n=>{for(let i=0;i<n;i++)studio.update(0,1000/30);};
          const envelope={id:'receipt-test',from:'Implementer',to:'Reviewer',send_id:1,
            receive_id:null,label:'Proposal',control:false,round:1};
          const state={id:'test',status:'running',participants:{},messages:[envelope]};
          h.observe(state);
          for(let i=0;i<700&&h.active?.phase!=='offered';i++)tick(1);
          assert(h.active?.phase==='offered','Sender did not arrive');
          assert(!h.active.acknowledged&&!h.completed.length,'Animation invented a receipt');
          h.observe({...state,messages:[{...envelope,receive_id:2}]});tick(1);
          assert(h.active.acknowledged,'Real receipt not acknowledged');
          h.observe({...state,status:'stopped'});tick(500);
          assert(!h.active&&!h.note.visible&&!h.queue.length,'Stop left a courier running');
          assert(studio.people.get('worker').seated==='chair-1','Stop stranded sender');
          h.reset();studio.paused=true;
          const positions=[...studio.people.values()].map(p=>[p.x,p.y]);
          h.observe({...state,messages:[{...envelope,receive_id:2}]});tick(90);
          assert(studio.people.get('reviewer').bubbleText==='PROPOSAL RECEIVED.',
            'Reduced-motion acknowledgment missing');
          assert(JSON.stringify(positions)===JSON.stringify([...studio.people.values()].map(p=>[p.x,p.y])),
            'Reduced motion moved a person');
          tick(180);
          assert(!studio.people.get('reviewer').bubble,'Reduced-motion bubble never expired');
          h.reset();h.observe({...state,messages:[{...envelope,id:'old-room',receive_id:2}]});tick(10);
          h.reset();tick(120);
          assert(!studio.people.get('reviewer').bubble,'Old room reacted after switching');
          // A moving user remains in control; the courier follows a new approach
          // point and must reach them before acknowledging the exchange.
          studio.paused=false;h.reset();
          const moving={...envelope,id:'moving',to:'Human',receive_id:3};
          h.observe({...state,id:'moving-run',messages:[moving]});tick(20);
          assert(studio.moveTo('human',{x:320,y:128}),'Could not move user');
          for(let i=0;i<850&&!h.completed.length;i++){
            tick(1);
            const people=[...studio.people.values()];
            for(let a=0;a<people.length;a++)for(let b=a+1;b<people.length;b++)
              assert(Math.hypot(people[a].x-people[b].x,people[a].y-people[b].y)>=10.9,
                'People collided during a moving delivery');
          }
          assert(h.completed.some(m=>m.to==='human'),'Moving user never received note');
          assert(Math.abs(studio.people.get('human').y-128)<4,'Courier commandeered user');
          h.reset();tick(600);
          // A canceled stand cannot later fire the previous arrival callback.
          h.observe({...state,id:'stop-on-departure',messages:[envelope]});tick(1);
          h.observe({...state,id:'stop-on-departure',status:'stopped'});tick(600);
          assert(!h.active&&!h.note.visible,'Canceled departure restarted');
          assert(studio.people.get('worker').seated==='chair-1','Canceled stand stranded sender');
          return h.inspect();
        }""")
        assert not result["active"] and not result["queued"]
        browser.close()
