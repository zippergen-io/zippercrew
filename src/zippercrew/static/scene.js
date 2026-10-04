import { ROLES, launchRoom } from '/room-engine.js';

// Thin boundary between runtime snapshots, accessible DOM controls, and Phaser.
export const PROCESS = {
  id: 'pair_programming',
  name: 'Pair Programming',
  roles: ROLES.map((role) => ({ ...role, kind: role.name === 'Human' ? 'human' : 'agent' })),
  links: [
    ['Human', 'Implementer'],
    ['Human', 'Reviewer'],
    ['Implementer', 'Reviewer'],
    ['Implementer', 'Human'],
    ['Reviewer', 'Human'],
  ],
  sequence: ['Human', 'Implementer', 'Reviewer', 'Human'],
};
let renderer,
  root,
  view,
  lastMessage = 0,
  messageQueue = [];
const preference = matchMedia('(prefers-reduced-motion: reduce)');
const labels = {
  unconfigured: 'Choose agent',
  ready: 'Ready',
  working: 'Working',
  reviewing: 'Reviewing',
  waiting: 'Waiting',
  'needs human': 'Your turn',
  completed: 'Completed',
  failed: 'Failed',
  stopped: 'Stopped',
};
export function createScene(container, onSelect) {
  root = document.createElement('div');
  root.id = 'room-art';
  root.dataset.ready = 'false';
  const host = document.createElement('div');
  host.id = 'phaser-host';
  const controls = document.createElement('div');
  controls.className = 'scene-controls';
  const loading = document.createElement('span');
  loading.className = 'scene-loading';
  loading.textContent = 'Setting the table…';
  root.append(host, controls, loading);
  container.replaceChildren(root);
  for (const role of ROLES) {
    const button = document.createElement('button');
    button.id = `actor-${role.name}`;
    button.className = 'scene-participant';
    button.dataset.role = role.name;
    button.textContent = role.name;
    button.onclick = () => onSelect(role.name);
    controls.append(button);
  }
  const board = document.createElement('button');
  board.id = 'project-board';
  board.className = 'scene-board';
  board.textContent = 'Edit shared brief';
  board.setAttribute('aria-label', 'Edit workspace and task');
  board.onclick = () => onSelect('brief');
  controls.append(board);
  renderer = launchRoom(host, {
    reducedMotion: preference.matches,
    onSelect,
    onReady: (scene) => {
      host.querySelector('canvas').setAttribute('aria-label', 'Corner Café crew room');
      loading.remove();
      root.dataset.ready = 'true';
      if (view) scene.present(view);
      for (const item of messageQueue) scene.message(item.message, item.options);
      messageQueue = [];
      document.dispatchEvent(new Event('room-renderer-ready'));
    },
    onError: (error) => {
      loading.textContent = 'Room graphics could not load. Reload to retry.';
      document.dispatchEvent(new CustomEvent('room-renderer-error', { detail: error }));
    },
    onPositions: (participants, brief) => {
      for (const person of participants) {
        const button = document.getElementById(`actor-${person.name}`);
        button.style.left = `${person.x}px`;
        button.style.top = `${person.y}px`;
        button.dataset.state = person.state;
        button.dataset.pose = person.pose;
        button.dataset.x = person.worldX;
        button.dataset.y = person.worldY;
        button.classList.toggle('empty', person.state === 'unconfigured');
        button.classList.toggle('bound', person.state !== 'unconfigured');
        for (const state of Object.keys(labels))
          button.classList.toggle(state.replaceAll(' ', '-'), state === person.state);
        button.classList.toggle('selected', view?.selected === person.name);
        button.textContent =
          person.state === 'unconfigured'
            ? `${person.name} +`
            : `${person.name} · ${labels[person.state] || person.state}`;
        button.setAttribute(
          'aria-label',
          `${person.name}: ${labels[person.state] || person.state}. ${person.name === 'Reviewer' ? 'Read-only access' : person.name === 'Implementer' ? 'Write access' : 'Human participant'}`,
        );
        button.setAttribute('aria-pressed', String(view?.selected === person.name));
      }
      board.style.left = `${brief.x}px`;
      board.style.top = `${brief.y}px`;
    },
  });
  preference.addEventListener('change', (event) => renderer.scene.setReducedMotion(event.matches));
}
export function paintScene(next) {
  view = next;
  renderer?.scene.present(next);
}
export function showMessage(message, options = {}) {
  if (!message || message.id <= lastMessage) return;
  lastMessage = message.id;
  if (!PROCESS.links.some(([a, b]) => a === message.from && b === message.to)) return;
  if (renderer?.scene.ready) renderer.scene.message(message, options);
  else messageQueue.push({ message, options });
  // Accessible event hook mirrors observed sends; it does not manufacture them.
  root?.dispatchEvent(
    new CustomEvent('room-message', {
      detail: { ...message, replay: !!options.replay },
      bubbles: true,
    }),
  );
}
export function resetMessages() {
  lastMessage = 0;
  messageQueue = [];
  renderer?.scene.resetMessages();
}

export function inspectScene() {
  return renderer?.scene.inspect();
}
