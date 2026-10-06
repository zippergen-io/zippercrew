"""Production illustrated room: navigation, atlas bounds, semantics and scaling."""

from __future__ import annotations

import json
import struct
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ASSETS = Path(__file__).parents[1] / "src/zippercrew/static/assets/dollhouse"


def test_linked_studio_uses_approved_art_without_redrawing_cast():
    approved = Path(__file__).parents[1] / "docs/art/linked-studio-human-integration-2026-10-06"
    assert (ASSETS / "patchwork-cast.png").read_bytes() == (
        approved / "cast-atlas.png"
    ).read_bytes()
    assert (ASSETS / "linked-studio.png").read_bytes() == (
        approved / "linked-studio-background.png"
    ).read_bytes()
    raw = (ASSETS / "patchwork-cast.png").read_bytes()
    width, height, _, color = struct.unpack_from(">IIBB", raw, 16)
    assert color == 6
    frames = json.loads((ASSETS / "patchwork-cast.json").read_text())["frames"]
    assert set(frames) == {"human-neutral", "human-orchestrating", "implementer", "reviewer"}
    for entry in frames.values():
        f = entry["frame"]
        assert 0 <= f["x"] < f["x"] + f["w"] <= width
        assert 0 <= f["y"] < f["y"] + f["h"] <= height


@pytest.mark.browser
def test_ambient_occupied_over_long_quiet_period_and_shared_path_contention(service):
    _, base, _ = service
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        page.goto(base)
        result = page.evaluate("""async()=>{
          const {AmbientDirector}=await import('/presentation.js');
          let seed=412;
          const d=new AmbientDirector(()=>{
            seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;
          });
          const roles=['Human','Implementer','Reviewer','Reviewer 2'];
          const seen=Object.fromEntries(roles.map(r=>[r,new Set()]));
          const last={}, changed={}, travel=new Set(['coffee','window','board','pace']);
          let busy=0;
          for(let t=0;t<600000;t+=500) {
            for(const role of roles) {
              const action=d.step(role,'waiting',t);
              if(!action)throw Error('Unoccupied participant '+role);
              seen[role].add(action);
              if(action!==last[role]) {last[role]=action;changed[role]=t;}
              if(t-changed[role]>31000)throw Error('Stuck routine');
            }
            const trips=roles.filter(r=>travel.has(d.people.get(r).action));
            if(trips.length>1)throw Error('Shared aisle collision');
            if(trips.length)busy++;
          }
          const traveler=roles.find(r=>travel.has(d.people.get(r).action));
          if(traveler) {
            d.step(traveler,'working',600001);
            if(d.reservations.size)throw Error('Work did not release shared path');
          }
          for(const role of roles) {
            if(d.step(role,'reviewing',600002)!==null)throw Error('Task did not preempt');
            if(!d.step(role,'waiting',600003))throw Error('Did not resume occupied');
            if(d.step(role,'waiting',600004,true)!==null)throw Error('Reduced motion');
          }
          return {variety:Object.fromEntries(roles.map(r=>[r,seen[r].size])),busy};
        }""")
        assert all(count >= 5 for count in result["variety"].values())
        assert result["busy"] > 0
        browser.close()


def test_authored_atlases_have_valid_frames_and_alpha():
    for name in ("human", "implementer", "reviewer", "props", "messages"):
        raw = (ASSETS / f"{name}.png").read_bytes()
        width, height, _, color = struct.unpack_from(">IIBB", raw, 16)
        assert color == 6  # authored RGBA, not an opaque concept background
        frames = json.loads((ASSETS / f"{name}.json").read_text())["frames"]
        assert len(frames) == (6 if name == "messages" else 8)
        for entry in frames.values():
            f = entry["frame"]
            assert 0 <= f["x"] < f["x"] + f["w"] <= width
            assert 0 <= f["y"] < f["y"] + f["h"] <= height


@pytest.mark.browser
def test_every_destination_routes_around_furniture_and_bays_scale(service):
    _, base, _ = service
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        page.goto(base)
        result = page.evaluate("""async()=>{
          const {buildLayout,ROLE_DEFINITIONS,route,clearSegment,blocked}=
            await import('/dollhouse-layout.js');
          const sizes=[];
          for(const count of [3,5,8]) {
            const roles=[...ROLE_DEFINITIONS,...Array.from({length:count-3},(_,i)=>
              ({...ROLE_DEFINITIONS[1],name:'Reviewer '+(i+2)}))];
            const layout=buildLayout(roles); sizes.push(layout.width);
            const points=[...layout.stations.values()].flatMap(s=>[s.seat,s.rest,s.approach]);
            points.push(...Object.values(layout.destinations));
            for(const a of points) for(const b of points) {
              const path=route(a,b,layout);
              if(!path) throw Error('Unreachable '+JSON.stringify({a,b,count}));
              let previous=a;
              for(const next of path) {
                if(!clearSegment(previous,next,layout.obstacles)||blocked(next,layout.obstacles))
                  throw Error('Furniture crossing');
                previous=next;
              }
            }
          }
          const layout=buildLayout();
          if(route([932,690],[932,665],layout)!==null)throw Error('Inside desk must fail');
          return sizes;
        }""")
        assert result[0] < result[1] < result[2]
        browser.close()


@pytest.mark.browser
def test_authored_poses_change_and_each_role_yields_ambient_to_work(service):
    _, base, _ = service
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(base)
        page.wait_for_function("()=>document.querySelector('#room-art')?.dataset.ready==='true'")
        page.evaluate("""async()=>{
          const {launchRoom}=await import('/room-engine.js');
          const host=document.createElement('div');
          host.style.cssText='position:fixed;inset:0';document.body.append(host);
          await new Promise(resolve=>launchRoom(host,{onReady(s){window.testRoom=s;
            s.setReducedMotion(true);s.present({states:{Human:'waiting',Implementer:'waiting',Reviewer:'waiting'},
              bindings:{Implementer:{profile:'test'},Reviewer:{profile:'test'}}});
            s.setReducedMotion(false);resolve();}}));
        }""")
        for role, state in [
            ("Human", "needs human"),
            ("Implementer", "working"),
            ("Reviewer", "reviewing"),
        ]:
            page.evaluate(
                """role=>{
              const s=testRoom,p=s.people.get(role),now=performance.now();
              s.ambient.step(role,'waiting',now);
              Object.assign(s.ambient.people.get(role),{action:'coffee',until:now+20000});
              s.ambientAction(p,'coffee');
            }""",
                role,
            )
            page.wait_for_function("role=>testRoom.people.get(role).path.length>0", arg=role)
            page.evaluate(
                """({role,state})=>testRoom.transition(testRoom.people.get(role),state)""",
                {"role": role, "state": state},
            )
            assert page.evaluate("role=>testRoom.people.get(role).ambientAction", role) is None
            assert page.evaluate("role=>testRoom.people.get(role).state", role) == state
        page.evaluate("testRoom.setReducedMotion(true)")
        assert not any(p["moving"] for p in page.evaluate("testRoom.inspect().participants"))
        page.evaluate("testRoom.setReducedMotion(false)")
        # Approved agent artwork remains the same frame; runtime gestures animate
        # position/angle rather than replacing it with the old cast's work poses.
        motions = []
        for _ in range(7):
            page.wait_for_timeout(700)
            motions.append(page.evaluate("testRoom.people.get('Implementer').sprite.angle"))
        assert max(motions) - min(motions) > 0.2
        assert page.evaluate(
            "testRoom.people.get('Implementer').sprite.frame.name"
        ) == "implementer"
        assert page.evaluate("testRoom.inspect().messages") == []
        browser.close()


@pytest.mark.browser
def test_eight_role_renderer_keeps_character_scale_and_can_focus_annex(service):
    _, base, _ = service
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(base)
        page.wait_for_function("()=>document.querySelector('#room-art')?.dataset.ready==='true'")
        result = page.evaluate("""async()=>{
          const {launchRoom,ROLES}=await import('/room-engine.js');
          const host=document.createElement('div');
          host.style.cssText='position:fixed;width:1066px;height:755px;left:0;top:0';
          document.body.append(host);
          const roles=[...ROLES,...Array.from({length:5},(_,i)=>
            ({...ROLES[1],name:'Reviewer '+(i+2)}))];
          const s=await new Promise(resolve=>launchRoom(host,{roles,onReady:resolve}));
          const view={states:Object.fromEntries(roles.map(r=>[r.name,'waiting'])),
            bindings:Object.fromEntries(roles.map(r=>[r.name,{profile:'test'}]))};
          s.setReducedMotion(true);s.present(view);
          await new Promise(resolve=>setTimeout(resolve,80));
          const scale=s.people.get('Reviewer').sprite.scaleX;
          s.present({...view,selected:'Reviewer 6'});
          const p=s.people.get('Reviewer 6'),at=s.project(p.x,p.y);
          return {count:s.people.size,width:s.layout.width,zoom:s.zoom,at,scale,
            lastScale:p.sprite.scaleX,hostWidth:host.clientWidth};
        }""")
        assert result["count"] == 8 and result["width"] > 2500
        assert result["zoom"] == pytest.approx(1066 / 1836)
        assert result["scale"] == result["lastScale"]
        assert 0 < result["at"]["x"] < result["hostWidth"]
        browser.close()


@pytest.mark.browser
def test_linked_studio_foreground_tracks_scaled_container(service):
    _, base, _ = service
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.goto(base)
        page.wait_for_function("document.querySelector('#room-art').dataset.ready==='true'")
        result = page.evaluate("""async()=>{
          const {launchRoom}=await import('/room-engine.js');
          const host=document.createElement('div');
          host.style.cssText='position:fixed;width:1066px;height:755px;left:0;top:0';
          document.body.append(host);
          const engine=launchRoom(host,{reducedMotion:true});
          const s=engine.scene;
          while(!s.ready)await new Promise(r=>setTimeout(r,20));
          s.present({states:{Human:'waiting',Implementer:'waiting',Reviewer:'waiting'},
            bindings:{Implementer:{profile:'test'},Reviewer:{profile:'test'}}});
          await new Promise(r=>setTimeout(r,180));
          const ctx=host.querySelector('canvas').getContext('2d');
          const at=s.project(1330,641), w=Math.floor(130*s.zoom),h=Math.floor(20*s.zoom);
          const feet=ctx.getImageData(Math.floor(at.x),Math.floor(at.y),w,h).data;
          let dark=0;for(let i=0;i<feet.length;i+=4)
            if(feet[i]<60&&feet[i+1]<60&&feet[i+2]<60)dark++;
          const table=s.project(932,622);
          const wood=[...ctx.getImageData(Math.floor(table.x),Math.floor(table.y),1,1).data];
          engine.dispose();host.remove();return {dark,wood};
        }""")
        assert result["dark"] > 70, "Reviewer's feet must not be clipped by the table mask"
        red, green, blue, _ = result["wood"]
        assert red > 150 and green > 90 and blue < 190, "Table must occlude the blue overalls"
        browser.close()
