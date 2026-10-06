/* Cosmetic policy only. Injected time/randomness makes long idle periods testable.
 * Nothing here emits a workflow event or enables a process action. */
const AMBIENT_STATES = new Set(['ready', 'waiting', 'completed']);
export const AMBIENT_ACTIONS = {
  implementer: ['check-tool', 'read-sketch', 'organize', 'think', 'coffee', 'board', 'pace'],
  reviewer: ['read-document', 'check-card', 'think', 'organize', 'coffee', 'board', 'pace'],
  human: ['listen', 'read-notes', 'reflect', 'coffee', 'window', 'board', 'pace'],
};
export const AMBIENT_LABELS = {
  'check-tool': 'Checking a tool', 'read-sketch': 'Looking over a sketch',
  organize: 'Organizing papers', think: 'Thinking', coffee: 'Taking a coffee break',
  board: 'Looking at the brief board', pace: 'Stretching their legs',
  'read-document': 'Reading a document', 'check-card': 'Checking a card',
  listen: 'Listening to the crew', 'read-notes': 'Reading notes',
  reflect: 'Thinking through notes', window: 'Looking out the window',
};
const EXCURSIONS = new Set(['coffee', 'board', 'window', 'pace']);
export class AmbientDirector {
  constructor(random = Math.random) {
    this.random = random;
    this.people = new Map();
    this.reservations = new Map();
  }
  pause(min, spread) { return min + this.random() * spread; }
  cancel(role) {
    for (const [resource, owner] of this.reservations)
      if (owner === role) this.reservations.delete(resource);
    this.people.delete(role);
  }
  step(role, state, now, reduced = false, visualRole = role.toLowerCase().split(' ')[0]) {
    let p = this.people.get(role);
    if (!AMBIENT_STATES.has(state) || reduced) { this.cancel(role); return null; }
    if (!p || p.state !== state) {
      this.cancel(role);
      // Occupied from the first frame. The initial action stays at the local
      // station; randomness staggers later excursions across the ensemble.
      const initial = (AMBIENT_ACTIONS[visualRole] || AMBIENT_ACTIONS.human)[0];
      p = { state, action: initial, previous: null, history: [initial],
        due: now + this.pause(8000, 7000), lastAction: now, until: Infinity,
        resource: null, visualRole };
      this.people.set(role, p);
    }
    if (now >= Math.min(p.due, p.until)) {
      if (p.resource && this.reservations.get(p.resource) === role)
        this.reservations.delete(p.resource);
      p.resource = null;
      const history = p.history || [p.action];
      const library = AMBIENT_ACTIONS[p.visualRole] || AMBIENT_ACTIONS.human;
      // Every trip is followed by a local activity. Busy resources fall back
      // to another purposeful action, never to a long empty waiting period.
      const canTravel = !EXCURSIONS.has(p.action) && !this.reservations.has('back-aisle');
      const choices = library.filter(a => !history.slice(-2).includes(a) &&
        (canTravel || !EXCURSIONS.has(a)));
      const action = choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))];
      const resource = EXCURSIONS.has(action) ? 'back-aisle' : null;
      if (resource) this.reservations.set(resource, role);
      const until = now + (resource ? this.pause(21000, 9000) : this.pause(10000, 9000));
      Object.assign(p, { lastAction: now, previous: p.action, action, resource,
        history: [...history.slice(-1), action], until, due: until });
    }
    return p.action;
  }
  reset() { this.people.clear(); this.reservations.clear(); }
}

export class ActivityCadence {
  constructor() { this.people = new Map(); }
  step(role, state, item, now, replay = false) {
    let p = this.people.get(role);
    if (!p) { p = { seen: null, current: null, pending: null, shown: -Infinity }; this.people.set(role, p); }
    if (!['working', 'reviewing'].includes(state) || role === 'Human') {
      p.current = p.pending = null;
      p.lastMeaning = null;
      if (item) p.seen = item.id;
      return null;
    }
    if (item && item.id !== p.seen) {
      p.seen = item.id;
      const meaning = JSON.stringify([item.round, item.text, item.detail]);
      if (!replay && meaning !== p.lastMeaning) p.pending = item;
      p.lastMeaning = meaning;
    }
    if (p.pending && now - p.shown >= 4500) {
      p.current = p.pending; p.pending = null; p.shown = now;
    }
    if (now - p.shown >= 6500) p.current = null;
    return p.current;
  }
  reset() { this.people.clear(); }
}
