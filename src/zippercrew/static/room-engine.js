/* Phaser owns drawing and animation, never protocol decisions. */
export const WORLD = { width: 1536, height: 1024 };
export const ROLES = [
  {
    name: 'Implementer',
    key: 'implementer',
    color: 0xd68a61,
    seat: { x: 410, y: 670 },
    rest: { x: 260, y: 520 },
    desk: { x: 530, y: 735 },
    size: 342,
    furniture: 0,
    chair: 3,
    access: 'Write access',
    description: 'Makes the change, tests it, and responds to the review.',
  },
  {
    name: 'Reviewer',
    key: 'reviewer',
    color: 0x78b6aa,
    seat: { x: 1060, y: 665 },
    rest: { x: 1240, y: 525 },
    desk: { x: 1230, y: 745 },
    size: 346,
    furniture: 1,
    chair: 4,
    access: 'Read-only access',
    description: 'Inspects the repository and challenges the proposal.',
  },
  {
    name: 'Human',
    key: 'human',
    color: 0xc9a1d5,
    seat: { x: 730, y: 845 },
    rest: { x: 730, y: 845 },
    desk: { x: 875, y: 885 },
    size: 350,
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
    this.lastMessage = 0;
    this.pendingView = null;
  }
  preload() {
    this.load.image('cafe', '/assets/corner-cafe/background.png');
    this.load.image('furniture', '/assets/corner-cafe/furniture.png');
    for (const role of ROLES) this.load.image(role.key, `/assets/characters/${role.key}.png`);
    this.load.on('loaderror', (file) => {
      this.loadFailed = true;
      this.callbacks.onError(new Error(`Room asset could not load: ${file.key}`));
    });
  }
  create() {
    if (this.loadFailed) return;
    this.add.image(768, 512, 'cafe').setDepth(-1000);
    addAtlas(this.textures.get('furniture'), 3, 2, null, [
      [35, 25, 505, 451],
      [572, 85, 490, 390],
      [1118, 60, 380, 415],
      [40, 480, 490, 510],
      [562, 478, 490, 510],
      [1120, 505, 380, 450],
    ]);
    for (const role of ROLES) {
      addAtlas(this.textures.get(role.key), 3, 3, FRAMES);
      const chair = this.add
        .image(role.seat.x - 10, role.seat.y + 4, 'furniture', String(role.chair))
        .setOrigin(0.5, 1);
      chair.setDisplaySize(240, 280).setDepth(role.seat.y - 4);
      const shadow = this.add
        .ellipse(role.seat.x, role.seat.y - 4, 125, 28, 0x172819, 0.22)
        .setDepth(role.seat.y - 2);
      const sprite = this.add.sprite(role.seat.x, role.seat.y, role.key, 'idle').setOrigin(0.5, 1);
      const baseScale = role.size / this.textures.get(role.key).get('idle').height;
      sprite.setScale(baseScale).setDepth(role.seat.y);
      const desk = this.add
        .image(role.desk.x, role.desk.y, 'furniture', String(role.furniture))
        .setOrigin(0.5, 1);
      desk.setScale((role.name === 'Human' ? 260 : 350) / desk.width).setDepth(role.desk.y);
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
      this.people.set(role.name, {
        role,
        sprite,
        desk,
        chair,
        shadow,
        ring,
        label,
        baseScale,
        state: null,
        pose: null,
        tween: null,
        motion: null,
      });
    }
    this.board = this.add
      .zone(965, 126, 242, 165)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.callbacks.onSelect('brief'));
    this.brief = this.add
      .text(880, 95, 'What are we\nworking on?', {
        fontFamily: 'system-ui',
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#f9e5b2',
        wordWrap: { width: 175 },
      })
      .setDepth(2);
    this.resize();
    this.scale.on('resize', () => this.resize());
    this.ready = true;
    if (this.pendingView) this.present(this.pendingView);
    this.callbacks.onReady(this);
  }
  resize() {
    const { width, height } = this.scale;
    const zoom =
      width < 650
        ? Math.min(width / WORLD.width, height / WORLD.height)
        : Math.max(width / WORLD.width, height / WORLD.height);
    this.cameras.main
      .setZoom(zoom)
      .centerOn(WORLD.width / 2, Math.min(512, 470 + (height / zoom - 740) * 0.2));
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
      person.ring.setVisible(view.selected === person.role.name);
      person.label.setVisible(view.selected === person.role.name);
      person.label.setText(
        `${person.role.name} · ${state === 'needs human' ? 'Your turn' : state}`,
      );
    }
    this.reportPositions();
  }
  transition(person, state) {
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
    person.restFrame = pose;
    person.pose = state === 'working' ? 'typing' : state === 'reviewing' ? 'reading' : pose;
    const settle = () => {
      sprite
        .setPosition(destination.x, destination.y)
        .setFrame(pose)
        .setScale(person.baseScale)
        .setAngle(0);
      sprite.setAlpha(['failed', 'stopped'].includes(state) ? 0.62 : 1);
      sprite.setDepth(destination.y);
      person.shadow.setPosition(destination.x, destination.y - 3).setDepth(destination.y - 2);
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
      sprite.setFrame('walk-a');
      person.tween = this.tweens.add({
        targets: sprite,
        x: destination.x,
        y: destination.y,
        duration: role.name === 'Implementer' ? 850 : 1150,
        ease: 'Sine.easeInOut',
        onUpdate: (t) => {
          sprite.setFrame(Math.floor(t.progress * 6) % 2 ? 'walk-a' : 'walk-b');
          sprite.setDepth(sprite.y);
          person.shadow.setPosition(sprite.x, sprite.y - 3).setDepth(sprite.y - 2);
          this.reportPositions();
        },
        onComplete: () => {
          settle();
          // Ease into the seated pose at the end of the walk; feet stay anchored.
          if (['working', 'reviewing'].includes(state))
            person.reaction = this.tweens.add({
              targets: sprite,
              scaleY: { from: person.baseScale * 1.035, to: person.baseScale },
              duration: 220,
              ease: 'Sine.easeOut',
            });
        },
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
        pose: p.pose,
        worldX: p.sprite.x,
        worldY: p.sprite.y,
      })),
      position(965, 126),
    );
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
    this.lastMessage = 0;
    for (const id of [...this.messages.keys()]) this.removeMessage(id);
    for (const person of this.people.values()) {
      person.reaction?.stop();
      person.restore?.remove();
      person.receiving = false;
      person.sprite.setScale(person.baseScale);
      if (!person.tween?.isPlaying()) person.sprite.setFrame(person.restFrame || 'idle');
    }
  }
  message(message, { replay = false } = {}) {
    if (!this.ready || !message || message.id <= this.lastMessage) return;
    this.lastMessage = message.id;
    if (replay) return;
    const from = this.people.get(message.from),
      to = this.people.get(message.to);
    if (!from || !to) return;
    const x = from.sprite.x + 30,
      y = from.sprite.y - 180;
    const token = this.add.container(x, y).setDepth(2000);
    token.recipient = to;
    const sheet = this.add
      .graphics()
      .fillStyle(0xfff4dc)
      .fillRoundedRect(-16, -21, 32, 42, 4)
      .lineStyle(2, from.role.color)
      .strokeRoundedRect(-16, -21, 32, 42, 4);
    for (let i = 0; i < 3; i++) sheet.lineBetween(-9, -10 + i * 8, 9, -10 + i * 8);
    token.add(sheet);
    this.messages.set(message.id, token);
    // Bound transient effects even if many sends arrive in one SSE snapshot.
    if (this.messages.size > 6) this.removeMessage(this.messages.keys().next().value);
    const arrive = () => {
      token.arrived = true;
      token.setPosition(to.sprite.x + 30, to.sprite.y - 180);
      if (!this.reducedMotion) {
        to.reaction?.stop();
        to.restore?.remove();
        to.sprite.setScale(to.baseScale);
        if (!to.tween?.isPlaying() && !['completed', 'failed', 'stopped'].includes(to.state)) {
          to.receiving = true;
          to.sprite.setFrame('receive');
          to.restore = this.time.delayedCall(400, () => {
            to.receiving = false;
            to.sprite.setFrame(to.restFrame);
          });
        }
        to.reaction = this.tweens.add({
          targets: to.sprite,
          scaleX: to.baseScale * 1.025,
          scaleY: to.baseScale * 1.025,
          duration: 180,
          yoyo: true,
        });
        token.fade = this.tweens.add({
          targets: token,
          alpha: 0,
          duration: 400,
          delay: 600,
          onComplete: () => this.removeMessage(message.id),
        });
      }
    };
    if (this.reducedMotion) {
      for (const id of [...this.messages.keys()]) if (id !== message.id) this.removeMessage(id);
      arrive();
    } else
      token.flight = this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 1000,
        onUpdate: (t) => {
          const p = t.getValue();
          token.setPosition(
            x + (to.sprite.x + 30 - x) * p,
            y + (to.sprite.y - 180 - y) * p - Math.sin(p * Math.PI) * 85,
          );
        },
        onComplete: arrive,
      });
  }
  update() {
    // A received document stays with its participant, including in reduced motion.
    for (const token of this.messages.values()) {
      if (token.arrived)
        token.setPosition(token.recipient.sprite.x + 30, token.recipient.sprite.y - 180);
    }
  }
  inspect() {
    return {
      ready: !!this.ready,
      reducedMotion: this.reducedMotion,
      renderer: 'Phaser.Canvas',
      viewport: { width: this.scale.width, cameraWidth: this.cameras.main?.width },
      messages: [...this.messages.keys()],
      participants: [...this.people.values()].map((p) => ({
        role: p.role.name,
        state: p.state,
        pose: p.pose,
        frame: p.sprite.frame.name,
        texture: p.sprite.texture.key,
        x: p.sprite.x,
        y: p.sprite.y,
        moving: !!p.tween?.isPlaying(),
        visible: p.sprite.visible,
      })),
    };
  }
  setReducedMotion(value) {
    this.reducedMotion = value;
    this.resetMessages();
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
