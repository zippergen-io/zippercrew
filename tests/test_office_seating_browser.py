from __future__ import annotations

import pytest
from playwright.sync_api import sync_playwright

pytestmark = pytest.mark.browser


def test_desk_chairs_require_side_entry_and_exit(service):
    _, base, _ = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base + "/office/")
        page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
        page.evaluate("""() => {
          const s=studio;s.game.loop.stop();
          window.check=(ok,message)=>{if(!ok)throw Error(message);};
          window.tick=()=>s.update(0,1000/30);
          // Keep this an isolated movement exercise, with no backend task.
          for(const p of s.people.values()){
            if(p.seated)s.seating.chairs.get(p.seated).occupant=null;
            p.seated=null;p.transition=null;p.route=[];p.onArrival=null;
          }
          const worker=s.people.get('worker'),reviewer=s.people.get('reviewer');
          worker.x=328;worker.y=112;reviewer.x=328;reviewer.y=200;
          const human=s.people.get('human');
          for(const id of ['chair-0','chair-1','chair-2','chair-3']){
            const chair=s.seating.chairs.get(id),feet=s.seating.points(chair).feet;
            human.x=feet.x;human.y=feet.y+28;human.goal=null;
            check(s.nav.free(human.x,human.y),'Invalid initial position');
            check(!s.seating.sit(human,chair),'Allowed sitting through the backrest');
            check(s.requestSit('human',id),'Could not request chair');
            check(!s.requestSit('worker',id),'Chair reservation was ignored');
            let entered=false,stepped=false,frames=0;
            for(;frames<300;frames++){
              tick();
              check(s.nav.free(human.x,human.y,human.seated),'Crossed furniture entering chair');
              check(Number.isInteger(human.sprite.x)&&Number.isInteger(human.sprite.y),
                'Fractional seating sprite');
              if(human.transition){
                const t=human.transition;
                check(t.kind==='sit','Unexpected departure');
                check(Math.abs(t.from.x-feet.x)>=20&&Math.abs(t.from.y-feet.y)<=3,
                  'Approached seat from behind');
                entered=true;
                if(human.sprite.frame.name>=4&&human.sprite.frame.name<12)stepped=true;
              }
              if(human.seated&&!human.transition)break;
            }
            check(entered&&stepped&&frames<300,'Never stepped sideways into seat');
            const hip=s.seating.inspect(human);
            check(hip.anchor.x===hip.actualHip.x&&hip.anchor.y===hip.actualHip.y,
              'Changed final seated alignment');
            check(chair.back.depth<human.sprite.depth&&chair.front.depth>human.sprite.depth,
              'Lost chair foreground layering');
            const destination={x:feet.x,y:feet.y+28};
            check(s.moveTo('human',destination),'Could not leave chair');
            const t=human.transition;
            check(t.kind==='stand'&&Math.abs(t.to.x-feet.x)>=20&&t.to.y===feet.y,
              'Exit crossed the backrest');
            check(chair.occupant==='human','Released chair while still stepping out');
            for(frames=0;frames<300&&(human.transition||human.route.length);frames++){
              tick();check(s.nav.free(human.x,human.y,human.seated),'Exit crossed furniture');
            }
            check(frames<300&&!human.seated&&!chair.occupant,'Got stuck leaving chair');
          }
          // An occupied entry selects the other side instead of cutting through
          // the backrest or through the person standing next to the chair.
          const chair=s.seating.chairs.get('chair-1'),points=s.seating.points(chair);
          const [left,right]=points.approaches;
          worker.x=left.x;worker.y=left.y;
          human.x=left.x;human.y=left.y+32;
          check(s.requestSit('human',chair.id),'Blocked side prevented using free side');
          check(human.goal.x===right.x,'Selected occupied entry');
          for(let i=0;i<300&&(human.route.length||human.transition);i++){
            tick();check(Math.hypot(human.x-worker.x,human.y-worker.y)>=11,
              'Walked through the person blocking entry');
          }
          check(human.seated===chair.id&&!human.transition,'Did not sit from clear side');
          human.goal=left;s.seating.stand(human);
          check(human.transition.to.x===right.x,'Exit ignored person blocking left side');
          for(let i=0;i<30;i++)tick();
          check(!human.seated&&!human.transition,'Blocked exit never completed');
        }""")
        assert not errors
        browser.close()
