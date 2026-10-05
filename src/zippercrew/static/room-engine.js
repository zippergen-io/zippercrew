import { ChalkBrief, RoomLighting } from '/surfaces.js';
import { AmbientDirector, ActivityCadence } from '/presentation.js';

/* Phaser owns drawing and animation, never protocol decisions. */
export const WORLD = { width: 1536, height: 1024 };
// Production art metadata is separate from semantic states and animation policy.
export const ART = {
  revision: 'grounded-cafe-agent-cast-v2',
  background: '/assets/corner-cafe/background-v2.png',
  furniture: '/assets/corner-cafe/furniture-v2.png',
  workstations: '/assets/corner-cafe/workstations-v4.png',
  board: { x: 1080, y: 160, width: 265, height: 175 },
  furnitureCuts: [[0, 520, 1049, 1536], [0, 513, 1024]],
  characterCuts: {
    implementer: [[0, 449, 836, 1254], [0, 418, 818, 1254]],
    reviewer: [[0, 418, 836, 1254], [0, 418, 820, 1254]],
    human: [[0, 418, 836, 1254], [0, 418, 829, 1254]],
  },
};
function atlasRegions([xs, ys]) {
  return ys.slice(0, -1).flatMap((y, row) => xs.slice(0, -1).map((x, col) =>
    [x, y, xs[col + 1] - x, ys[row + 1] - y]));
}
export const ROLES = [
  {
    name: 'Implementer',
    key: 'implementer',
    color: 0xeb7954,
    seat: { x: 440, y: 660 },
    rest: { x: 260, y: 520 },
    approach: { x: 355, y: 635 }, aisleX: 275,
    desk: { x: 515, y: 805 },
    size: 330,
    deskWidth: 370,
    chairWidth: 205,
    furniture: 0,
    chair: 3,
    access: 'Write access',
    description: 'Makes the change, tests it, and responds to the review.',
  },
  {
    name: 'Reviewer',
    key: 'reviewer',
    color: 0x35a8b0,
    seat: { x: 1045, y: 695 },
    rest: { x: 1240, y: 525 },
    approach: { x: 960, y: 670 }, aisleX: 850,
    desk: { x: 1135, y: 805 },
    size: 385,
    deskWidth: 370,
    chairWidth: 205,
    furniture: 1,
    chair: 4,
    access: 'Read-only access',
    description: 'Inspects the repository and challenges the proposal.',
  },
  {
    name: 'Human',
    key: 'human',
    color: 0xa37ab5,
    seat: { x: 730, y: 845 },
    rest: { x: 730, y: 845 },
    approach: { x: 780, y: 785 }, aisleX: 780,
    desk: { x: 875, y: 885 },
    size: 375,
    deskWidth: 290,
    chairWidth: 155,
    furniture: 2,
    chair: 5,
    access: 'Process decisions',
    description: 'Your place in the conversation.',
  },
];
const FRAMES = [
  'idle',
  'work',
  'coffee',
  'walk-a',
  'walk-b',
  'think',
  'receive',
  'success',
  'stopped',
];
const POSES = {
  ready: 'idle',
  working: 'work',
  reviewing: 'work',
  waiting: 'coffee',
  'needs human': 'receive',
  completed: 'success',
  failed: 'stopped',
  stopped: 'stopped',
  unconfigured: 'idle',
};

// Frame trimming is atlas metadata, not destructive image processing. The shipped
// original alpha assets remain untouched. Align poses by their feet, not cell edges.
function addAtlas(texture, columns, rows, names, regions) {
  const source = texture.getSourceImage();
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0);
  const pixels = context.getImageData(0, 0, source.width, source.height).data;
  const cw = Math.floor(source.width / columns),
    ch = Math.floor(source.height / rows);
  for (let n = 0; n < columns * rows; n++) {
    const [ox, oy, rw, rh] = regions?.[n] || [
      (n % columns) * cw,
      Math.floor(n / columns) * ch,
      cw,
      ch,
    ];
    let left = rw,
      top = rh,
      right = 0,
      bottom = 0;
    for (let y = 0; y < rh; y++)
      for (let x = 0; x < rw; x++)
        if (pixels[((oy + y) * source.width + ox + x) * 4 + 3] > 35) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
    texture.add(
      names?.[n] ?? String(n),
      0,
      ox + left,
      oy + top,
      right - left + 1,
      bottom - top + 1,
    );
  }
}
export class CafeScene extends Phaser.Scene {
  constructor({
    onSelect = () => {},
    onReady = () => {},
    onError = () => {},
    onPositions = () => {},
    reducedMotion = false,
  } = {}) {
    super('CornerCafe');
    this.callbacks = { onSelect, onReady, onError, onPositions };
    this.reducedMotion = reducedMotion;
    this.people = new Map();
    this.messages = new Map();
    this.messageVersions = new Map();
    this.ambient = new AmbientDirector();
    this.activities = new ActivityCadence();
    this.pendingView = null;
  }
  preload() {
    this.load.image('cafe', ART.background);
    this.load.image('furniture', ART.furniture);
    this.load.image('workstations', ART.workstations);
    for (const role of ROLES) this.load.image(role.key, `/assets/characters/${role.key}-${role.key === 'reviewer' ? 'v3' : 'v2'}.png`);
    this.load.on('loaderror', (file) => {
      this.loadFailed = true;
      this.callbacks.onError(new Error(`Room asset could not load: ${file.key}`));
    });
  }
  create() {
    if (this.loadFailed) return;
    this.add.image(WORLD.width / 2, WORLD.height / 2, 'cafe')
      .setDisplaySize(WORLD.width, WORLD.height).setDepth(-1000);
    addAtlas(this.textures.get('furniture'), 3, 2, null, atlasRegions(ART.furnitureCuts));
    addAtlas(this.textures.get('workstations'), 2, 1);
    this.lighting = new RoomLighting(this, ROLES);
    for (const role of ROLES) {
      addAtlas(this.textures.get(role.key), 3, 3, FRAMES, atlasRegions(ART.characterCuts[role.key]));
      const chair = this.add
        .image(role.seat.x - 10, role.seat.y + 4, 'furniture', String(role.chair))
        .setOrigin(0.5, 1);
      chair.setScale(role.chairWidth / chair.width).setFlipX(role.name !== 'Human').setDepth(role.seat.y - 4);
      const sprite = this.add.sprite(role.seat.x, role.seat.y, role.key, 'idle').setOrigin(0.5, 1);
      const baseScale = role.size / this.textures.get(role.key).get('idle').height;
      sprite.setScale(baseScale).setDepth(role.seat.y);
      const desk = this.add
        .image(role.desk.x, role.desk.y, role.name === 'Human' ? 'furniture' : 'workstations', String(role.furniture))
        .setOrigin(0.5, 1);
      desk.setScale(role.deskWidth / desk.width).setDepth(role.desk.y);
      const ring = this.add
        .ellipse(role.seat.x, role.seat.y, 133, 36)
        .setStrokeStyle(2, role.color, 0.85)
        .setDepth(role.seat.y - 1)
        .setVisible(false);
      const label = this.add
        .text(role.seat.x, role.seat.y + 15, role.name, {
          fontFamily: 'system-ui',
          fontSize: '18px',
          color: '#fff4d8',
          backgroundColor: '#273d32',
          padding: { x: 10, y: 6 },
        })
        .setOrigin(0.5, 0)
        .setDepth(3000)
        .setVisible(false);
      for (const item of [sprite, desk, chair])
        item
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.callbacks.onSelect(role.name))
          .on('pointerover', () => label.setVisible(true))
          .on('pointerout', () => label.setVisible(this.selected === role.name));
      const bubble = this.add.text(0, 0, '', {
        fontFamily: 'system-ui', fontSize: '19px', color: '#24372f',
        padding: { x: 14, y: 9 },
        wordWrap: { width: 240 }, align: 'center',
      }).setOrigin(0.5, 1).setDepth(2900).setVisible(false);
      const bubbleBack = this.add.graphics().setDepth(2899).setVisible(false);
      const inbox = this.add.text(0, 0, '', { fontFamily: 'system-ui', fontSize: '15px',
        color: '#fffaf0', backgroundColor: '#273d32', padding: { x: 6, y: 3 },
      }).setOrigin(0.5, 0).setDepth(2100).setVisible(false);
      const bubbleDetail = this.add.text(0, 0, '', {
        fontFamily: 'system-ui', fontSize: '15px', color: '#627068',
        wordWrap: { width: 245 }, align: 'center',
      }).setOrigin(.5, 1).setDepth(2901).setVisible(false);
      this.people.set(role.name, {
        bubbleDetail,
        inbox, bubbleBack, bubble, ambientAction: null, currentActivity: null,
        role,
        sprite,
        desk,
        chair,
        ring,
        label,
        baseScale,
        state: null,
        pose: null,
        tween: null,
        motion: null,
      });
    }
    for (const person of this.people.values()) this.lighting.attach(person);
    this.board = this.add
      .zone(ART.board.x, ART.board.y, ART.board.width, ART.board.height)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.callbacks.onSelect('brief'));
    this.brief = new ChalkBrief(this);
    this.resize();
    this.scale.on('resize', () => this.resize());
    this.ready = true;
    if (this.pendingView) this.present(this.pendingView);
    this.callbacks.onReady(this);
  }
  resize() {
    const { width, height } = this.scale;
    // Fit the inhabited floor and board; never crop stations to fill a column.
    const zoom = Math.min(width / 1440, height / 920);
    this.cameras.main.setZoom(zoom).centerOn(WORLD.width / 2, 500);
    this.reportPositions();
  }
  present(view) {
    this.pendingView = view;
    if (!this.ready) return;
    this.selected = view.selected;
    const task = view.task?.trim();
    this.brief.setText(
      task ? (task.length > 70 ? task.slice(0, 67) + '…' : task) : 'What are we\nworking on?',
    );
    for (const person of this.people.values()) {
      const bound = person.role.name === 'Human' || !!view.bindings[person.role.name]?.profile;
      const state = bound ? view.states[person.role.name] : 'unconfigured';
      if (person.state !== state) this.transition(person, state);
      this.activities.step(person.role.name, state, view.activities?.[person.role.name], this.time.now, view.replay);
      person.ring.setVisible(view.selected === person.role.name);
      person.label.setVisible(view.selected === person.role.name);
      person.label.setText(
        `${person.role.name} · ${state === 'needs human' ? 'Your turn' : state}`,
      );
    }
    this.reportPositions();
  }
  transition(person, state) {
    this.ambient.cancel(person.role.name);
    person.ambientAction = null;
    person.ambientTween?.stop();
    person.ambientPose?.stop();
    person.state = state;
    person.tween?.stop();
    person.motion?.stop();
    person.reaction?.stop();
    person.posture?.remove();
    person.restore?.remove();
    person.receiving = false;
    const { role, sprite } = person;
    const visible = state !== 'unconfigured';
    sprite.setVisible(visible);
    person.shadow.setVisible(visible);
    const destination =
      state === 'waiting' && role.name !== 'Human'
        ? role.rest
        : (['ready', 'completed', 'failed', 'stopped'].includes(state) && role.name !== 'Human') ||
            (role.name === 'Human' &&
              ['needs human', 'completed', 'failed', 'stopped'].includes(state))
          ? { x: role.seat.x - 90, y: role.seat.y + 10 }
          : role.seat;
    const pose =
      role.name === 'Human' && ['ready', 'waiting'].includes(state)
        ? 'work'
        : POSES[state] || 'idle';
    person.home = destination;
    person.restFrame = pose;
    person.semanticPose = state === 'working' ? 'typing' : state === 'reviewing' ? 'reading' : pose;
    person.pose = person.semanticPose;
    const settle = () => {
      sprite
        .setPosition(destination.x, destination.y)
        .setFrame(pose)
        .setScale(person.baseScale)
        .setAngle(0).setFlipX(false);
      sprite.setAlpha(['failed', 'stopped'].includes(state) ? 0.62 : 1);
      sprite.setDepth(destination.y);
      this.lighting.update(person);
      person.ring.setPosition(destination.x, destination.y).setDepth(destination.y - 1);
      person.label.setPosition(destination.x, destination.y + 15);
      if (!this.reducedMotion && visible) {
        if (state === 'working')
          person.motion = this.tweens.add({
            targets: sprite,
            angle: { from: -0.3, to: 0.35 },
            duration: 280,
            yoyo: true,
            repeat: -1,
          });
        else if (state === 'reviewing')
          person.motion = this.tweens.add({
            targets: sprite,
            angle: { from: 0, to: -1.5 },
            duration: 1700,
            yoyo: true,
            hold: 500,
            repeat: -1,
          });
        else if (state === 'needs human')
          person.motion = this.tweens.add({
            targets: person.ring,
            alpha: { from: 0.4, to: 1 },
            duration: 1100,
            yoyo: true,
            repeat: -1,
          });
        // A short thinking/annotation pose belongs to the ongoing action. It
        // never announces a test, review result, or protocol state transition.
        if (['working', 'reviewing'].includes(state))
          person.posture = this.time.addEvent({
            delay: state === 'working' ? 6500 : 8500,
            loop: true,
            callback: () => {
              if (person.receiving) return;
              sprite.setFrame('think');
              person.restore = this.time.delayedCall(state === 'working' ? 750 : 1400, () =>
                sprite.setFrame(pose),
              );
            },
          });
      }
      this.reportPositions();
    };
    if (
      !this.reducedMotion &&
      visible &&
      Math.hypot(sprite.x - destination.x, sprite.y - destination.y) > 5
    ) {
      person.tween = this.walk(person, destination, () => {
        settle();
        if (['working', 'reviewing'].includes(state)) person.reaction = this.tweens.add({
          targets: sprite, scaleY: { from: person.baseScale * 1.025, to: person.baseScale },
          duration: 220, ease: 'Sine.easeOut',
        });
      });
    } else settle();
  }
  reportPositions() {
    if (!this.ready) return;
    const camera = this.cameras.main;
    const position = (x, y) => ({
      x: (x - camera.scrollX - camera.width / 2) * camera.zoom + camera.width / 2,
      y: (y - camera.scrollY - camera.height / 2) * camera.zoom + camera.height / 2,
    });
    this.callbacks.onPositions(
      [...this.people.values()].map((p) => ({
        name: p.role.name,
        ...position(p.sprite.x, p.sprite.y - 150),
        state: p.state,
        ambientAction: p.ambientAction,
        currentActivity: p.currentActivity,
        pose: p.pose,
        worldX: p.sprite.x,
        worldY: p.sprite.y,
      })),
      position(ART.board.x, ART.board.y),
    );
  }
  ambientPose(person, action) {
    person.ambientTween?.stop();
    person.ambientPose?.stop();
    person.ambientAction = action;
    const { sprite, role, home } = person;
    const destination = action === 'board' ? { x: 1010, y: 460 }
      : action === 'coffee' ? { x: 585, y: 490 }
      : action === 'window' ? { x: 215, y: 460 } : home;
    const frame = { coffee: 'coffee', tablet: 'think', board: 'think', monitor: 'think',
      phone: 'work', window: 'think', stretch: 'idle', 'look-around': 'think' }[action] || person.restFrame;
    person.pose = action || person.semanticPose;
    const settle = () => {
      sprite.setPosition(destination.x, destination.y).setFrame(frame).setAngle(0).setScale(person.baseScale).setFlipX(false);
      if (action) person.ambientPose = this.tweens.add({
        targets: sprite, angle: action === 'stretch' ? -3 : role.name === 'Reviewer' ? -1 : 1.5,
        duration: role.name === 'Implementer' ? 1000 : 1800, yoyo: true, hold: 700,
      });
    };
    if (Math.hypot(sprite.x - destination.x, sprite.y - destination.y) < 5) settle();
    else person.ambientTween = this.walk(person, destination, settle, true);
  }
  walk(person, destination, complete, ambient = false) {
    const {sprite, role} = person;
    const points = [{x:sprite.x,y:sprite.y}];
    // Authored circulation: centre aisle for the Human, outside edges for
    // agents, and a back aisle shared by the board, window and coffee counter.
    const {aisleX} = role;
    const short = Math.hypot(sprite.x-destination.x,sprite.y-destination.y)<180;
    if (!short && sprite.y > 610) points.push({x:aisleX,y:role.name==='Human'?Math.min(sprite.y,785):sprite.y}, {x:aisleX,y:465});
    if (!short && destination.y > 610) {
      points.push({x:aisleX,y:465}, {x:aisleX,y:destination.y-35});
      points.push(role.approach);
    } else if (!short) points.push({x:destination.x,y:465});
    points.push(destination);
    const distances=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));
    const total=distances.reduce((a,b)=>a+b,0);
    return this.tweens.addCounter({from:0,to:total,
      duration: Math.min(ambient?2600:1300, Math.max(550,total*(ambient?3:1.6))),
      ease:'Sine.easeInOut', onUpdate:t=>{
        let remaining=t.getValue(), segment=0;
        while(segment<distances.length-1 && remaining>distances[segment]) remaining-=distances[segment++];
        const from=points[segment], to=points[segment+1], fraction=distances[segment]?remaining/distances[segment]:1;
        sprite.setPosition(from.x+(to.x-from.x)*fraction,from.y+(to.y-from.y)*fraction)
          .setFrame(Math.floor(t.progress*10)%2?'walk-a':'walk-b').setFlipX(to.x<from.x).setAngle(0);
      }, onComplete:complete,
    });
  }

  removeMessage(id) {
    const token = this.messages.get(id);
    if (!token) return;
    token.flight?.stop();
    token.fade?.stop();
    token.destroy();
    this.messages.delete(id);
  }
  resetMessages() {
    this.messageVersions.clear();
    for (const id of [...this.messages.keys()]) this.removeMessage(id);
    this.ambient.reset();
    this.activities.reset();
    for (const person of this.people.values()) {
      person.currentActivity = null;
      person.bubble.setVisible(false);
      person.bubbleBack.setVisible(false);
      person.bubbleDetail.setVisible(false);
      this.transition(person, person.state);
    }
  }
  message(message, { replay = false } = {}) {
    if (!this.ready || !message || this.messageVersions.get(message.id) === message.version) return;
    this.messageVersions.set(message.id, message.version);
    const from = this.people.get(message.from), to = this.people.get(message.to);
    if (!from || !to || message.send_id == null) return;
    let token = this.messages.get(message.id);
    if (!message.control && message.receive_id != null && to.ambientAction) this.transition(to, to.state);
    if (token) {
      token.envelope = message;
      if (token.arrived) this.settleMessage(token);
      return;
    }
    // Restore pending inboxes, but never replay already consumed history.
    if (replay && message.receive_id != null) return;
    const cadence = this.activities.people.get(message.from);
    if (cadence) cadence.current = cadence.pending = null;
    const x = from.sprite.x + 60, y = from.sprite.y - 175;
    token = this.add.container(x, y).setDepth(2000);
    token.recipient = to;
    token.envelope = message;
    const control = message.control;
    const width = control ? 26 : 112, height = control ? 26 : 64;
    const sheet = this.add.graphics().fillStyle(0xfff4dc)
      .fillRoundedRect(-width / 2, -height / 2, width, height, 4)
      .lineStyle(3, from.role.color).strokeRoundedRect(-width / 2, -height / 2, width, height, 4);
    sheet.lineBetween(-width / 2 + 7, -height / 2 + 8, width / 2 - 7, -height / 2 + 8);
    const title = this.add.text(0, -12, control ? '◇' : message.label, {
      fontFamily: 'system-ui', fontSize: control ? '18px' : '17px', color: '#24372f',
      wordWrap: { width: 104 }, align: 'center',
    }).setOrigin(0.5, 0);
    const receipt = this.add.text(0, 15, '', {
      fontFamily: 'system-ui', fontSize: '11px', color: '#43574e',
    }).setOrigin(0.5, 0);
    token.receipt = receipt;
    token.add([sheet, title, receipt]);
    token.setSize(width + 10, height + 10).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.callbacks.onSelect({ message: message.id }));
    this.messages.set(message.id, token);
    // Keep pending traffic available in the inspector; show only a small stack.
    for (const t of this.messages.values()) {
      if (t.envelope.receive_id != null && this.messages.size > 12) this.removeMessage(t.envelope.id);
    }
    const arrive = () => {
      token.arrived = true;
      this.settleMessage(token);
    };
    if (this.reducedMotion || replay) arrive();
    else token.flight = this.tweens.addCounter({
      from: 0, to: 1, duration: 950,
      onUpdate: t => {
        const p = t.getValue();
        const slot = this.inboxPosition(token);
        token.setPosition(x + (slot.x - x) * p,
          y + (slot.y - y) * p - Math.sin(p * Math.PI) * (control ? 35 : 75));
      },
      onComplete: arrive,
    });
  }
  inboxPosition(token) {
    const siblings = [...this.messages.values()].filter(t => t.recipient === token.recipient);
    // Runtime channel seq, not arrival of SSE snapshots, determines stack order.
    siblings.sort((a, b) => (a.envelope.seq ?? 0) - (b.envelope.seq ?? 0));
    const index = siblings.indexOf(token);
    token.setVisible(index < 3);
    return { x: token.recipient.sprite.x + 90 + Math.min(index, 2) * 15,
      y: token.recipient.sprite.y - 140 + Math.min(index, 2) * 20 };
  }
  settleMessage(token) {
    const m = token.envelope;
    // Cosmetic arrival is not runtime receive. An unreceived card stays pending.
    token.receipt.setText(m.control ? '' : `${m.receive_id != null ? 'Received' : 'Awaiting receive'} · #${m.seq}`);
    if (m.receive_id != null && !token.fade) token.fade = this.tweens.add({
      targets: token, alpha: 0, duration: this.reducedMotion ? 0 : 350,
      delay: m.control ? 1400 : 4500,
      onComplete: () => this.removeMessage(m.id),
    });
  }
  update() {
    if (!this.ready) return;
    const now = this.time.now;
    for (const person of this.people.values()) {
      if (!person.tween?.isPlaying()) {
        const action = this.ambient.step(person.role.name, person.state, now, this.reducedMotion);
        if (action !== person.ambientAction) this.ambientPose(person, action);
      }
      const sprite = person.sprite;
      sprite.setDepth(sprite.y);
      this.lighting.update(person);
      person.ring.setPosition(sprite.x, sprite.y).setDepth(sprite.y - 1);
      person.label.setPosition(sprite.x, sprite.y + 15);
      const activity = this.activities.step(person.role.name, person.state,
        this.pendingView?.activities?.[person.role.name], now, this.pendingView?.replay);
      person.currentActivity = activity;
      const anchorY = sprite.y - person.role.size - 12;
      person.bubble.setVisible(!!activity).setPosition(sprite.x, anchorY - (activity?.detail ? 25 : 0));
      person.bubbleDetail.setVisible(!!activity?.detail).setPosition(sprite.x, anchorY - 9);
      person.bubbleBack.setVisible(!!activity).setPosition(sprite.x, anchorY);
      if (activity) {
        if (person.bubble.text !== activity.text || person.bubbleDetail.text !== (activity.detail || '')) {
          person.bubble.setText(activity.text);
          person.bubbleDetail.setText(activity.detail || '');
          const w = Math.max(person.bubble.width, person.bubbleDetail.width + 28);
          const h = person.bubble.height + (activity.detail ? 25 : 0);
          person.bubbleBack.clear().fillStyle(0xfffaf0)
            .fillRoundedRect(-w / 2, -h, w, h, 10)
            .fillTriangle(-6, 0, 8, 0, 0, 8);
        }
        const age = now - this.activities.people.get(person.role.name).shown;
        person.bubble.setAlpha(this.reducedMotion ? 1 : Math.min(1, (6500 - age) / 700));
        person.bubbleDetail.setAlpha(person.bubble.alpha);
        person.bubbleBack.setAlpha(person.bubble.alpha);
      }
    }
    for (const token of this.messages.values()) {
      if (token.arrived) {
        const slot = this.inboxPosition(token);
        token.setPosition(slot.x, slot.y);
      }
    }
    for (const p of this.people.values()) {
      const count = [...this.messages.values()].filter(t => t.recipient === p && t.envelope.receive_id == null).length;
      p.inbox.setVisible(count > 0).setText(`${count} incoming`)
        .setPosition(p.sprite.x + 95, p.sprite.y - 80);
    }
    // DOM accessibility overlays need not be rewritten at the canvas frame rate.
    if (!this.lastPositionReport || now - this.lastPositionReport >= 100) {
      this.reportPositions();
      this.lastPositionReport = now;
    }
  }
  inspect() {
    return {
      ready: !!this.ready,
      reducedMotion: this.reducedMotion,
      renderer: 'Phaser.Canvas',
      art: ART.revision,
      viewport: { width: this.scale.width, cameraWidth: this.cameras.main?.width },
      messages: [...this.messages.keys()],
      envelopes: [...this.messages.values()].map(t => ({ ...t.envelope, arrived: !!t.arrived })),
      participants: [...this.people.values()].map((p) => ({
        role: p.role.name,
        state: p.state,
        ambientAction: p.ambientAction,
        currentActivity: p.currentActivity,
        pose: p.pose,
        frame: p.sprite.frame.name,
        texture: p.sprite.texture.key,
        x: p.sprite.x,
        y: p.sprite.y,
        moving: !!p.tween?.isPlaying() || !!p.ambientTween?.isPlaying(),
        visible: p.sprite.visible,
        lighting: { contact: p.shadow.visible, cast: p.castShadow.visible, received: p.receivedShadow.visible },
      })),
    };
  }
  setReducedMotion(value) {
    this.reducedMotion = value;
    if (!this.ready) return;
    this.ambient.reset();
    for (const token of this.messages.values()) {
      token.flight?.stop();
      token.arrived = true;
      this.settleMessage(token);
    }
    for (const p of this.people.values()) this.transition(p, p.state);
  }
}
export function launchRoom(parent, callbacks = {}) {
  const scene = new CafeScene(callbacks);
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent,
    width: parent.clientWidth,
    height: parent.clientHeight,
    backgroundColor: '#29382d',
    scene: [scene],
    banner: false,
    audio: { noAudio: true },
    fps: { target: 30 },
    // ResizeObserver is the sole sizing authority, including inspector changes.
    scale: { mode: Phaser.Scale.NONE },
    render: { antialias: true },
    autoFocus: false,
    input: {
      activePointers: 1,
      keyboard: false,
      windowEvents: false,
      mouse: {
        preventDefaultDown: false,
        preventDefaultUp: false,
        preventDefaultMove: false,
        preventDefaultWheel: false,
      },
    },
  });
  const observer = new ResizeObserver(() =>
    game.scale.resize(parent.clientWidth, parent.clientHeight),
  );
  observer.observe(parent);
  game.events.once('destroy', () => observer.disconnect());
  return { game, scene };
}
