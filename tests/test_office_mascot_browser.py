from __future__ import annotations

import base64
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright
from test_office_activity_browser import capture

pytestmark = pytest.mark.browser


def test_companion_yields_to_workspace_and_rests_between_short_walks(service):
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
        page.locator("#setup-brief").fill("Refine the office companion\nKeep the workspace calm")
        page.get_by_role("button", name="Save room", exact=True).click()
        expect(page.locator("#detail-dialog")).not_to_be_visible()
        page.evaluate("""() => {
          studio.game.loop.stop();
          window.tick=n=>{for(let i=0;i<n;i++)studio.update(0,1000/30);};
          window.check=(ok,message)=>{if(!ok)throw Error(message);};
          const s=studio,m=s.mascot;
          s.ambient.next=Infinity;tick(150);
          check(s.people.size===3&&!m.sprite.input,'Mascot changed the roster or hit tests');
          check(!m.route.length&&m.x===448,'Mascot did not start resting');
          tick(750);
          check(m.route.length>0,'Companion never starts its quiet walk');
          const stopped=[m.x,m.y];
          s.say('worker','Checking the office companion.',4,'work');tick(30);
          check(m.x===stopped[0]&&m.y===stopped[1],'Mascot competes with a work bubble');
          tick(210);
          check(!m.route.length&&m.x===412&&m.y===292,'Quiet walk did not finish');
          tick(600);
          check(!m.route.length&&m.x===412,'Companion walks too often');

          m.nextWalk=s.elapsed;tick(100);
          const before=[m.x,m.y];
          s.paused=true;tick(90);
          check(m.x===before[0]&&m.y===before[1],'Pause/reduced motion ignored');
          s.paused=false;
          document.getElementById('detail-dialog').showModal();tick(100);
          check(m.x===before[0]&&m.y===before[1],'Mascot moves underneath an open dialog');
          document.getElementById('detail-dialog').close();
          s.handoffs.queue.push({});m.update(.05);
          check(m.quietFor===0,'Queued handoff did not take priority');s.handoffs.queue.pop();
          const human=s.people.get('human'),old={x:human.x,y:human.y};
          human.x+=2;m.update(.05);
          check(m.quietFor===0,'Keyboard movement did not take priority');
          Object.assign(human,old);m.update(.05);
          s.session.run={status:'awaiting_human',pending:{kind:'decision'}};
          m.update(.05);check(m.quietFor===0,'Human decision did not take priority');
          s.session.run=null;
          tick(250);

          // Complete several trips: all ground positions stay on clear edge paths,
          // positions/depth remain integer pixels, and rest vastly outweighs walking.
          let walking=0,resting=0;
          for(let i=0;i<4500;i++){
            tick(1);if(m.route.length)walking++;else resting++;
            check(s.nav.free(m.x,m.y),'Companion crosses furniture');
            check(m.x>=400&&m.x<=464&&m.y>=284&&m.y<=308,'Left the quiet edge');
            check(Number.isInteger(m.sprite.x)&&Number.isInteger(m.sprite.y)
              &&m.sprite.depth===Math.round(m.y),'Fractional sprite rendering');
          }
          check(walking>30&&resting>walking*8,'Companion is either frozen or too busy');
          check(!s.game.canvas.getContext('2d').imageSmoothingEnabled,'Smoothing enabled');
          // Leave a natural resting pose for the visual review.
          m.route=[];m.x=448;m.y=300;m.state='rest';m.restFor=2;m.nextWalk=Infinity;
          m.update(0);
        }""")
        capture(page, "office-crocodile-day")
        page.get_by_role("button", name="Night mode", exact=True).click()
        capture(page, "office-crocodile-night")
        assert page.evaluate("studio.mascot.sprite.texture.key.startsWith('night:')")
        if directory := os.environ.get("ZIPPERCREW_OFFICE_CAPTURES"):
            data = page.evaluate("""() => {
              const canvas=document.createElement('canvas');canvas.width=1152;canvas.height=432;
              const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.scale(6,6);
              c.fillStyle='#e7ded0';c.fillRect(0,0,192,36);
              c.fillStyle='#4b525e';c.fillRect(0,36,192,36);
              for(const [i,mood]of ['day','night'].entries())c.drawImage(
                studio.textures.get(`${mood}:person-${studio.mascot.id}`).getSourceImage(),0,i*36);
              return canvas.toDataURL().split(',')[1];
            }""")
            (Path(directory) / "crocodile-poses.png").write_bytes(base64.b64decode(data))
        assert not errors
        browser.close()
