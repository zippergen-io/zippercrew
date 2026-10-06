/* Cosmetic policy only. Injected time/randomness makes long idle periods testable.
 * Nothing here emits a workflow event or enables a process action. */
const AMBIENT_STATES = new Set(['ready', 'waiting', 'completed']);
const ACTIONS = {
  Implementer: ['stretch', 'coffee', 'monitor', 'board', 'look-around'],
  Reviewer: ['tablet', 'board', 'coffee', 'skeptical', 'sit'],
  Human: ['phone', 'look-around', 'coffee', 'window', 'laptop', 'board'],
};
export class AmbientDirector {
  constructor(random = Math.random) {
    this.random = random;
    this.people = new Map();
    this.reservations = new Map();
  }
  pause(min, spread) { return min + this.random() * spread; }
  cancel(role) {
    const p = this.people.get(role);
    if (p?.resource) this.reservations.delete(p.resource);
    this.people.delete(role);
  }
  step(role, state, now, reduced = false) {
    let p = this.people.get(role);
    if (!AMBIENT_STATES.has(state) || reduced) { this.cancel(role); return null; }
    if (!p || p.state !== state) {
      this.cancel(role);
      p = { state, due: now + this.pause(18000, 26000), action: null, previous: null, lastAction: now };
      this.people.set(role, p);
    }
    if (p.action && now >= p.until) {
      if (p.resource) this.reservations.delete(p.resource);
      p.action = null;
      p.resource = null;
      p.due = now + this.pause(30000, 50000);
    }
    if (!p.action && now >= p.due) {
      p.due = now + this.pause(25000, 40000);
      // Ordinary stillness is intentionally the most frequent outcome.
      if (this.random() < 0.65 && now - p.lastAction < 100000) return null;
      const choices = (ACTIONS[role] || ['look-around']).filter(a => a !== p.previous);
      const action = choices[Math.floor(this.random() * choices.length)];
      const resource = ['coffee', 'board', 'window'].includes(action)
        ? 'back-aisle' : null;
      if (resource && this.reservations.has(resource)) return null;
      if (resource) this.reservations.set(resource, role);
      Object.assign(p, { lastAction: now, action, previous: action, resource, until: now + this.pause(6500, 4500) });
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
