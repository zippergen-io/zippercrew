"""Navigation is tested against the shipped level, not mocked waypoints."""

import pytest
from playwright.sync_api import sync_playwright


@pytest.mark.browser
def test_all_destinations_clear_furniture_and_blocked_goals_fail_closed(service):
    _, base, _ = service
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        page.goto(base + "/assets/3d/prototype.html")
        result = page.evaluate("""async()=>{
          const {LAYOUT,local,furniture,route,clearSegment}=
            await import('/assets/3d/navigation.js');
          const failures=[];let segments=0;
          for(const [role,s] of Object.entries(LAYOUT.stations)) {
            const obstacles=furniture({[role]:LAYOUT.chairPull});
            const points=[s.rest,...Object.values(LAYOUT.destinations),
                          local(s,0,s.dock??LAYOUT.dock)];
            for(const from of points)for(const to of points) {
              const path=route(from,to,obstacles);
              if(!path) {failures.push({role,from,to,reason:'unreachable'});continue;}
              let p=from;
              for(const q of path) {
                if(!clearSegment(p,q,obstacles))failures.push({role,p,q});p=q;segments++;
              }
            }
            for(const o of obstacles)if(route(s.rest,o.center,obstacles))
              failures.push({role,blocked:o.id});
          }
          return {failures,segments};
        }""")
        assert not result["failures"], result["failures"]
        assert result["segments"] > 100
        browser.close()


@pytest.mark.browser
def test_real_walking_never_crosses_furniture_and_seating_has_front_entry(service, tmp_path):
    _, base, _ = service
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 850})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(base + "/assets/3d/prototype.html")
        page.wait_for_function("()=>window.room?.scene.ready")
        page.evaluate("""async()=>{
          const nav=await import('/assets/3d/navigation.js');window.nav=nav;window.collisions=[];
          const s=room.scene;
          s.ambient.random=()=>.2;
          s.world.onBeforeRenderObservable.add(()=>{
            for(const p of s.people.values()) if(p.route && !p.seatMotion) {
              for(const o of s.obstacles())if(nav.contains(s.floor(p.root.position),o))
                collisions.push({role:p.role.name,obstacle:o.id,at:s.floor(p.root.position)});
            }
            const h=s.people.get('Human'),bench=s.chairs.get('Human').position;
            if(bench.x!==h.role.seat[0]||bench.z!==h.role.seat[2])
              collisions.push({role:'Human',reason:'fixed bench moved'});
          });
        }""")
        page.wait_for_function(
            "()=>{const p=room.scene.people.get('Implementer');return !p.seatMotion&&p.seated;}"
        )
        for role in ("Implementer", "Reviewer", "Human"):
            for destination in ("coffee", "board", "window"):
                page.evaluate(
                    """({role,destination})=>{
                  const s=room.scene,p=s.people.get(role),now=performance.now();
                  s.transition(p,'waiting');s.ambient.step(role,'waiting',now);
                  // Pin the fixture's chosen destination for the whole walk;
                  // the production scheduler now also uses due for rotation.
                  Object.assign(s.ambient.people.get(role),{
                    action:destination,until:now+90000,due:now+90000
                  });
                  s.ambientAction(p,destination);
                }""",
                    {"role": role, "destination": destination},
                )
                page.wait_for_function(
                    """({role,destination})=>{
                  const p=room.scene.people.get(role),at=nav.LAYOUT.destinations[destination];
                  return !p.route&&!p.seatMotion&&!p.navBlocked
                    &&Math.hypot(p.root.position.x-at[0],p.root.position.z-at[1])<.01;
                }""",
                    arg={"role": role, "destination": destination},
                    timeout=30000,
                )
                assert page.evaluate("collisions") == []
                page.screenshot(path=str(tmp_path / f"{role}-{destination}.png"))
            page.evaluate(
                """role=>{
              const s=room.scene,p=s.people.get(role);
              s.transition(p,role==='Human'?'needs human':role==='Reviewer'?'reviewing':'working');
            }""",
                role,
            )
            page.wait_for_function(
                "role=>room.scene.people.get(role).seatMotion?.phase==='sit'", arg=role
            )
            # Walk ends at the front dock, then the sit interaction enters the seat.
            assert page.evaluate("role=>room.scene.people.get(role).route", role) is None
            page.wait_for_function(
                "role=>room.scene.people.get(role).seated&&!room.scene.people.get(role).seatMotion",
                arg=role,
            )
            actual = page.evaluate(
                "role=>room.scene.people.get(role).root.position.asArray()", role
            )
            target = page.evaluate("role=>room.scene.people.get(role).role.seat", role)
            assert actual == pytest.approx(target)
            assert page.evaluate("collisions") == []
            page.screenshot(path=str(tmp_path / f"{role}-seated.png"))
        # Human attention can supersede a coffee departure mid chair interaction.
        page.evaluate("""()=>{
          const s=room.scene,p=s.people.get('Human'),now=performance.now();
          s.transition(p,'waiting');s.ambient.step('Human','waiting',now);
          Object.assign(s.ambient.people.get('Human'),{action:'coffee',until:now+30000});
          s.ambientAction(p,'coffee');
          s.transition(p,'needs human');
        }""")
        page.wait_for_function("""()=>{const p=room.scene.people.get('Human');
          return p.seated&&!p.seatMotion&&p.pose==='attention-seated';}""")
        assert page.evaluate("room.scene.people.get('Human').ambientAction") is None
        assert page.evaluate("collisions") == []
        assert not errors
        browser.close()


@pytest.mark.browser
def test_navigation_footprints_cover_imported_furniture(service):
    _, base, _ = service
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        page.goto(base + "/assets/3d/prototype.html")
        page.wait_for_function("()=>window.room?.scene.ready")
        result = page.evaluate("""async()=>{
          const {furniture}=await import('/assets/3d/navigation.js');
          const s=room.scene;s.setReducedMotion(true);const misses={},seen=new Set();let count=0;
          for(const m of s.environment.meshes) {
            const box=furniture(s.chairOffsets).find(b=>b.id===m.metadata?.navId);
            if(!box)continue;seen.add(box.id);m.computeWorldMatrix(true);
            const vertices=m.getVerticesData(BABYLON.VertexBuffer.PositionKind);
            for(let i=0;i<vertices.length;i+=3) {
              const v=BABYLON.Vector3.TransformCoordinates(
                new BABYLON.Vector3(...vertices.slice(i,i+3)),m.getWorldMatrix());
              // Soft foliage can overhang; the planter/stem remains solid.
              if(box.id.startsWith('plant')&&v.y>1.2)continue;
              const x=v.x-box.center[0],z=v.z-box.center[1];
              const c=Math.cos(box.yaw),t=Math.sin(box.yaw);
              const spill=Math.max(Math.abs(x*c-z*t)-box.half[0],
                                   Math.abs(x*t+z*c)-box.half[1]);
              if(spill>.035)misses[box.id]=Math.max(misses[box.id]||0,spill);
              count++;
            }
          }return {count,misses,seen:[...seen],expected:furniture().map(b=>b.id)};
        }""")
        assert result["count"] > 0
        assert set(result["seen"]) == set(result["expected"])
        assert result["misses"] == {}
        browser.close()


@pytest.mark.browser
def test_binding_and_chair_reservation_do_not_trap_a_passing_participant(service):
    _, base, _ = service
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        page.goto(base + "/assets/3d/prototype.html")
        page.wait_for_function("()=>window.room?.scene.ready")
        joined = page.evaluate("""async()=>{
          const nav=await import('/assets/3d/navigation.js'),s=room.scene;
          s.setReducedMotion(true);
          const p=s.people.get('Implementer');s.transition(p,'unconfigured');
          s.setReducedMotion(false);s.transition(p,'ready');
          return !p.navBlocked&&nav.clearSegment(s.floor(p.root.position),
                      s.floor(p.root.position),s.obstacles());
        }""")
        assert joined
        page.evaluate("""async()=>{
          const {local}=await import('/assets/3d/navigation.js'),s=room.scene;
          const impl=s.people.get('Implementer'),rev=s.people.get('Reviewer');
          s.setReducedMotion(true);s.transition(impl,'waiting');s.transition(rev,'waiting');
          s.setReducedMotion(false);
          const q=local(impl.role.station,0,1.7);
          rev.root.position.set(q[0],0,q[1]);
          s.transition(impl,'working');
          s.move(rev,new BABYLON.Vector3(...rev.role.rest),rev.role.station.restYaw,'tablet');
        }""")
        page.wait_for_function(
            """()=>{
          const s=room.scene,p=s.people.get('Implementer'),r=s.people.get('Reviewer');
          return p.seated&&!p.seatMotion&&!r.route&&!r.navBlocked;
        }""",
            timeout=30000,
        )
        assert page.evaluate("room.scene.people.get('Implementer').state") == "working"
        browser.close()
