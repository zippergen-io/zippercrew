import {
  AmbientDirector,
  ActivityCadence,
  AMBIENT_LABELS
} from '/presentation.js';
import {
  ROLE_DEFINITIONS,
  buildLayout,
  route,
  STUDIO_WIDTH, STUDIO_HEIGHT, FOREGROUND_POLYGONS
} from '/dollhouse-layout.js';
export const ROLES = ROLE_DEFINITIONS;
const P = window.Phaser;
const ASSETS = '/assets/dollhouse/';
const ACTIVE = new Set(['working', 'reviewing', 'needs human']);
const WORDS = {
  unconfigured: 'Choose agent',
  ready: 'Ready',
  working: 'Working',
  reviewing: 'Reviewing',
  waiting: 'Waiting',
  'needs human': 'Your turn',
  completed: 'Completed',
  failed: 'Failed',
  stopped: 'Stopped'
};
const textStyle = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: '16px',
  color: '#293e50'
};

// This scene is a consumer. No timer, gesture, arrival or animation enables a
// workflow action, acknowledges a message, or modifies a Room/Run record.
export class DollhouseRoom extends P.Scene {
  constructor(parent, callbacks = {}) {
    super({
      key: 'inhabited-room'
    });
    this.host = parent;
    this.callbacks = callbacks;
    this.ready = false;
    this.roles = callbacks.roles || ROLES;
    this.layout = buildLayout(this.roles);
    this.people = new Map();
    this.messages = new Map();
    this.messageVersions = new Map();
    this.ambient = new AmbientDirector();
    this.activities = new ActivityCadence();
    this.reducedMotion = !!callbacks.reducedMotion;
    this.pendingView = null;
    this.pan = 0;
  }
  preload() {
    this.load.image('linked-studio', ASSETS + 'linked-studio.png');
    this.load.atlas('patchwork', ASSETS + 'patchwork-cast.png', ASSETS + 'patchwork-cast.json');
    this.load.atlas('messages', ASSETS + 'messages.png', ASSETS + 'messages.json');
    this.load.on('loaderror', file => {
      this.loadFailed = true;
      this.callbacks.onError?.(new Error('Room asset could not load: ' + file.key));
    });
  }
  create() {
    if (this.loadFailed) return;
    this.world = this.add.container(0, 0);
    this.masks = [];
    for (let room = 0; room < this.layout.rooms; room++) {
      const x = room * STUDIO_WIDTH;
      const background = this.add.image(x, 0, 'linked-studio').setOrigin(0)
        .setCrop(0, 0, STUDIO_WIDTH, 711).setDepth(-100);
      this.world.add(background);
      const mask = this.add.graphics().fillStyle(0xffffff).setVisible(false);
      // Canvas geometry masks do not inherit a container's transform. Keep the
      // mask at the scene root and project it explicitly in resize().
      mask.beginPath();
      for (const poly of FOREGROUND_POLYGONS) {
        mask.moveTo(poly[0][0] + x, poly[0][1]);
        for (const [px, py] of poly.slice(1)) mask.lineTo(px + x, py);
        mask.closePath();
      }
      mask.fillPath();
      const foreground = this.add.image(x, 0, 'linked-studio').setOrigin(0)
        .setDepth(681).setMask(mask.createGeometryMask());
      this.world.add(foreground); this.masks.push(mask);
      this.label(x + 75, 764, room ? `Studio ${room + 1}` : 'Linked Studio', {
        fontSize: '21px', color: '#74625f'
      }).setDepth(900);
    }
    const board = this.add.zone(...this.layout.brief, 330, 170).setInteractive({ useHandCursor:true });
    this.world.add(board); board.setDepth(50).on('pointerdown', () => this.callbacks.onSelect?.('brief'));
    this.briefText = this.label(810, 260, 'Shared brief', {
      fontSize: '19px', color: '#494139', backgroundColor: '#fff4dd',
      padding: { x: 12, y: 9 }, wordWrap: { width: 235 }, lineSpacing: 5,
    }).setDepth(6);
    for (const role of this.roles) this.createPerson(role);
    this.scale.on('resize', () => this.resize());
    this.input.on('wheel', (_pointer, _objects, dx, dy) => {
      if (this.layout.width > STUDIO_WIDTH) {
        this.pan = Math.max(0, Math.min(this.layout.width - STUDIO_WIDTH, this.pan + (dx || dy)));
        this.resize();
      }
    });
    this.ready = true;
    this.resize();
    if (this.pendingView) this.present(this.pendingView);
    this.callbacks.onReady?.(this);
    this.events.once('shutdown', () => {
      this.observer?.disconnect();
      this.masks.forEach(mask => mask.destroy());
      for (const p of this.people.values()) p.bubble.remove();
    });
    this.observer = new ResizeObserver(() => {
      const w = Math.max(1, this.host.clientWidth),
        h = Math.max(1, this.host.clientHeight);
      if (this.scale.width !== w || this.scale.height !== h) this.scale.resize(w, h);
    });
    this.observer.observe(this.host);
  }
  art(key, frame, x, y, w, h, depth) {
    const obj = this.add.image(x, y, key, frame).setOrigin(.5, 1).setDisplaySize(w, h).setDepth(depth);
    this.world.add(obj);
    return obj;
  }
  label(x, y, value, style = {}) {
    const obj = this.add.text(x, y, value, {
      ...textStyle,
      ...style
    });
    this.world.add(obj);
    return obj;
  }
  createPerson(role) {
    const station = this.layout.stations.get(role.name);
    const [x, y] = station.rest;
    const shadow = this.add.ellipse(x, y + 2, 115, 16, 0x68472f, .12);
    this.world.add(shadow);
    const frame = role.key === 'human' ? 'human-orchestrating' : role.key;
    const sprite = this.add.sprite(x, y, 'patchwork', frame).setOrigin(.5, 1);
    this.world.add(sprite);
    // A small reusable mug, shown only during an observable coffee action.
    const cup = this.add.graphics().fillStyle(0xfff2d5).lineStyle(3, 0x38332f);
    cup.strokeCircle(21, -15, 9).fillRoundedRect(-14, -31, 31, 32, 5)
      .strokeRoundedRect(-14, -31, 31, 32, 5);
    cup.setVisible(false); this.world.add(cup);
    const eyelids = role.key === 'human' ? this.add.graphics().setVisible(false) : null;
    if (eyelids) this.world.add(eyelids);
    sprite.setInteractive({
      useHandCursor: true
    }).on('pointerdown', () => this.callbacks.onSelect?.(role.name));
    const label = this.label(x, 742, '', {
      fontSize: '21px',
      fontStyle: '600',
      align: 'center'
    }).setOrigin(.5).setDepth(900);
    label.setInteractive({
      useHandCursor: true
    }).on('pointerdown', () => this.callbacks.onSelect?.(role.name));
    const hit = this.add.zone(x, y - 120, 155, 265).setInteractive({
      useHandCursor: true
    });
    this.world.add(hit);
    hit.setDepth(850).on('pointerdown', () => this.callbacks.onSelect?.(role.name));
    const bubble = document.createElement('div');
    bubble.className = 'work-bubble';
    bubble.hidden = true;
    const title = document.createElement('strong'),
      detail = document.createElement('small');
    bubble.append(title, detail);
    this.host.append(bubble);
    const p = {
      role,
      station,
      x,
      y,
      sprite,
      shadow,
      cup,
      eyelids,
      nextBlink: performance.now() + 2400 + this.people.size * 1100,
      label,
      hit,
      bubble,
      bubbleTitle: title,
      bubbleDetail: detail,
      state: 'unconfigured',
      pose: 'idle',
      semanticPose: 'idle',
      ambientAction: null,
      currentActivity: null,
      path: [],
      seated: false,
      phase: this.people.size * 1.7,
      frame,
      height: role.key === 'human' ? 354 : role.key === 'implementer' ? 306 : 320,
      scale: (role.key === 'human' ? 354 : role.key === 'implementer' ? 306 : 320) / sprite.height,
      behaviorSince: performance.now(),
      ambientHistory: [],
      protocolUntil: 0
    };
    this.people.set(role.name, p);
    this.transition(p, role.name === 'Human' ? 'ready' : 'unconfigured');
  }
  resize() {
    if (!this.world) return;
    const w = this.scale.width,
      h = this.scale.height;
    this.zoom = Math.min(Math.max(w, 960) / STUDIO_WIDTH, h / STUDIO_HEIGHT);
    this.offsetX = (w - STUDIO_WIDTH * this.zoom) / 2 - this.pan * this.zoom;
    this.offsetY = (h - STUDIO_HEIGHT * this.zoom) / 2;
    this.world.setPosition(this.offsetX, this.offsetY).setScale(this.zoom);
    for (const mask of this.masks) mask.setPosition(this.offsetX, this.offsetY).setScale(this.zoom);
    this.reportPositions();
  }
  project(x, y) {
    return {
      x: this.offsetX + x * this.zoom,
      y: this.offsetY + y * this.zoom
    };
  }
  present(view) {
    this.pendingView = view;
    if (!this.ready) return;
    const task = (view.task || 'What are we working on?').replace(/\s+/g, ' ').trim();
    this.briefText.setText('Shared brief\n' + (task.length > 60 ? task.slice(0, 57) + '…' : task));
    for (const p of this.people.values()) {
      const bound = p.role.name === 'Human' || !!view.bindings?.[p.role.name]?.profile;
      const state = bound ? (view.states?.[p.role.name] || 'ready') : 'unconfigured';
      if (p.state !== state) this.transition(p, state);
    }
    if (view.selected !== this.lastSelection && this.people.has(view.selected) && this.layout.width > STUDIO_WIDTH) {
      this.pan = Math.max(0, Math.min(this.layout.width - STUDIO_WIDTH, this.people.get(view.selected).x - STUDIO_WIDTH / 2));
      this.resize();
    }
    this.lastSelection = view.selected;
    this.reportPositions();
  }
  basePose(p) {
    if (p.state === 'needs human') return 'attention-seated';
    if (['working', 'reviewing', 'completed', 'failed', 'stopped'].includes(p.state))
      return ['failed', 'stopped'].includes(p.state) ? 'stopped' : p.state;
    return p.role.key === 'reviewer' ? 'tablet' : p.role.key === 'human' ? 'observing' : 'idle';
  }
  transition(p, state) {
    this.ambient.cancel(p.role.name);
    p.ambientAction = null;
    p.reactionUntil = 0;
    p.protocolUntil = 0;
    p.behaviorSince = performance.now();
    p.cup.setVisible(false);
    p.eyelids?.setVisible(false);
    p.state = state;
    p.semanticPose = this.basePose(p);
    p.currentActivity = null;
    p.bubble.hidden = true;
    p.sprite.setVisible(state !== 'unconfigured');
    p.shadow.setVisible(state !== 'unconfigured');
    p.sprite.clearTint();
    const seated = ACTIVE.has(state) && p.station.kind === 'desk';
    this.move(p, seated ? p.station.seat : p.station.rest, p.semanticPose, seated);
    p.label.setText(p.role.name + ' · ' + WORDS[state]);
    this.reportPositions();
  }
  move(p, destination, pose, seated = false) {
    const path = route([p.x, p.y], destination, this.layout);
    p.target = [...destination];
    p.finalPose = pose;
    p.willSit = seated;
    p.seated = false;
    p.navigationBlocked = path === null;
    p.path = path || [];
    if (path && (this.reducedMotion || Math.hypot(p.x - destination[0], p.y - destination[1]) < 1)) {
      [p.x, p.y] = destination;
      p.path = [];
      p.pose = pose;
      p.arrivedAt = performance.now();
      p.seated = seated;
      p.sprite.setFlipX(false);
    } else p.pose = p.path.length ? 'walk' : pose;
  }
  ambientAction(p, action) {
    if (ACTIVE.has(p.state) || ['unconfigured', 'failed', 'stopped'].includes(p.state)) return;
    p.ambientAction = action;
    p.behaviorSince = performance.now();
    p.ambientHistory = [...p.ambientHistory.slice(-7), action].filter(Boolean);
    const target = p.station.destinations[action];
    const pose = action === 'coffee' ? 'coffee' : action?.startsWith('read') || action === 'check-card' ? 'tablet' :
      action === 'listen' ? 'observing' : action || p.semanticPose;
    this.move(p, target || p.station.rest, pose, false);
  }
  frameFor(p) {
    if (p.role.key !== 'human') return p.role.key;
    return p.pose === 'receive' || p.pose === 'attention-seated' || p.ambientAction === 'listen' ||
      ['working', 'reviewing'].includes(p.state) || p.ambientAction === 'read-notes' ||
      p.ambientAction === 'reflect' ? 'human-orchestrating' : 'human-neutral';
  }
  interruptAmbient(p, now) {
    this.ambient.cancel(p.role.name);
    p.ambientAction = null;
    p.cup.setVisible(false);
    p.protocolUntil = now + 2400;
    p.behaviorSince = now;
    this.move(p, p.station.seat, p.semanticPose, ACTIVE.has(p.state) && p.station.kind === 'desk');
  }
  animatePerson(p, now) {
    const t = (now - p.behaviorSince) / 1000;
    const moving = p.path.length > 0 && !p.yielding;
    const action = p.ambientAction;
    const pulse = (period, length) => {
      const at = (t + p.phase) % period;
      return at < length ? Math.sin(at / length * Math.PI) : 0;
    };
    let bob = 0, lean = 0, stretch = 0;
    if (!this.reducedMotion && p.state !== 'unconfigured') {
      if (moving) { bob = Math.sin(t * 10) * 2.2; lean = Math.sin(t * 5) * 1.3; }
      else if (['working', 'reviewing'].includes(p.state)) {
        const beat = pulse(p.role.key === 'implementer' ? 3.7 : 6.1, 1.1);
        lean = beat * (p.role.key === 'reviewer' ? -1.2 : 1.3); bob = -beat * 1.5;
      } else if (action === 'organize' || action === 'check-tool' || action === 'check-card') {
        lean = pulse(5.9, 1.4) * 1.7; bob = -pulse(5.9, 1.4) * 2;
      } else if (action?.startsWith('read') || action === 'reflect' || action === 'think') {
        lean = -.8 + pulse(8.7, 2.3) * 1.6;
      } else if (action === 'window' || action === 'board') {
        lean = -1.1 + pulse(9.3, 1.8); stretch = -.004;
      } else if (action === 'listen') lean = pulse(7.3, 1.9) * 1.2;
      else if (p.state === 'completed' && t < 1.2) bob = -Math.sin(t / 1.2 * Math.PI) * 5;
      stretch += Math.sin(t * 1.3 + p.phase) * .003;
    }
    const frame = this.frameFor(p);
    if (p.frame !== frame) { p.sprite.setFrame(frame); p.frame = frame; p.scale = p.height / p.sprite.height; }
    p.sprite.setPosition(p.x, p.y + bob).setScale(p.scale * (1 + stretch), p.scale * (1 - stretch)).setAngle(lean);
    p.sprite.setDepth(p.y);
    if (p.eyelids) {
      if (now > p.nextBlink + 150) p.nextBlink = now + 3500 + Math.random() * 4000;
      const blink = !this.reducedMotion && p.sprite.visible && now >= p.nextBlink;
      p.eyelids.setVisible(blink);
      if (blink) {
        // Tiny eyelid overlays animate the existing face; source art is intact.
        const neutral = frame === 'human-neutral';
        const eyes = neutral ? [[194.5,429],[281.5,428]] : [[632.5,424],[721.5,419.5]];
        const source = neutral ? {x:35,y:220,w:405,h:555} : {x:441,y:210,w:428,h:566};
        p.eyelids.clear().fillStyle(0xfdcba2).lineStyle(3.2, 0x29221e);
        for (const [ex,ey] of eyes) {
          const x=ex-source.x-source.w/2, y=ey-source.y-source.h;
          p.eyelids.fillEllipse(x,y,23,27).lineBetween(x-7,y,x+7,y);
        }
        p.eyelids.setPosition(p.sprite.x,p.sprite.y)
          .setScale(p.sprite.scaleX * (p.sprite.flipX ? -1 : 1),p.sprite.scaleY)
          .setAngle(lean).setDepth(p.y+.5);
      }
    }
    p.shadow.setPosition(p.x, p.y + 2).setDepth(p.y - 2);
    const drinking = action === 'coffee' && !moving && !this.reducedMotion;
    p.cup.setVisible(drinking);
    if (drinking) {
      const sip = pulse(7.9, 2.1);
      p.cup.setPosition(p.x - p.sprite.displayWidth * (.22 - sip * .18), p.y - p.height * (.33 + sip * .23))
        .setAngle(sip * -16).setDepth(p.y + 1);
    }
    p.motion = { bob, lean, stretch, drinking };
  }
  update(_time, delta) {
    if (!this.ready) return;
    const now = performance.now(),
      dt = Math.min(delta / 1000, .1);
    for (const p of this.people.values()) {
      let travel = dt * (p.role.key === 'reviewer' ? 115 : 145);
      p.yielding = false;
      if (p.path.length && p.ambientAction) {
        // The reservation also covers the walk home after a shared excursion.
        // A queued walker reads/thinks locally until the aisle is free.
        const owner = this.ambient.reservations.get('back-aisle');
        if (owner && owner !== p.role.name) { travel = 0; p.yielding = true; }
        else this.ambient.reservations.set('back-aisle', p.role.name);
      }
      while (p.path.length && travel > 0) {
        const next = p.path[0],
          dx = next[0] - p.x,
          dy = next[1] - p.y,
          distance = Math.hypot(dx, dy);
        p.sprite.setFlipX(dx < -.5);
        if (distance <= travel) {
          [p.x, p.y] = next;
          p.path.shift();
          travel -= distance;
        } else {
          p.x += dx / distance * travel;
          p.y += dy / distance * travel;
          travel = 0;
        }
        if (!p.path.length) {
          p.pose = p.finalPose;
          p.arrivedAt = now;
          p.seated = p.willSit;
          p.sprite.setFlipX(false);
          if (!this.ambient.people.get(p.role.name)?.resource &&
              this.ambient.reservations.get('back-aisle') === p.role.name)
            this.ambient.reservations.delete('back-aisle');
        }
      }
      // Work and observed communication always preempt cosmetic routines.
      const ambient = now < p.protocolUntil ? null :
        this.ambient.step(p.role.name, p.state, now, this.reducedMotion, p.role.key);
      if (ambient !== p.ambientAction) this.ambientAction(p, ambient);
      if (p.reactionUntil && now > p.reactionUntil) {
        p.reactionUntil = 0;
        p.pose = p.path.length ? 'walk' : p.ambientAction || p.semanticPose;
      }
      this.animatePerson(p, now);
      p.label.setPosition(p.x, 742);
      p.hit.setPosition(p.x, p.y - 120);
      p.currentActivity = this.activities.step(p.role.name, p.state, this.pendingView?.activities?.[p.role.name], now, this.pendingView?.replay);
      const ambientAge = now - Math.max(p.behaviorSince, p.arrivedAt || 0);
      const ambientLabel = p.ambientAction && !p.path.length && ambientAge < 4200
        ? { text: AMBIENT_LABELS[p.ambientAction], detail: '', kind: 'ambient' } : null;
      const a = p.currentActivity || ambientLabel;
      p.displayActivity = a;
      p.bubble.dataset.kind = a?.kind || 'work';
      p.bubble.hidden = !a;
      if (a) {
        p.bubbleTitle.textContent = a.text;
        p.bubbleDetail.textContent = a.detail || '';
        const at = this.project(p.x, p.y - p.height - 32);
        p.bubble.style.left = Math.max(120, Math.min(this.host.clientWidth - 120, at.x)) + 'px';
        p.bubble.style.top = Math.max(75, at.y) + 'px';
      }
    }
    this.updateMessages(now);
    this.world.sort('depth');
    if (!this.lastReport || now - this.lastReport > 100) {
      this.reportPositions();
      this.lastReport = now;
    }
  }
  reportPositions() {
    if (!this.ready) return;
    this.callbacks.onPositions?.([...this.people.values()].map(p => ({
      name: p.role.name,
      state: p.state,
      pose: p.pose,
      ambientAction: p.ambientAction,
      currentActivity: p.currentActivity,
      ambientActivity: p.displayActivity?.kind === 'ambient' ? p.displayActivity : null,
      worldX: p.x,
      worldY: p.y,
      ...this.project(p.x, p.y - 120)
    })), this.project(...this.layout.brief));
  }
  message(m, {
    replay = false
  } = {}) {
    if (!this.ready || !m || m.send_id == null || this.messageVersions.get(m.id) === m.version) return;
    this.messageVersions.set(m.id, m.version);
    const from = this.people.get(m.from),
      to = this.people.get(m.to);
    if (!from || !to) return;
    if (!replay && !m.control) {
      const now = performance.now();
      if (!ACTIVE.has(from.state)) this.interruptAmbient(from, now);
      if (!ACTIVE.has(to.state)) this.interruptAmbient(to, now);
    }
    const existing = this.messages.get(m.id);
    if (existing) {
      existing.envelope = m;
      this.messageReceipt(existing);
      return;
    }
    if (replay && m.receive_id != null) return;
    const cadence = this.activities.people.get(m.from);
    if (cadence) cadence.current = cadence.pending = null;
    const label = String(m.label || 'Message');
    const kind = m.control ? 'control' : /proposal/i.test(label) ? 'proposal' : /review|critique/i.test(label) ? 'review' :
      /guidance/i.test(label) ? 'guidance' : /task/i.test(label) ? 'task' : 'control';
    const start = [from.x + 100, from.y - from.height * .65];
    const card = this.add.container(...start).setDepth(1000);
    this.world.add(card);
    const sprite = this.add.image(0, 0, 'messages', kind).setDisplaySize(m.control ? 60 : 154, m.control ? 60 : 130);
    const title = this.add.text(0, -10, label.slice(0, 22), {
      ...textStyle,
      fontSize: '20px',
      fontStyle: 'bold',
      backgroundColor: '#fff4dc'
    }).setOrigin(.5);
    const status = this.add.text(0, 38, '', {
      ...textStyle,
      fontSize: '17px',
      backgroundColor: '#fff4dc'
    }).setOrigin(.5);
    card.add([sprite, title, status]);
    sprite.setInteractive({
      useHandCursor: true
    }).on('pointerdown', () => this.callbacks.onSelect?.({
      message: m.id
    }));
    const now = performance.now();
    const channel = [...this.messages.values()].filter(t => t.envelope.from === m.from && t.envelope.to === m.to);
    const started = Math.max(now, ...channel.map(t => t.started + 180));
    const token = {
      card,
      title,
      status,
      envelope: m,
      from,
      to,
      start,
      started,
      arrived: this.reducedMotion || replay
    };
    this.messages.set(m.id, token);
    this.messageReceipt(token);
    this.gesture(from);
  }
  gesture(p) {
    if (this.reducedMotion || p.path.length || ACTIVE.has(p.state)) return;
    p.pose = 'receive';
    p.reactionUntil = performance.now() + 850;
  }
  messageReceipt(t) {
    t.status.setText((t.envelope.seq != null ? '#' + t.envelope.seq + ' · ' : '') + (t.envelope.receive_id != null ? 'Received' : 'Pending'));
  }
  updateMessages(now) {
    const queues = new Map();
    for (const t of this.messages.values()) {
      const key = t.envelope.to;
      if (!queues.has(key)) queues.set(key, []);
      queues.get(key).push(t);
    }
    for (const queue of queues.values()) {
      queue.sort((a, b) => (a.envelope.seq ?? a.envelope.send_id) - (b.envelope.seq ?? b.envelope.send_id));
      queue.forEach((t, i) => {
        const progress = this.reducedMotion ? 1 : Math.max(0, Math.min(1, (now - t.started) / 1150));
        const end = [t.to.x + 190 + i * 12, t.to.y - t.to.height * .75 - 40 - i * 12];
        t.card.setPosition(t.start[0] + (end[0] - t.start[0]) * progress,
          t.start[1] + (end[1] - t.start[1]) * progress - Math.sin(progress * Math.PI) * 200);
        t.card.setVisible(i < 3).setDepth(1003 - i);
        t.title.setVisible(i === 0 && !t.envelope.control);
        t.status.setVisible(i === 0 && !t.envelope.control);
        if (progress === 1 && !t.arrived) {
          t.arrived = true;
          this.gesture(t.to);
        }
        if (t.arrived && t.envelope.receive_id != null) {
          t.receivedAt ??= now;
          if (now - t.receivedAt > 4000) this.removeMessage(t.envelope.id);
        }
      });
    }
  }
  removeMessage(id) {
    this.messages.get(id)?.card.destroy();
    this.messages.delete(id);
  }
  resetMessages() {
    for (const id of [...this.messages.keys()]) this.removeMessage(id);
    this.messageVersions.clear();
    this.ambient.reset();
    this.activities.reset();
    for (const p of this.people.values()) this.transition(p, p.state);
  }
  setReducedMotion(value) {
    this.reducedMotion = value;
    this.ambient.reset();
    if (this.ready)
      for (const p of this.people.values()) this.transition(p, p.state);
  }
  inspect() {
    return {
      ready: this.ready,
      renderer: 'Phaser.Canvas',
      art: 'linked-studio-patchwork-v2',
      reducedMotion: this.reducedMotion,
      viewport: {
        width: this.scale?.width,
        height: this.scale?.height,
        cameraWidth: this.scale?.width,
        worldWidth: this.layout.width,
        zoom: this.zoom
      },
      messages: [...this.messages.keys()],
      envelopes: [...this.messages.values()].map(t => ({
        ...t.envelope,
        arrived: t.arrived
      })),
      participants: [...this.people.values()].map(p => ({
        role: p.role.name,
        state: p.state,
        pose: p.pose,
        frame: p.pose,
        spriteFrame: p.frame,
        ambientAction: p.ambientAction,
        ambientHistory: p.ambientHistory,
        mode: p.protocolUntil > performance.now() || ACTIVE.has(p.state) ? 'protocol' : p.ambientAction ? 'ambient' : 'rest',
        motion: p.motion,
        currentActivity: p.currentActivity,
        x: p.x,
        y: p.y,
        moving: !!p.path.length,
        seated: p.seated,
        navigationBlocked: p.navigationBlocked,
        visible: p.sprite.visible
      }))
    };
  }
}
export function launchRoom(parent, callbacks = {}) {
  const scene = new DollhouseRoom(parent, callbacks);
  const game = new P.Game({
    type: P.CANVAS,
    parent,
    width: Math.max(1, parent.clientWidth),
    height: Math.max(1, parent.clientHeight),
    backgroundColor: '#f7f1e6',
    scene,
    scale: {
      mode: P.Scale.NONE
    },
    render: {
      antialias: true,
      roundPixels: false
    },
    fps: {
      target: 30,
      forceSetTimeOut: true
    },
    audio: {
      noAudio: true
    },
    banner: false
  });
  return {
    scene,
    dispose: () => game.destroy(true)
  };
}
