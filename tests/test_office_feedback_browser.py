from __future__ import annotations

import json
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


def test_deliberate_status_idle_poses_and_decision_indicator(service):
    _, base, project = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base + "/office/")
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        prepare_room(page, project, "", "The workshop")
        page.locator("#setup-brief").fill(
            "Refine office feedback\nKeep the room layout\nMake work easier to follow"
        )
        page.locator("#close-detail").click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.evaluate("""async () => {
          studio.game.loop.stop();
          window.tick=n=>{for(let i=0;i<n;i++)studio.update(0,1000/30);};
          window.check=(ok,message)=>{if(!ok)throw Error(message);};
          tick(120);
          const {bubbleLines}=await import('/office/art.js');
          const copy='Checking the three candidate layouts.\\n'+
            'Comparing spacing and interaction costs.';
          const lines=bubbleLines(copy);
          check(lines.length===3&&lines.every(s=>s.length<=38),'Poor multiline wrapping');
          const state={id:'feedback',version:1,status:'running',round:1,
            config:{task:studio.session.room.brief},participants:{Implementer:'working',Reviewer:'waiting'},
            transcript:[],progress:[],messages:[],local_activity:{},room_status:{Implementer:{
              id:1,source:'assistant.ui_status',text:copy}}};
          window.feedback=state;studio.session.apply(state);tick(1);
          const worker=studio.people.get('worker'),reviewer=studio.people.get('reviewer');
          check(worker.bubbleKind==='work'&&worker.bubble.height===25,
            'Incorrect two-line work bubble');
          const until=worker.bubbleUntil;tick(30);
          studio.session.apply({...state,version:2,local_activity:{Implementer:{
            id:2,kind:'command',category:'shell',phase:'started',
            text:'Running a shell command…'}}});
          tick(1);check(worker.bubbleUntil===until,'Shell call replaced deliberate status');
          const detailed='The office container is limiting the available width. '+
            'I am adjusting its spacing while preserving the layout and character animations. '+
            'Then I will check narrow screens.';
          studio.session.apply({...state,version:3,room_status:{Implementer:{
            id:3,source:'assistant.ui_status',text:detailed}}});
          tick(30);check(worker.bubbleText===copy,'Status replaced before minimum reading time');
          tick(65);check(worker.bubbleText===detailed,'New useful status waited for old expiry');
          check(worker.bubble.height>=41&&worker.bubble.height<=57,'Larger status was clipped');
          check(worker.bubbleUntil-studio.worldTime>9,'Long status had too little reading time');
          const longerUntil=worker.bubbleUntil;
          studio.session.apply({...state,version:4,room_status:{Implementer:{
            id:4,source:'assistant.ui_status',text:detailed}}});tick(1);
          check(worker.bubbleUntil===longerUntil,'Identical status restarted bubble');

          const texture=studio.textures.get('day:person-reviewer').getSourceImage();
          const head=frame=>{const c=document.createElement('canvas');c.width=32;c.height=17;
            c.getContext('2d').drawImage(texture,frame%4*32,Math.floor(frame/4)*36,
              32,17,0,0,32,17);return c.toDataURL();};
          check(head(16)!==head(18),'Idle head still faces monitor');
          reviewer.restSince=studio.elapsed-8;
          check(studio.seating.frame(reviewer,studio.elapsed)===19,'No occasional resting stretch');
          const hip=studio.seating.inspect(reviewer);
          check(hip.anchor.x===hip.actualHip.x&&hip.anchor.y===hip.actualHip.y,'Idle moved hips');
        }""")
        capture(page, "feedback-work-day")
        page.get_by_role("button", name="Night mode", exact=True).click()
        capture(page, "feedback-work-night")
        page.route(
            "**/api/runs/feedback/trace",
            lambda route: route.fulfill(
                content_type="application/x-ndjson",
                body=json.dumps(
                    {
                        "type": "assistant.tool_output",
                        "role": "Implementer",
                        "output": "Detailed test failure <script>safe text</script>",
                    }
                )
                + "\n",
            ),
        )
        page.route(
            "**/api/rooms",
            lambda route: route.fulfill(
                content_type="application/json",
                body=json.dumps([page.evaluate("({...studio.session.room,runs:['feedback']})")]),
            ),
        )
        page.route(
            "**/api/rooms/*/runs",
            lambda route: route.fulfill(
                content_type="application/json",
                body=json.dumps(
                    [
                        {
                            "id": "feedback",
                            "number": 1,
                            "status": "running",
                            "task": "Refine feedback",
                        }
                    ]
                ),
            ),
        )
        page.route(
            "**/api/runs/feedback",
            lambda route: route.fulfill(
                content_type="application/json",
                body=json.dumps(page.evaluate("feedback")),
            ),
        )
        page.evaluate("() => {studio.select('worker');}")
        page.locator("#person-task").click()
        page.get_by_role("button", name="View activity history →", exact=True).click()
        page.get_by_role("button", name="Run 1 · running", exact=True).click()
        page.get_by_text("Shell output", exact=True).click()
        expect(page.locator("#detail-body pre")).to_contain_text("<script>safe text</script>")
        assert page.locator("#detail-body script").count() == 0
        page.locator("#close-detail").click()
        page.evaluate("""() => {
          const s=studio;
          s.session.apply({...feedback,version:5,participants:{Implementer:'waiting',Reviewer:'waiting'},
            local_activity:{},room_status:{},
            pending:{id:'decision',spec:{kind:'select',rendered:{prefill:'Ship it'}}}});tick(1);
          check(s.attention.sprite.visible,'Missing decision ring');
          const first=s.attention.sprite.texture.key;tick(12);
          check(first!==s.attention.sprite.texture.key,'Decision arc does not travel');
          s.paused=true;tick(1);const still=s.attention.sprite.texture.key;tick(60);
          check(still===s.attention.sprite.texture.key&&s.attention.sprite.visible,
            'Reduced motion must keep a static indicator');s.paused=false;
          check(Number.isInteger(s.attention.sprite.x)&&Number.isInteger(s.attention.sprite.y),
            'Fractional ring');
        }""")
        capture(page, "feedback-decision-night")
        page.evaluate("""() => {
          const s=studio;s.session.connected=false;tick(1);
          check(!s.attention.sprite.visible,'Offline decision appears actionable');
          s.session.connected=true;s.session.apply({...feedback,version:6,pending:null});tick(1);
          check(!s.attention.sprite.visible,'Resolved decision still highlighted');
          s.session.apply({...feedback,version:7},{replay:true});
          check(!s.activity.pending.size,'Replayed status bubble');
        }""")
        assert not errors
        browser.close()


def test_confirm_closes_only_on_success_and_preserves_visible_reaction(service):
    _, base, project = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()
        page.goto(base + "/office/")
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        prepare_room(page, project, "", "The workshop")
        page.locator("#setup-brief").fill("Fix the rounding error")
        page.get_by_role("button", name="Run task", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        assert page.evaluate("studio.people.get('worker').bubbleText").startswith("Task received.")
        page.wait_for_function("() => !!studio.session.run.pending", timeout=20000)
        page.evaluate("() => {studio.session.decisions.open();}")
        page.get_by_text("Other choices", exact=True).click()
        page.route(
            "**/api/runs/*/answer",
            lambda route: route.fulfill(
                status=400, content_type="application/json", body='{"error":"Please try again."}'
            ),
        )
        page.get_by_role("button", name="Ship it", exact=True).click()
        expect(page.locator("#session-error")).to_have_text("Please try again.")
        expect(page.locator("#detail-dialog")).to_be_visible()
        page.unroute("**/api/runs/*/answer")
        page.get_by_role("button", name="Ship it", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.wait_for_function("() => studio.session.run.status==='completed'")
        assert page.evaluate("studio.people.get('reviewer').bubble?.visible")
        assert page.evaluate("studio.people.get('reviewer').bubbleText").startswith(
            "Approval received."
        )
        assert not page.evaluate("studio.attention.sprite.visible")
        browser.close()
