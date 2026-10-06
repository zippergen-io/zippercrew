import { AmbientDirector, ActivityCadence } from "/presentation.js";
import {
  LAYOUT,
  local,
  furniture,
  route,
  contains,
  clearSegment,
} from "/assets/3d/navigation.js";
const B = window.BABYLON;
const V = (x = 0, y = 0, z = 0) => new B.Vector3(x, y, z);
export const ROLES = [
  {
    name: "Implementer",
    key: "implementer",
    color: 0xeb7954,
    access: "Write access",
    description: "Makes the change, tests it, and responds to the review.",
  },
  {
    name: "Reviewer",
    key: "reviewer",
    color: 0x35a8b0,
    access: "Read-only access",
    description: "Inspects the repository and challenges the proposal.",
  },
  {
    name: "Human",
    key: "human",
    color: 0xa37ab5,
    access: "Process decisions",
    description: "Listens to the crew and sets the direction.",
  },
].map((role) => {
  const station = LAYOUT.stations[role.name];
  const [mx, mz] = local(
    station,
    station.tableX || 0,
    role.name === "Human" ? -LAYOUT.tableOffset : -2.23,
  );
  const [ax, az] = local(station, 0, station.dock ?? LAYOUT.dock);
  return {
    ...role,
    station,
    seat: [station.seat[0], 0, station.seat[1]],
    approach: [ax, 0, az],
    monitor: [mx, role.name === "Human" ? 1.58 : 2.03, mz],
    rest: [station.rest[0], 0, station.rest[1]],
  };
});
const POSE = {
  ready: "idle",
  working: "working",
  reviewing: "reviewing",
  waiting: "idle",
  "needs human": "notification",
  completed: "completed",
  failed: "stopped",
  stopped: "stopped",
  unconfigured: "idle",
};
const point = (a) => V(...a);
const lerpAngle = (a, b, t) =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export class Cafe3D {
  constructor(parent, callbacks) {
    this.parent = parent;
    this.callbacks = callbacks;
    this.ready = false;
    this.dirty = true;
    this.reducedMotion = !!callbacks.reducedMotion;
    this.people = new Map();
    this.chairs = new Map();
    this.chairOffsets = {};
    this.chairParks = new Map();
    this.messages = new Map();
    this.messageVersions = new Map();
    this.ambient = new AmbientDirector();
    this.activities = new ActivityCadence();
    this.canvas = document.createElement("canvas");
    parent.append(this.canvas);
    this.engine = new B.Engine(
      this.canvas,
      true,
      {
        preserveDrawingBuffer: true,
        stencil: true,
        powerPreference: "low-power",
      },
      false,
    );
    // One CSS pixel per render pixel bounds GPU work and preserves overlay coordinates.
    this.engine.setHardwareScalingLevel(1);
    this.engine.maxFPS = 30;
    this.world = new B.Scene(this.engine);
    this.world.useRightHandedSystem = true;
    this.world.clearColor = new B.Color4(0.79, 0.85, 0.87, 1);
    this.world.imageProcessingConfiguration.toneMappingEnabled = true;
    this.world.imageProcessingConfiguration.toneMappingType =
      B.ImageProcessingConfiguration.TONEMAPPING_ACES;
    this.world.imageProcessingConfiguration.exposure = 1.35;
    this.world.imageProcessingConfiguration.contrast = 1.05;
    this.camera = new B.FreeCamera(
      "composed-camera",
      V(10, 10.8, 15),
      this.world,
    );
    this.camera.minZ = 0.1;
    this.camera.maxZ = 100;
    this.camera.fov = 0.72;
    this.camera.setTarget(V(0, 1, -0.25));
    this.light = new B.DirectionalLight(
      "window-key",
      V(0.28, -0.85, 0.65),
      this.world,
    );
    this.light.position = V(-6, 10, -9);
    this.light.intensity = 2.3;
    this.light.diffuse = new B.Color3(1, 0.92, 0.79);
    const fill = new B.HemisphericLight("sky-fill", V(0, 1, 0), this.world);
    fill.intensity = 1.1;
    fill.groundColor = new B.Color3(0.25, 0.31, 0.38);
    this.shadows = new B.ShadowGenerator(2048, this.light);
    this.shadows.usePercentageCloserFiltering = true;
    this.shadows.filteringQuality = B.ShadowGenerator.QUALITY_MEDIUM;
    this.shadows.bias = 0.001;
    this.shadows.normalBias = 0.018;
    const cafeLight = new B.PointLight(
      "cafe-warmth",
      V(4.6, 3.1, -3.2),
      this.world,
    );
    cafeLight.diffuse = new B.Color3(1, 0.72, 0.4);
    cafeLight.intensity = 0.3;
    cafeLight.range = 4.5;
    this.light.shadowMinZ = 1;
    this.light.shadowMaxZ = 40;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(parent);
    this.world.onPointerObservable.add((event) => {
      if (
        event.type === B.PointerEventTypes.POINTERPICK &&
        event.pickInfo.hit
      ) {
        let mesh = event.pickInfo.pickedMesh;
        while (mesh && !mesh.metadata?.select) mesh = mesh.parent;
        if (mesh?.metadata?.select) callbacks.onSelect?.(mesh.metadata.select);
      }
    });
    this.engine.runRenderLoop(() => {
      this.update();
      // Reduced motion has static rigs. Repaint on visual changes rather than
      // saturating a GPU with identical frames while someone reads a review.
      if (!this.ready || !this.reducedMotion || this.dirty) {
        this.world.render();
        // Newly created card materials may compile asynchronously. Keep drawing
        // until ready, then retain the finished frame without burning GPU time.
        this.dirty = !this.world.isReady();
      }
    });
    this.load().catch((error) =>
      callbacks.onError?.(
        new Error("Room asset could not load: " + error.message),
      ),
    );
    this.canvas.addEventListener("webglcontextlost", () =>
      callbacks.onError?.(
        new Error("Room graphics context lost. Reload to retry."),
      ),
    );
  }
  async load() {
    const env = await B.SceneLoader.ImportMeshAsync(
      "",
      "/assets/3d/",
      "corner-cafe.glb",
      this.world,
    );
    for (const mesh of env.meshes) {
      if (mesh.name.includes("brief")) mesh.metadata = { select: "brief" };
      if (/coral-station|coral-chair/.test(mesh.name))
        mesh.metadata = { select: "Implementer" };
      if (/teal-station|teal-chair/.test(mesh.name))
        mesh.metadata = { select: "Reviewer" };
    }
    for (const [role, key] of [
      ["Implementer", "coral-chair"],
      ["Reviewer", "teal-chair"],
      ["Human", "human-chair"],
    ]) {
      const node = env.transformNodes.find((n) => n.name === key);
      if (!node) throw Error("Missing interaction chair: " + role);
      node.metadata = { select: role, seatRole: role, navId: role + "-chair" };
      this.chairs.set(role, node);
      this.chairOffsets[role] = 0;
    }
    for (const node of env.transformNodes) {
      if (node.name === "coral-station" || node.name === "coral-chair")
        node.metadata = { ...node.metadata, select: "Implementer" };
      if (node.name === "teal-station" || node.name === "teal-chair")
        node.metadata = { ...node.metadata, select: "Reviewer" };
    }
    for (const node of env.transformNodes) {
      if (node.name === "coral-station")
        node.metadata.navId = "Implementer-desk";
      if (node.name === "teal-station") node.metadata.navId = "Reviewer-desk";
      if (node.name === "coffee-counter") node.metadata = { navId: "counter" };
      if (node.name === "plant")
        node.metadata = {
          navId: node.position.x > 0 ? "plant-right" : "plant-left",
        };
    }
    const table = env.transformNodes.find((n) => n.name === "human-table");
    table.metadata = { select: "Human", navId: "table" };
    // Batch static GLB surfaces by material and selection owner. Keep floor
    // separate for diagnostics; no per-frame hundreds-of-props draw overhead.
    const batches = new Map();
    const exterior = env.transformNodes.find(
      (n) => n.name === "window-exterior",
    );
    for (const mesh of env.meshes.filter((m) => m.getTotalVertices())) {
      let owner = mesh;
      while (owner && !owner.metadata?.select) owner = owner.parent;
      const select = owner?.metadata?.select;
      let chairOwner = mesh;
      while (chairOwner && !chairOwner.metadata?.seatRole)
        chairOwner = chairOwner.parent;
      const seatRole = chairOwner?.metadata?.seatRole;
      let navOwner = mesh;
      while (navOwner && !navOwner.metadata?.navId) navOwner = navOwner.parent;
      const navId = navOwner?.metadata?.navId;
      const outside = mesh.isDescendantOf(exterior);
      const key = [
        outside,
        mesh.material.uniqueId,
        select || "",
        mesh.name === "warm-floor",
        seatRole || "",
        navId || "",
      ].join(":");
      if (!batches.has(key))
        batches.set(key, { meshes: [], select, seatRole, navId, outside });
      batches.get(key).meshes.push(mesh);
    }
    env.meshes = [...batches.values()].map(
      ({ meshes, select, seatRole, navId, outside }) => {
        const mesh =
          meshes.length === 1
            ? meshes[0]
            : B.Mesh.MergeMeshes(meshes, true, true);
        mesh.metadata = { select, navId };
        mesh.receiveShadows = true;
        if (seatRole) mesh.setParent(this.chairs.get(seatRole));
        else mesh.freezeWorldMatrix();
        if (!outside) this.shadows.addShadowCaster(mesh, false);
        return mesh;
      },
    );
    this.environment = env;
    this.board = B.MeshBuilder.CreatePlane(
      "brief-ink",
      { width: 2.32, height: 1.52 },
      this.world,
    );
    this.board.position = point(LAYOUT.board.position);
    this.board.position.z += 0.025;
    this.board.rotation.y = Math.PI;
    const mat = new B.StandardMaterial("brief-ink", this.world);
    this.brief = new B.DynamicTexture(
      "shared-brief",
      { width: 1024, height: 512 },
      this.world,
      true,
    );
    this.brief.uScale = -1;
    this.brief.uOffset = 1;
    mat.diffuseTexture = this.brief;
    mat.emissiveColor = new B.Color3(0.22, 0.27, 0.25);
    mat.specularColor = B.Color3.Black();
    this.board.material = mat;
    this.board.metadata = { select: "brief" };
    for (const role of ROLES) await this.loadPerson(role);
    this.ready = true;
    this.resize();
    this.setBrief("What are we working on?");
    if (this.pendingView) this.present(this.pendingView);
    this.callbacks.onReady?.(this);
  }
  async loadPerson(role) {
    const result = await B.SceneLoader.ImportMeshAsync(
      "",
      "/assets/3d/",
      role.key + ".glb",
      this.world,
    );
    const root = new B.TransformNode(role.name, this.world);
    root.position = point(role.rest);
    root.metadata = { select: role.name };
    for (const mesh of result.meshes) {
      if (!mesh.parent) mesh.parent = root;
      mesh.receiveShadows = true;
      mesh.metadata = { select: role.name };
      if (mesh.getTotalVertices()) this.shadows.addShadowCaster(mesh, false);
    }
    for (const node of result.transformNodes)
      if (!node.parent) node.parent = root;
    const clips = new Map(
      result.animationGroups.map((group) => {
        group.stop();
        // Clip weights below own the crossfade. A second start-pose ramp would
        // leave a paused reduced-motion clip stuck near its neutral pose.
        group.enableBlending = false;
        return [group.name, group];
      }),
    );
    const ring = B.MeshBuilder.CreateTorus(
      role.name + "-selection",
      { diameter: 1.45, thickness: 0.045, tessellation: 48 },
      this.world,
    );
    const mat = new B.StandardMaterial(role.name + "-accent", this.world);
    mat.emissiveColor = B.Color3.FromHexString("#" + role.color.toString(16));
    mat.disableLighting = true;
    ring.material = mat;
    ring.parent = root;
    ring.position.y = 0.065;
    ring.isPickable = false;
    const bubble = document.createElement("div");
    bubble.className = "work-bubble";
    bubble.hidden = true;
    const title = document.createElement("strong"),
      detail = document.createElement("span");
    bubble.append(title, detail);
    this.parent.append(bubble);
    const person = {
      role,
      root,
      result,
      clips,
      ring,
      bubble,
      bubbleTitle: title,
      bubbleDetail: detail,
      state: "ready",
      pose: "idle",
      home: point(role.rest),
      ambientAction: null,
      weights: new Map(),
      currentActivity: null,
    };
    // A restrained portrait fill keeps faces readable beneath the window key.
    // It complements, rather than replaces, shared cast/received shadows.
    const portrait = new B.PointLight(
      role.name + "-portrait",
      V(0, 3.4, 2.8),
      this.world,
    );
    portrait.parent = root;
    portrait.diffuse = new B.Color3(1, 0.91, 0.8);
    portrait.intensity = 0.22;
    portrait.range = 5;
    portrait.includedOnlyMeshes = result.meshes;
    person.portrait = portrait;
    this.people.set(role.name, person);
    this.play(person, "idle");
    // A real held prop follows the hand bone. No screen-space approximation.
    const cup = B.MeshBuilder.CreateCylinder(
      role.name + "-cup",
      {
        height: 0.25,
        diameterTop: 0.29,
        diameterBottom: 0.22,
        tessellation: 16,
      },
      this.world,
    );
    const cupMaterial = new B.PBRMaterial(role.name + "-ceramic", this.world);
    cupMaterial.albedoColor = new B.Color3(0.85, 0.79, 0.65);
    cupMaterial.roughness = 0.8;
    cupMaterial.metallic = 0;
    cup.material = cupMaterial;
    cup.isVisible = false;
    cup.receiveShadows = true;
    this.shadows.addShadowCaster(cup);
    const hand = result.skeletons[0]?.bones.find((b) => b.name === "handR");
    const skinned = result.meshes.find((m) => m.skeleton);
    if (hand && skinned) {
      cup.attachToBone(hand, skinned);
      cup.position = V(0, -0.03, 0.18);
    }
    person.cup = cup;
  }
  setBrief(text) {
    if (this.briefText === text) return;
    this.briefText = text;
    const c = this.brief.getContext();
    c.fillStyle = "#eeece6";
    c.fillRect(0, 0, 1024, 512);
    c.fillStyle = "#f5f4ee";
    c.fillRect(30, 20, 960, 470);
    c.fillStyle = "#b0c9bd";
    c.fillRect(805, 22, 140, 28);
    c.fillStyle = "#616b69";
    c.font = "600 44px system-ui";
    c.fillText("SHARED BRIEF", 55, 62);
    c.fillStyle = "#263d45";
    c.font = "500 64px system-ui";
    const words = String(text || "What are we working on?")
      .slice(0, 180)
      .split(/\s+/);
    let line = "",
      y = 145;
    for (const word of words) {
      if (c.measureText(line + " " + word).width > 895 && line) {
        c.fillText(line, 55, y);
        y += 78;
        line = "";
        if (y > 425) break;
      }
      line += (line ? " " : "") + word;
    }
    if (y <= 425) c.fillText(line, 55, y);
    this.brief.update();
  }
  resize() {
    this.engine.resize();
    const aspect =
      this.engine.getRenderWidth() / Math.max(1, this.engine.getRenderHeight());
    // Perspective remains perspective. Portrait/short windows pull back to fit.
    const distance = Math.max(1, 1.38 / aspect);
    this.camera.position = V(4.2 * distance, 7.8 * distance, 13.0 * distance);
    this.camera.setTarget(V(0, 1.35, -0.65));
    // Resizing clears WebGL buffers. Repaint atomically with layout changes.
    if (this.ready) this.world.render();
    this.reportPositions();
  }
  present(view) {
    this.dirty = true;
    this.pendingView = view;
    if (!this.ready) return;
    this.setBrief(view.task);
    for (const p of this.people.values()) {
      const bound =
        p.role.name === "Human" || !!view.bindings?.[p.role.name]?.profile;
      const state = bound ? view.states[p.role.name] : "unconfigured";
      if (p.state !== state || !p.initialized) this.transition(p, state);
      p.ring.isVisible =
        view.selected === p.role.name ||
        state === "needs human" ||
        state === "unconfigured";
    }
    this.reportPositions();
  }
  play(p, pose) {
    if (p.targetClip === pose) return;
    p.targetClip = pose;
    p.pose = pose;
    const clip = p.clips.get(pose) || p.clips.get("idle");
    if (!clip.isPlaying) {
      // A paused group remains started; start() alone does not resume it.
      clip.stop();
      clip.start(
        !["sit", "stand", "send", "receive", "decision"].includes(pose),
        1,
        clip.from,
        clip.to,
      );
      clip.setWeightForAllAnimatables(0);
    }
    if (this.reducedMotion) {
      for (const g of p.clips.values()) {
        if (g !== clip) g.stop();
      }
      clip.setWeightForAllAnimatables(1);
      clip.goToFrame(clip.from);
      clip.pause();
    }
  }
  transition(p, state) {
    this.dirty = true;
    this.ambient.cancel(p.role.name);
    p.ambientAction = null;
    p.route = null;
    const joining = p.state === "unconfigured" && state !== "unconfigured";
    p.state = state;
    if (joining) {
      p.root.position.copyFrom(point(p.role.rest));
      p.seated = false;
      p.seatMotion = null;
    }
    if (!p.initialized && p.role.name === "Human") {
      p.root.position.copyFrom(point(p.role.seat));
      p.seated = true;
      p.root.rotation.y = p.role.station.yaw + Math.PI;
    }
    p.initialized = true;
    p.root.setEnabled(state !== "unconfigured");
    // The ring belongs to the station even before a persona is bound.
    const active = ["working", "reviewing", "needs human"].includes(state);
    p.portrait.intensity = active ? 0.42 : 0.22;
    p.home = point(
      (active && p.role.name !== "Human") ||
        p.role.name === "Human" ||
        state === "unconfigured"
        ? p.role.seat
        : p.role.rest,
    );
    p.settleAt = null;
    p.reactionUntil = null;
    p.departAt = null;
    p.semanticPose = POSE[state] || "idle";
    if (p.role.name === "Human")
      p.semanticPose =
        state === "needs human" ? "attention-seated" : "idle-seated";
    if (
      p.role.name === "Reviewer" &&
      ["ready", "waiting", "completed"].includes(state)
    )
      p.semanticPose = "tablet";
    this.move(
      p,
      p.home,
      (active && p.role.name !== "Human") || p.role.name === "Human"
        ? p.role.station.fixedSeat
          ? p.role.station.yaw + Math.PI
          : Math.atan2(
              p.role.monitor[0] - p.role.seat[0],
              p.role.monitor[2] - p.role.seat[2],
            )
        : p.role.station.restYaw,
      p.semanticPose,
    );
  }
  floor(v) {
    return [v.x, v.z];
  }
  obstacles() {
    const list = furniture(this.chairOffsets);
    for (const [role, p] of this.people) {
      const moving =
        p.seatMotion?.reserved &&
        ["pull", "roll", "exit-roll"].includes(p.seatMotion.phase);
      if (!p.role.station.fixedSeat && (moving || this.chairParks.has(role))) {
        const box = list.find((b) => b.id === role + "-chair");
        box.center = local(p.role.station, 0, LAYOUT.chairPull / 2);
        box.half = [0.63, 0.79 + LAYOUT.chairPull / 2];
      }
    }
    return list;
  }
  chair(role, offset) {
    if (LAYOUT.stations[role].fixedSeat) return;
    this.chairOffsets[role] = offset;
    const at = local(LAYOUT.stations[role], 0, offset);
    this.chairs.get(role).position.copyFrom(V(at[0], 0, at[1]));
  }
  chairClear(role) {
    const station = LAYOUT.stations[role],
      box = {
        center: local(station, 0, LAYOUT.chairPull / 2),
        half: [0.63, 0.79 + LAYOUT.chairPull / 2],
        yaw: station.yaw,
      };
    return [...this.people.values()].every(
      (p) =>
        p.role.name === role ||
        !p.root.isEnabled() ||
        !contains(this.floor(p.root.position), box),
    );
  }
  move(p, destination, facing, pose) {
    p.settleAt = null;
    p.departAt = null;
    p.route = null;
    p.navBlocked = false;
    const seated =
      destination.equalsWithEpsilon(point(p.role.seat), 0.01) &&
      p.state !== "unconfigured";
    p.goal = { destination: destination.clone(), facing, pose, seated };
    p.destination = destination.clone();
    p.facing = facing;
    p.finalPose = pose;
    if (this.reducedMotion || p.state === "unconfigured") {
      p.seatMotion = null;
      p.seated = seated;
      this.chairParks.delete(p.role.name);
      this.chair(p.role.name, 0);
      p.root.position.copyFrom(destination);
      p.root.rotation.y = facing;
      this.play(p, pose);
      return;
    }
    // A new semantic goal supersedes ambient intentions immediately. If a pelvis
    // is already inside a chair, finish a safe seat/exit transition, never teleport.
    if (p.seatMotion) return;
    this.resumeGoal(p);
  }
  resumeGoal(p) {
    if (p.role.station.fixedSeat) {
      if (p.seated && p.goal.seated) {
        this.play(p, p.goal.pose);
        return;
      }
      if (p.seated) {
        p.seatMotion = {
          phase: "stand",
          start: performance.now(),
          from: p.root.position.clone(),
        };
        this.play(p, "stand");
      } else if (p.goal.seated) {
        this.planWalk(p, point(p.role.approach), "dock");
      } else this.planWalk(p, p.goal.destination, "goal");
      return;
    }
    if (p.seated) {
      if (p.goal.seated) {
        this.play(p, p.goal.pose);
        return;
      }
      p.seatMotion = {
        phase: "exit-roll",
        start: performance.now(),
        offset: this.chairOffsets[p.role.name],
      };
      return;
    }
    if (p.goal.seated) {
      this.chairParks.delete(p.role.name);
      p.seatMotion = {
        phase: "pull",
        start: performance.now(),
        offset: this.chairOffsets[p.role.name],
      };
      this.play(p, "idle");
      return;
    }
    this.planWalk(p, p.goal.destination, "goal");
  }
  planWalk(p, target, kind) {
    p.routeKind = kind;
    p.walkTarget = target.clone();
    const path = route(
      this.floor(p.root.position),
      this.floor(target),
      this.obstacles(),
    );
    p.navBlocked = !path;
    p.route = path?.map(([x, z]) => V(x, 0, z)) || null;
    p.retryAt = performance.now() + 350;
    if (path && B.Vector3.Distance(p.root.position, target) < 0.01) {
      this.arrive(p, performance.now());
      return;
    }
    if (path) this.play(p, "walk"); // No unsafe straight-line fallback.
  }
  arrive(p, now) {
    p.route = null;
    p.navBlocked = false;
    if (p.routeKind === "dock" && p.goal.seated) {
      p.root.rotation.y = p.role.station.yaw + Math.PI;
      p.seatMotion = {
        phase: "sit",
        start: now,
        from: p.root.position.clone(),
      };
      this.play(p, "sit");
      return;
    }
    if (p.routeKind === "dock") {
      this.resumeGoal(p);
      return;
    }
    p.root.rotation.y = p.goal.facing;
    this.play(p, p.goal.pose);
    const ambient = this.ambient.people.get(p.role.name);
    if (p.ambientAction && ambient) ambient.until = now + 8500;
    if (p.goal.pose === "pour") {
      p.finalPose = "coffee";
      p.settleAt = now + 2200;
    }
  }
  seatStep(p, now) {
    const m = p.seatMotion;
    if (!m) return false;
    const station = p.role.station,
      role = p.role.name;
    if (station.fixedSeat) {
      const u = Math.min(1, (now - m.start) / 850);
      const target = point(m.phase === "sit" ? p.role.seat : p.role.approach);
      // Only the actor's own bench is an interaction surface. Other furniture
      // remains solid; this short front-entry corridor never crosses the table.
      const solid = this.obstacles().filter((o) => o.id !== role + "-chair");
      if (!clearSegment(this.floor(m.from), this.floor(target), solid)) {
        m.start = now;
        return true;
      }
      p.root.position.copyFrom(
        B.Vector3.Lerp(m.from, target, u * u * (3 - 2 * u)),
      );
      if (u === 1) {
        p.seatMotion = null;
        p.seated = m.phase === "sit";
        this.resumeGoal(p);
      }
      return true;
    }
    const duration = ["sit", "stand"].includes(m.phase) ? 700 : 650;
    const u = Math.min(1, (now - m.start) / duration),
      ease = u * u * (3 - 2 * u);
    const at = (z) => {
      const q = local(station, 0, z);
      return V(q[0], 0, q[1]);
    };
    if (["pull", "exit-roll", "roll"].includes(m.phase)) {
      if (!m.reserved) {
        m.start = now;
        m.offset = this.chairOffsets[role];
        if (!this.chairClear(role)) return true;
        m.reserved = true;
        return true;
      }
      const end = m.phase === "roll" ? 0 : LAYOUT.chairPull;
      this.chair(role, m.offset + (end - m.offset) * ease);
      if (m.phase !== "pull")
        p.root.position.copyFrom(at(this.chairOffsets[role]));
    } else {
      p.root.position.copyFrom(
        B.Vector3.Lerp(
          m.from,
          at(m.phase === "sit" ? LAYOUT.chairPull : LAYOUT.dock),
          ease,
        ),
      );
    }
    if (u < 1) return true;
    p.seatMotion = null;
    if (m.phase === "pull") {
      if (p.goal.seated) this.planWalk(p, at(LAYOUT.dock), "dock");
      else this.resumeGoal(p);
    } else if (m.phase === "sit") {
      p.seated = true;
      this.play(p, p.goal.seated ? p.goal.pose : "idle-seated");
      p.seatMotion = {
        phase: p.goal.seated ? "roll" : "exit-roll",
        start: now,
        offset: this.chairOffsets[role],
      };
    } else if (m.phase === "roll") {
      p.seated = true;
      this.resumeGoal(p);
      const ambient = this.ambient.people.get(role);
      if (p.ambientAction && ambient) ambient.until = now + 8500;
    } else if (m.phase === "exit-roll") {
      p.seatMotion = {
        phase: "stand",
        start: now,
        from: p.root.position.clone(),
      };
      this.play(p, "stand");
    } else {
      p.seated = false;
      this.resumeGoal(p);
    }
    return true;
  }
  parkChairs(now) {
    for (const [role, offset] of Object.entries(this.chairOffsets)) {
      const p = this.people.get(role);
      if (!offset || p.seated || p.seatMotion || p.goal?.seated) continue;
      const station = p.role.station,
        box = {
          center: local(station, 0, LAYOUT.chairPull / 2),
          half: [0.63, 0.79 + LAYOUT.chairPull / 2],
          yaw: station.yaw,
        };
      if (
        [...this.people.values()].some(
          (a) =>
            a.root.isEnabled() && contains(this.floor(a.root.position), box),
        )
      ) {
        this.chairParks.delete(role);
        continue;
      }
      if (!this.chairParks.has(role))
        this.chairParks.set(role, { start: now, offset });
      const m = this.chairParks.get(role),
        u = Math.min(1, (now - m.start) / 650);
      this.chair(role, m.offset * (1 - u));
      if (u === 1) this.chairParks.delete(role);
    }
  }
  ambientAction(p, action) {
    p.ambientAction = action;
    const destinations = {
      ...Object.fromEntries(
        Object.entries(LAYOUT.destinations).map(([k, [x, z]]) => [
          k,
          [x, 0, z],
        ]),
      ),
      laptop: p.role.seat,
      sit: p.role.seat,
      monitor: p.role.seat,
    };
    const poses = {
      coffee: "pour",
      board: p.role.name === "Human" ? "observing" : "tablet",
      window: "look-around",
      tablet: "tablet",
      phone: p.seated ? "attention-seated" : "phone",
      stretch: "stretch",
      monitor: "thinking",
      laptop: "idle-seated",
      sit: "idle-seated",
      skeptical: "skeptical",
      "look-around": p.seated ? "idle-seated" : "look-around",
    };
    this.move(
      p,
      action && destinations[action] ? point(destinations[action]) : p.home,
      (!action && p.role.name === "Human") ||
        (action && ["laptop", "sit", "monitor"].includes(action))
        ? p.role.station.yaw + Math.PI
        : action && destinations[action]
          ? Math.PI
          : p.role.station.restYaw,
      poses[action] || p.semanticPose,
    );
  }
  project(pos) {
    return B.Vector3.Project(
      pos,
      B.Matrix.Identity(),
      this.world.getTransformMatrix(),
      this.camera.viewport.toGlobal(
        this.engine.getRenderWidth(),
        this.engine.getRenderHeight(),
      ),
    );
  }
  reportPositions() {
    if (!this.ready) return;
    this.callbacks.onPositions?.(
      [...this.people.values()].map((p) => {
        const at = this.project(p.root.position.add(V(0, 1.45, 0)));
        return {
          name: p.role.name,
          x: at.x,
          y: at.y,
          state: p.state,
          pose: p.pose,
          ambientAction: p.ambientAction,
          currentActivity: p.currentActivity,
          worldX: p.root.position.x,
          worldY: p.root.position.z,
        };
      }),
      this.project(this.board.position),
    );
  }
  update() {
    if (!this.ready) return;
    const now = performance.now();
    // Travel follows elapsed presentation time, including a slow software GPU.
    // A frame-rate drop must not turn a short walk into a minute-long animation.
    const dt = Math.min(5, (now - (this.lastUpdate ?? now - 33)) / 1000);
    this.lastUpdate = now;
    this.parkChairs(now);
    for (const p of this.people.values()) {
      const interacting = this.seatStep(p, now);
      if (!interacting && p.navBlocked && now >= p.retryAt)
        this.planWalk(p, p.walkTarget, p.routeKind);
      if (!interacting && p.route?.length) {
        let travel =
          dt *
          (p.role.name === "Reviewer"
            ? 2.5
            : p.role.name === "Human"
              ? 2.7
              : 3.1);
        while (p.route.length && travel > 0) {
          const target = p.route[0],
            delta = target.subtract(p.root.position),
            distance = delta.length();
          const next =
            distance <= travel
              ? target
              : p.root.position.add(delta.scale(travel / distance));
          // Revalidate against moving chairs. Large/slow frames cannot tunnel.
          if (
            !clearSegment(
              this.floor(p.root.position),
              this.floor(next),
              this.obstacles(),
            )
          ) {
            this.planWalk(p, p.walkTarget, p.routeKind);
            break;
          }
          if (distance > 0.001)
            p.root.rotation.y = lerpAngle(
              p.root.rotation.y,
              Math.atan2(delta.x, delta.z),
              Math.min(1, dt * 12),
            );
          p.root.position.copyFrom(next);
          if (distance <= travel) {
            p.route.shift();
            travel -= distance;
          } else travel = 0;
        }
        if (p.route && !p.route.length) this.arrive(p, now);
      } else if (!interacting && !p.navBlocked) {
        const action = this.ambient.step(
          p.role.name,
          p.state,
          now,
          this.reducedMotion,
        );
        if (action !== p.ambientAction) this.ambientAction(p, action);
      }
      for (const [name, clip] of p.clips) {
        const target = name === p.targetClip ? 1 : 0,
          old = p.weights.get(name) || 0;
        const weight = this.reducedMotion
          ? target
          : old + (target - old) * Math.min(1, dt * 9);
        p.weights.set(name, weight);
        if (clip.isPlaying) {
          clip.setWeightForAllAnimatables(weight);
          if (weight < 0.001 && !target) clip.stop();
        }
      }
      if (p.settleAt && now >= p.settleAt) {
        p.settleAt = null;
        this.play(p, p.finalPose);
      }
      if (p.reactionUntil && now >= p.reactionUntil) {
        p.reactionUntil = null;
        this.play(p, p.semanticPose);
      }
      p.cup.isVisible = ["coffee", "pour"].includes(p.pose);
      for (const mesh of p.result.meshes) {
        if (mesh.name.startsWith("review-pad"))
          mesh.isVisible = ["reviewing", "tablet", "skeptical"].includes(
            p.pose,
          );
        if (mesh.name.startsWith("score-"))
          mesh.isVisible = [
            "idle",
            "idle-seated",
            "observing",
            "completed",
            "phone",
            "notification",
            "attention-seated",
            "decision",
          ].includes(p.pose);
      }
      p.currentActivity = this.activities.step(
        p.role.name,
        p.state,
        this.pendingView?.activities?.[p.role.name],
        now,
        this.pendingView?.replay,
      );
      const a = p.currentActivity;
      p.bubble.hidden = !a;
      if (a) {
        p.bubbleTitle.textContent = a.text;
        p.bubbleDetail.textContent = a.detail || "";
        const at = this.project(p.root.position.add(V(0, 3.1, 0)));
        p.bubble.style.left = `${Math.max(115, Math.min(this.parent.clientWidth - 115, at.x))}px`;
        p.bubble.style.top = `${Math.max(80, at.y)}px`;
      }
    }
    this.updateMessages(now);
    if (!this.lastReport || now - this.lastReport > 100) {
      this.reportPositions();
      this.lastReport = now;
    }
  }
  // Protocol integration is below; no animation manufactures a send or receive.
  message(m, { replay = false } = {}) {
    if (
      !this.ready ||
      !m ||
      m.send_id == null ||
      this.messageVersions.get(m.id) === m.version
    )
      return;
    this.messageVersions.set(m.id, m.version);
    const from = this.people.get(m.from),
      to = this.people.get(m.to);
    if (!from || !to) return;
    if (to.ambientAction && m.receive_id != null && !m.control)
      this.transition(to, to.state);
    let token = this.messages.get(m.id);
    if (token) {
      token.envelope = m;
      this.messageReceipt(token);
      return;
    }
    if (replay && m.receive_id != null) return;
    const cadence = this.activities.people.get(m.from);
    if (cadence) cadence.current = cadence.pending = null;
    const mesh = B.MeshBuilder.CreateBox(
      "protocol-" + m.id,
      {
        width: m.control ? 0.28 : 0.68,
        height: m.control ? 0.28 : 0.86,
        depth: 0.07,
      },
      this.world,
    );
    const material = new B.StandardMaterial("envelope-" + m.id, this.world);
    material.diffuseColor = new B.Color3(0.97, 0.91, 0.76);
    material.specularColor = B.Color3.Black();
    mesh.material = material;
    const label = new B.DynamicTexture(
      "envelope-label",
      { width: 256, height: 320 },
      this.world,
      false,
    );
    label.vScale = -1;
    label.vOffset = 1;
    const c = label.getContext();
    c.fillStyle = "#fff1d3";
    c.fillRect(0, 0, 256, 320);
    c.fillStyle = "#" + from.role.color.toString(16);
    c.fillRect(0, 0, 256, 30);
    c.fillStyle = "#263d50";
    c.font = "bold 30px system-ui";
    c.fillText(String(m.label).slice(0, 13), 16, 100);
    c.font = "23px system-ui";
    c.fillText("#" + (m.seq ?? ""), 16, 145);
    label.update();
    material.diffuseTexture = label;
    mesh.receiveShadows = true;
    this.shadows.addShadowCaster(mesh);
    mesh.metadata = { select: { message: m.id } };
    token = {
      mesh,
      material,
      label,
      envelope: m,
      from,
      to,
      started: performance.now(),
      start: from.root.position.add(V(0, 2, 0)),
      arrived: this.reducedMotion || replay,
    };
    this.messages.set(m.id, token);
    this.messageReceipt(token);
    this.gesture(from, from.role.name === "Human" ? "decision" : "send");
  }
  messageReceipt(token) {
    this.dirty = true;
    if (token.envelope.control) return;
    const c = token.label.getContext();
    c.fillStyle = "#fff1d3";
    c.fillRect(0, 180, 256, 140);
    c.fillStyle = "#53636b";
    c.font = "22px system-ui";
    c.fillText(
      token.envelope.receive_id != null ? "Received" : "Pending receive",
      16,
      220,
    );
    token.label.update();
  }
  gesture(p, pose) {
    if (
      this.reducedMotion ||
      p.route ||
      p.seatMotion ||
      p.seated ||
      p.state === "needs human" ||
      ["working", "reviewing"].includes(p.state)
    )
      return;
    this.play(p, pose);
    p.reactionUntil = performance.now() + 900;
  }
  updateMessages(now) {
    const queues = new Map();
    for (const t of this.messages.values()) {
      const key = t.envelope.to;
      if (!queues.has(key)) queues.set(key, []);
      queues.get(key).push(t);
    }
    for (const queue of queues.values()) {
      queue.sort((a, b) => (a.envelope.seq ?? 0) - (b.envelope.seq ?? 0));
      queue.forEach((t, i) => {
        const end = t.to.root.position.add(V(0.75 + i * 0.1, 1.7 + i * 0.1, 0));
        const progress = this.reducedMotion
          ? 1
          : Math.min(1, (now - t.started) / 950);
        t.mesh.position.copyFrom(B.Vector3.Lerp(t.start, end, progress));
        t.mesh.position.y += Math.sin(progress * Math.PI) * 1.3;
        t.mesh.lookAt(this.camera.position);
        t.mesh.isVisible = i < 3;
        if (progress >= 1 && !t.arrived) {
          t.arrived = true;
          this.gesture(t.to, "receive");
        }
        if (t.arrived && t.envelope.receive_id != null) {
          t.receivedAt ??= now;
          if (now - t.receivedAt > 4000) this.removeMessage(t.envelope.id);
        }
      });
    }
  }
  removeMessage(id) {
    this.dirty = true;
    const t = this.messages.get(id);
    if (!t) return;
    this.shadows.removeShadowCaster(t.mesh);
    t.mesh.dispose();
    t.material.dispose();
    t.label.dispose();
    this.messages.delete(id);
  }
  resetMessages() {
    for (const id of this.messages.keys()) this.removeMessage(id);
    this.messageVersions.clear();
    this.ambient.reset();
    this.activities.reset();
    for (const p of this.people.values()) {
      p.currentActivity = null;
      p.bubble.hidden = true;
      this.transition(p, p.state);
    }
  }
  setReducedMotion(value) {
    this.dirty = true;
    this.reducedMotion = value;
    this.ambient.reset();
    for (const p of this.people.values()) {
      p.targetClip = null;
      this.transition(p, p.state);
    }
  }
  inspect() {
    return {
      ready: this.ready,
      renderer: "Babylon.WebGL",
      art: "stylized-cafe-3d-v3",
      reducedMotion: this.reducedMotion,
      viewport: {
        width: this.engine.getRenderWidth(),
        height: this.engine.getRenderHeight(),
        cameraWidth: this.engine.getRenderWidth(),
      },
      messages: [...this.messages.keys()],
      envelopes: [...this.messages.values()].map((t) => ({
        ...t.envelope,
        arrived: t.arrived,
      })),
      participants: [...this.people.values()].map((p) => ({
        role: p.role.name,
        state: p.state,
        pose: p.pose,
        frame: p.pose,
        ambientAction: p.ambientAction,
        currentActivity: p.currentActivity,
        x: p.root.position.x,
        y: p.root.position.z,
        moving: !!p.route || !!p.seatMotion,
        seated: !!p.seated,
        interaction: p.seatMotion?.phase || null,
        navigationBlocked: !!p.navBlocked,
        visible: p.root.isEnabled(),
        clips: [...p.clips.keys()],
        rigs: p.result.skeletons.length,
        lighting: {
          contact: this.environment.meshes.some(
            (m) => m.name === "warm-floor" && m.receiveShadows,
          ),
          cast: p.result.meshes.some((m) =>
            this.shadows.getShadowMap().renderList.includes(m),
          ),
          received: p.result.meshes
            .filter((m) => m.getTotalVertices())
            .every((m) => m.receiveShadows),
        },
      })),
    };
  }
  dispose() {
    this.observer.disconnect();
    this.engine.stopRenderLoop();
    for (const p of this.people.values()) p.bubble.remove();
    this.world.dispose();
    this.engine.dispose();
    this.canvas.remove();
  }
}
export function launchRoom(parent, callbacks = {}) {
  try {
    const scene = new Cafe3D(parent, callbacks);
    return { scene, dispose: () => scene.dispose() };
  } catch (error) {
    callbacks.onError?.(error);
    return {
      scene: { present() {}, resetMessages() {}, setReducedMotion() {} },
    };
  }
}
