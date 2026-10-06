/* Requires Phaser 3 and scene-layout.js. Rendering only; no workflow mutations. */
class LinkedStudioRefinement extends Phaser.Scene {
  constructor() { super('linked-studio-refinement'); }
  preload() {
    this.load.image('studio-room', 'linked-studio-background.png');
    this.load.atlas('studio-cast', 'cast-atlas.png', 'cast-atlas.json');
    this.load.on('loaderror', file => { document.getElementById('status').textContent = 'Could not load ' + file.key; });
  }
  create() {
    const spec = window.LINKED_STUDIO_SPEC;
    this.people = new Map(); this.bubbles = []; this.cards = new Set();
    this.add.image(0, 0, 'studio-room').setOrigin(0).setCrop(0, 0, 1836, 711);
    for (const person of spec.participants) {
      const sprite = this.add.image(person.x, person.footY, 'studio-cast', person.frame).setOrigin(.5, 1).setDepth(10);
      sprite.setScale(person.height / sprite.height);
      this.people.set(person.id, { sprite, spec: person });
      this.add.text(person.x, 742, person.role, { fontFamily: 'Arial', fontSize: '23px', color: '#343038' }).setOrigin(.5).setDepth(40);
      this.add.text(person.x, 777, person.id === 'human' ? 'Refined Human' : 'Approved character design', { fontFamily: 'Arial', fontSize: '17px', color: '#746d74' }).setOrigin(.5).setDepth(40);
      const x = person.x, y = person.footY - person.height - 55;
      const bubble = this.add.container(x, y).setDepth(30).setVisible(false);
      const shape = this.add.graphics().fillStyle(0xffffff, .98).lineStyle(2, 0x8e8a83);
      shape.fillRoundedRect(-130, -23, 260, 46, 18).strokeRoundedRect(-130, -23, 260, 46, 18);
      shape.fillTriangle(-8, 23, 9, 23, 0, 34);
      const label = this.add.text(0, 0, person.activity, { fontFamily: 'Arial', fontSize: '18px', color: '#444047' }).setOrigin(.5);
      bubble.add([shape, label]); this.bubbles.push(bubble);
    }
    const mask = this.make.graphics({ x: 0, y: 0, add: false }).fillStyle(0xffffff);
    // One compound path keeps all furniture silhouettes in the Canvas mask.
    mask.beginPath();
    for (const poly of spec.foregroundPolygons) {
      mask.moveTo(poly[0][0], poly[0][1]);
      for (const [x, y] of poly.slice(1)) mask.lineTo(x, y);
      mask.closePath();
    }
    mask.fillPath();
    this.add.image(0, 0, 'studio-room').setOrigin(0).setDepth(20).setMask(mask.createGeometryMask());
    this.events.once('shutdown', () => mask.destroy());
    window.studioScene = this;
    document.getElementById('status').textContent = 'Preview ready · separate room, sprites, foreground and overlays';
    document.documentElement.dataset.previewReady = 'true';
    document.getElementById('activities').disabled = false;
    document.getElementById('message').disabled = false;
    document.getElementById('pose').disabled = false;
    if (new URLSearchParams(location.search).has('overlays')) {
      this.showActivities(true);
      this.showProtocol({ id: 'demo-1', type: 'Task', from: 'human', to: 'implementer', preview: true }, true);
    }
  }
  showActivities(visible) { this.bubbles.forEach(b => b.setVisible(visible)); }
  setHumanPose(neutral) {
    const { sprite, spec } = this.people.get('human');
    sprite.setFrame(neutral ? 'human-neutral' : 'human-orchestrating');
    sprite.setScale(spec.height / sprite.height);
  }
  showProtocol(event, hold = false) {
    // Feed an authoritative protocol event here in the host application.
    // This function never changes protocol state or acknowledges delivery.
    const source = this.people.get(event.from), target = this.people.get(event.to);
    if (!source || !target || !event.type) return false;
    if (this.cards.size >= 2) return false;
    const card = this.add.container(source.spec.x, 155).setDepth(50);
    const paper = this.add.graphics().fillStyle(0xfff5d9).lineStyle(2, 0x57504a);
    paper.fillRect(-132, -42, 264, 84).strokeRect(-132, -42, 264, 84);
    paper.lineBetween(108, -42, 108, -20).lineBetween(108, -20, 132, -20);
    const title = this.add.text(-111, -27, event.type + (event.preview ? ' · preview' : ''), { fontFamily: 'Arial', fontSize: '22px', fontStyle: 'bold', color: '#3c343b' });
    const route = this.add.text(-111, 8, source.spec.role + ' → ' + target.spec.role, { fontFamily: 'Arial', fontSize: '16px', color: '#635456' });
    card.add([paper, title, route]); this.cards.add(card);
    if (hold) card.x = (source.spec.x + target.spec.x) / 2;
    else if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      card.x = target.spec.x;
      this.time.delayedCall(1600, () => { this.cards.delete(card); card.destroy(); });
    } else this.tweens.add({ targets: card, x: target.spec.x, duration: 1600, ease: 'Sine.easeInOut', onComplete: () => {
      this.time.delayedCall(900, () => { this.cards.delete(card); card.destroy(); });
    }});
    return true;
  }
}
window.LinkedStudioRefinement = LinkedStudioRefinement;
