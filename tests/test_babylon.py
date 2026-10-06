"""The shipped GLBs and actual renderer are tested, not a parallel animation mock."""

from __future__ import annotations

import json
import struct
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ASSETS = Path(__file__).parents[1] / "src/zippercrew/static/assets/3d"
CLIPS = {
    "idle",
    "walk",
    "turn",
    "sit",
    "stand",
    "working",
    "reviewing",
    "coffee",
    "look-around",
    "receive",
    "send",
    "notification",
    "completed",
    "stopped",
}


def test_shipped_glbs_have_real_geometry_skins_and_blendable_clips():
    for path in ASSETS.glob("*.glb"):
        data = path.read_bytes()
        magic, version, length, json_length = struct.unpack_from("<IIII", data)
        assert magic == 0x46546C67 and version == 2 and length == len(data)
        doc = json.loads(data[20 : 20 + json_length])
        assert len(doc["meshes"]) > 20
        assert all("indices" in mesh["primitives"][0] for mesh in doc["meshes"])
        assert all("uri" not in b for b in doc["buffers"])
        if path.stem == "corner-cafe":
            names = {n["name"] for n in doc["nodes"]}
            assert {"monitor-body", "chair-cushion", "counter-body", "window-upright"} <= names
            assert {"window-bench-base", "coffee-niche-back", "desk-leg"} <= names
            assert not any(
                word in name
                for name in names
                for word in ("rug", "plant", "book", "pendant", "cafe-sign", "floor-seam")
            )
            continue
        if path.stem == "human":
            names = {n["name"] for n in doc["nodes"]}
            assert {"listening-curl", "uneven-shirt-tail", "score-cover", "score-pages"} <= names
            assert not any(name.startswith("hand-phone") for name in names)
        assert len(doc["skins"][0]["joints"]) >= 11
        assert CLIPS <= {clip["name"] for clip in doc["animations"]}
        signatures = [
            {(c["target"]["node"], c["target"]["path"]) for c in clip["channels"]}
            for clip in doc["animations"]
        ]
        assert all(signature == signatures[0] for signature in signatures)
        for mesh in doc["meshes"]:
            assert {"POSITION", "NORMAL", "JOINTS_0", "WEIGHTS_0"} <= set(
                mesh["primitives"][0]["attributes"]
            )


@pytest.mark.browser
def test_world_geometry_lighting_walk_sit_and_preemption(service, tmp_path):
    _, base, _ = service
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 850})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(base + "/assets/3d/prototype.html")
        page.wait_for_function("() => window.room?.scene.ready")
        page.wait_for_function(
            "() => {const p=room.scene.people.get('Implementer');return p.seated&&!p.seatMotion;}"
        )
        result = page.evaluate("""() => {
            const s=room.scene,p=s.people.get('Implementer');
            return {pose:p.pose,facing:p.root.rotation.y,position:p.root.position.asArray(),
                cast:s.shadows.getShadowMap().renderList.length,
                rigs:[...s.people.values()].map(p=>p.result.skeletons.length),
                receivers:s.world.meshes.filter(m=>m.receiveShadows).length,
                perspective:s.camera.mode===BABYLON.Camera.PERSPECTIVE_CAMERA,
                environment:s.environment.meshes.length,
                indexed:s.environment.meshes.every(m=>m.getTotalIndices()>0)};
        }""")
        assert result["pose"] == "working"
        assert abs(result["facing"] - (3.141592653589793 - 2.25)) < 0.001
        assert result["position"] == pytest.approx([-4, 0, 0.4])
        assert result["cast"] > 50 and result["receivers"] > 50 and result["environment"] > 10
        assert result["rigs"] == [1, 1, 1] and result["perspective"]
        assert result["indexed"]
        page.screenshot(path=str(tmp_path / "workstation.png"))
        for role in ("Implementer", "Reviewer", "Human"):
            page.evaluate(
                """role=>{
                const s=room.scene,p=s.people.get(role);
                s.transition(p,'waiting');s.setReducedMotion(true);s.setReducedMotion(false);
                const now=performance.now();s.ambient.step(role,'waiting',now);
                Object.assign(s.ambient.people.get(role),{action:'coffee',until:now+30000});
                s.ambientAction(p,'coffee');
            }""",
                role,
            )
            page.wait_for_function("(role)=>!!room.scene.people.get(role).route", arg=role)
            before = page.evaluate(
                "(role)=>room.scene.people.get(role).root.position.asArray()", role
            )
            page.wait_for_timeout(350)
            after = page.evaluate(
                "(role)=>room.scene.people.get(role).root.position.asArray()", role
            )
            assert before != after
            page.evaluate(
                """role=>{
                const s=room.scene,p=s.people.get(role);
                const state=role==='Human'?'needs human':role==='Reviewer'?'reviewing':'working';
                s.transition(p,state);
            }""",
                role,
            )
            assert page.evaluate("(role)=>room.scene.people.get(role).ambientAction", role) is None
            assert page.evaluate(
                "(role)=>room.scene.people.get(role).destination.asArray()", role
            ) != [3.1, 0, -2.1]
            page.evaluate("room.scene.setReducedMotion(true)")
            # All three models cast and receive the same geometric shadows at
            # desk, counter and window positions; no per-person polygon masks.
            for zone, pos in [
                ("desk", [3.3, 0, -0.7]),
                ("counter", [-4.5, 0, -4.2]),
                ("window", [-5.8, 0, 0.5]),
            ]:
                page.evaluate(
                    """({role,pos})=>{
                    room.scene.people.get(role).root.position.set(...pos);
                    room.scene.world.render();
                }""",
                    {"role": role, "pos": pos},
                )
                person = next(
                    p
                    for p in page.evaluate("room.scene.inspect().participants")
                    if p["role"] == role
                )
                assert all(person["lighting"].values())
                page.screenshot(path=str(tmp_path / f"{role}-{zone}.png"))
        page.evaluate("room.dispose()")
        assert page.locator("#world canvas").count() == 0
        assert not errors
        browser.close()


@pytest.mark.browser
def test_reduced_motion_keeps_rig_poses_and_draws_new_message(service):
    _, base, _ = service
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(reduced_motion="reduce")
        page.goto(base + "/assets/3d/prototype.html")
        page.wait_for_function("() => window.room?.scene.ready")
        page.evaluate("""() => {
            const s=room.scene;
            s.transition(s.people.get('Implementer'),'working');
            s.transition(s.people.get('Reviewer'),'reviewing');
            s.transition(s.people.get('Human'),'needs human');
        }""")
        # Check actual rig transforms, not merely the renderer's pose labels.
        angles = page.evaluate("""() => [...room.scene.people.values()].map(p=>({
            arm:p.result.transformNodes.find(n=>n.name==='armR')
                .rotationQuaternion.toEulerAngles().x,
            leg:p.result.transformNodes.find(n=>n.name==='legL')
                .rotationQuaternion.toEulerAngles().x
        }))""")
        assert angles[0]["leg"] < -0.9 and angles[1]["leg"] < -0.9
        assert angles[2]["arm"] < -0.6
        page.evaluate("""() => room.scene.message({
            id:'shader-proof',version:1,send_id:1,receive_id:null,
            from:'Implementer',to:'Reviewer',label:'Proposal',seq:17
        })""")
        # A newly compiled card material must redraw even when ambient motion
        # is disabled. Drawing it must never manufacture a runtime receipt.
        page.wait_for_function("""() => {
            const s=room.scene,t=s.messages.get('shader-proof');
            return t?.mesh.isReady(true) && s.world.getActiveMeshes().data.includes(t.mesh);
        }""")
        assert page.evaluate("room.scene.messages.get('shader-proof').envelope.receive_id") is None
        browser.close()


@pytest.mark.browser
def test_every_persona_has_living_rig_loops_and_interruptible_interactions(service):
    _, base, _ = service
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 850})
        page.goto(base + "/assets/3d/prototype.html")
        page.wait_for_function("() => window.room?.scene.ready")
        page.evaluate("""() => {
            const s=room.scene;s.setReducedMotion(true);
            for(const p of s.people.values()) s.transition(p,'waiting');
            s.setReducedMotion(false);
        }""")
        snapshot = """() => [...room.scene.people.values()].map(p=>
            p.result.transformNodes.find(n=>n.name==='head')
              .rotationQuaternion.toEulerAngles().asArray())"""
        before = page.evaluate(snapshot)
        page.wait_for_timeout(2200)
        after = page.evaluate(snapshot)
        for first, second in zip(before, after, strict=True):
            assert max(abs(a - b) for a, b in zip(first, second, strict=True)) > 0.015
        assert all(
            p["state"] == "waiting" for p in page.evaluate("room.scene.inspect().participants")
        )
        # A standing phone interaction must not give Human seated legs.
        phone = page.evaluate("""() => {
            const s=room.scene,p=s.people.get('Human');s.setReducedMotion(true);
            s.play(p,'phone');
            return p.result.transformNodes.find(n=>n.name==='legL')
              .rotationQuaternion.toEulerAngles().x;
        }""")
        assert abs(phone) < 0.1
        # Each role gets a real spatial coffee interaction, then yields instantly.
        for role in ("Implementer", "Reviewer", "Human"):
            page.evaluate(
                """role=>{
                const s=room.scene,p=s.people.get(role);s.setReducedMotion(false);
                s.transition(p,'waiting');
                const now=performance.now();s.ambient.step(role,'waiting',now);
                Object.assign(s.ambient.people.get(role),{action:'coffee',until:now+30000});
                s.ambientAction(p,'coffee');
            }""",
                role,
            )
            page.wait_for_function("role=>room.scene.people.get(role).pose==='coffee'", arg=role)
            result = page.evaluate(
                """role=>{
                const s=room.scene,p=s.people.get(role),where=p.root.position.asArray();
                const state=role==='Human'?'needs human':role==='Reviewer'?'reviewing':'working';
                s.transition(p,state);
                return {where,state:p.state,ambient:p.ambientAction,clip:p.targetClip,
                    reserved:s.ambient.reservations.has('back-aisle')};
            }""",
                role,
            )
            assert result["where"] == pytest.approx([3.1, 0, -2.1])
            assert result["ambient"] is None and not result["reserved"]
            assert result["clip"] != "coffee"
        page.evaluate("room.scene.setReducedMotion(true)")
        # Read actual authored active-loop poses at two times; role-specific motion
        # must affect the skeleton, not just metadata/labels.
        for role in ("Implementer", "Reviewer", "Human"):
            variation = page.evaluate(
                """role=>{
                const s=room.scene,p=s.people.get(role),clip=p.clips.get(p.pose);
                const head=p.result.transformNodes.find(n=>n.name==='head');
                clip.goToFrame(clip.from+(clip.to-clip.from)*.2);
                const a=head.rotationQuaternion.asArray();
                clip.goToFrame(clip.from+(clip.to-clip.from)*.65);
                return Math.max(...head.rotationQuaternion.asArray().map((v,i)=>Math.abs(v-a[i])));
            }""",
                role,
            )
            assert variation > 0.01
        assert page.evaluate("room.scene.inspect().messages") == []
        browser.close()


@pytest.mark.browser
def test_cast_expressions_are_rigged_and_attention_keeps_shared_shadows(service):
    _, base, _ = service
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(reduced_motion="reduce")
        page.goto(base + "/assets/3d/prototype.html")
        page.wait_for_function("()=>window.room?.scene.ready")
        expressions = page.evaluate("""()=>{
          const s=room.scene;
          return [...s.people.values()].map(p=>{
            const nodes=Object.fromEntries(p.result.transformNodes.map(n=>[n.name,n]));
            const clip=p.clips.get(p.role.name==='Reviewer'?'reviewing':'working');
            s.play(p,clip.name);
            const snapshot=()=>['browL','browR','mouth','expression'].map(name=>({
              name,position:nodes[name].position.asArray(),
              rotation:nodes[name].rotationQuaternion.asArray(),scale:nodes[name].scaling.asArray()
            }));
            clip.goToFrame(clip.from+(clip.to-clip.from)*.15);const a=snapshot();
            clip.goToFrame(clip.from+(clip.to-clip.from)*.66);const b=snapshot();
            s.transition(p,'waiting');const idle=p.portrait.intensity;
            s.transition(p,p.role.name==='Human'?'needs human':
              p.role.name==='Reviewer'?'reviewing':'working');
            return {role:p.role.name,a,b,idle,active:p.portrait.intensity,
              receivers:p.result.meshes.filter(m=>m.getTotalVertices()).every(m=>m.receiveShadows),
              cast:p.result.meshes.filter(m=>m.getTotalVertices()).every(m=>
                s.shadows.getShadowMap().renderList.includes(m))};
          });
        }""")
        for person in expressions:
            assert person["a"] != person["b"], person["role"]
            for name in ("browL", "browR", "expression"):
                first = next(n for n in person["a"] if n["name"] == name)
                second = next(n for n in person["b"] if n["name"] == name)
                assert first != second, (person["role"], name)
            assert person["active"] > person["idle"] > 0
            assert person["cast"] and person["receivers"]
        cue = page.evaluate("""()=>{
          const s=room.scene,p=s.people.get('Human');s.play(p,'attention-seated');
          const clip=p.clips.get('attention-seated'),
            hand=p.result.transformNodes.find(n=>n.name==='handL'),
            leg=p.result.transformNodes.find(n=>n.name==='legL');
          clip.goToFrame(clip.from+(clip.to-clip.from)*.08);
          const before=hand.rotationQuaternion.asArray();
          clip.goToFrame(clip.from+(clip.to-clip.from)*.25);
          const movement=Math.max(...hand.rotationQuaternion.asArray()
            .map((v,i)=>Math.abs(v-before[i])));
          return {movement,
            leg:leg.rotationQuaternion.toEulerAngles().x,state:p.state};
        }""")
        assert cue["movement"] > 0.08 and cue["leg"] < -0.9
        assert cue["state"] == "needs human"
        assert page.evaluate("room.scene.inspect().messages") == []
        browser.close()
