import { ROLES, launchRoom } from '/room-engine.js';

// Thin boundary between runtime snapshots, accessible DOM controls, and Babylon.
export const PROCESS = {
  id: 'pair_programming',
  name: 'Pair Programming',
  roles: ROLES.map((role) => ({ ...role, kind: role.name === 'Human' ? 'human' : 'agent' })),
  sequence: ['Human', 'Implementer', 'Reviewer', 'Human'],
};
let renderer,
  root,
  view,
  messageVersions = new Map(),
  sentMessages = new Set(),
  messageQueue = [];
let motionPreference = 'full';
try { motionPreference = localStorage.getItem('zippercrew-motion') || 'full'; } catch {}
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
  host.id = 'room-host';
  const controls = document.createElement('div');
  controls.className = 'scene-controls';
  const loading = document.createElement('span');
  loading.className = 'scene-loading';
  loading.textContent = 'Loading Corner Café…';
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
    const activity = document.createElement('span');
    activity.id = `local-activity-${role.name}`;
    activity.className = 'sr-only';
    activity.setAttribute('role', 'status');
    activity.setAttribute('aria-label', `${role.name} activity`);
    controls.append(activity);
  }
  const board = document.createElement('button');
  board.id = 'project-board';
  board.className = 'scene-board';
  board.textContent = 'Edit shared brief';
  board.setAttribute('aria-label', 'Edit workspace and task');
  board.onclick = () => onSelect('brief');
  controls.append(board);
  renderer = launchRoom(host, {
    reducedMotion: preference.matches || motionPreference === 'reduced',
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
        button.dataset.ambient = person.ambientAction || '';
        const activity = document.getElementById(`local-activity-${person.name}`);
        const text = [person.currentActivity?.text, person.currentActivity?.detail].filter(Boolean).join(' · ');
        if (activity.textContent !== text) activity.textContent = text;
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
  preference.addEventListener('change', () => renderer.scene.setReducedMotion(preference.matches || motionPreference === 'reduced'));
}
export function paintScene(next) {
  view = next;
  renderer?.scene.present(next);
}
export function showMessage(message, options = {}) {
  if (!message || messageVersions.get(message.id) === message.version) return;
  const newSend = !sentMessages.has(message.id) && message.send_id != null;
  if (newSend) sentMessages.add(message.id);
  messageVersions.set(message.id, message.version);
  if (renderer?.scene.ready) renderer.scene.message(message, options);
  else messageQueue.push({ message, options });
  // Accessible event hook mirrors observed sends; it does not manufacture them.
  if (newSend) root?.dispatchEvent(
    new CustomEvent('room-message', {
      detail: { ...message, replay: !!options.replay },
      bubbles: true,
    }),
  );
}
export function resetMessages() {
  messageVersions.clear();
  sentMessages.clear();
  messageQueue = [];
  renderer?.scene.resetMessages();
}

export function inspectScene() {
  return renderer?.scene.inspect();
}

export function roomMotion(value) {
  if (value !== undefined) {
    motionPreference = value === 'reduced' ? 'reduced' : 'full';
    try { localStorage.setItem('zippercrew-motion', motionPreference); } catch {}
    renderer?.scene.setReducedMotion(preference.matches || motionPreference === 'reduced');
  }
  return motionPreference;
}
