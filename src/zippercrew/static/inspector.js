// Participant inspection is a read-only view of the journal, never orchestration.
import { marked } from './vendor/marked-18.0.14.js';
import DOMPurify from './vendor/purify-3.4.16.js';

export function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}

export function markdown(text) {
  const el = node('div', undefined, 'message-prose');
  el.append(DOMPurify.sanitize(marked.parse(String(text)), {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
      'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'a',
      'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'title', 'start'],
  }));
  // No active local paths, custom schemes, images or embedded UI from agent output.
  for (const link of el.querySelectorAll('a')) {
    if (!/^https?:\/\//i.test(link.getAttribute('href') || '')) link.removeAttribute('href');
    else { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  }
  return el;
}
function plain(text) { return markdown(text).textContent.replace(/\s+/g, ' ').trim(); }
function preview(text, limit = 160) {
  const value = plain(text);
  return value.length <= limit ? value : value.slice(0, limit).replace(/\s+\S*$/, '') + '…';
}
export function reviewHeader(text) {
  const match = String(text).trim().match(/^(APPROVE|REVISE)\s*\nFINDINGS:\s*(\d+)\s*\n([^\n]+)/);
  return match ? { verdict: match[1], findings: Number(match[2]), headline: match[3] } : null;
}
function reviewLabel(review) {
  return `${review.verdict} · ${review.findings} ${review.findings === 1 ? 'finding' : 'findings'}`;
}
const titles = { task: 'Task', proposal: 'Proposal', critique: 'Review', guidance: 'Guidance' };

// Correlation follows runtime channels, including recv-before-send trace ordering.
// Full history comes from the existing trace endpoint, not assistant turn inputs.
export function conversation(events) {
  const messages = new Map();
  let round = 0;
  for (const event of events) {
    if (event.type !== 'runtime') continue;
    const raw = event.event;
    if (raw.type === 'act_start' && raw.action_kind === 'assistant' && raw.lifeline === 'Implementer') round++;
    if (!['send', 'recv'].includes(raw.type)) continue;
    const id = JSON.stringify([raw.from, raw.to, raw.channel ?? null, raw.seq ?? null]);
    const item = messages.get(id) || { id, from: raw.from, to: raw.to, round, channel: raw.channel, seq: raw.seq };
    item[raw.type === 'send' ? 'send_id' : 'receive_id'] = event.id;
    if (raw.type === 'send' || !item.send_id) {
      item.bindings = raw.bindings || {};
      item.control = !!(raw.control || raw.ctrl);
      item.fields = Object.keys(item.bindings);
      item.label = item.control ? 'Control' : item.fields.map(f => titles[f] || f).join(' · ') || 'Message';
      item.text = Object.values(item.bindings).map(v => typeof v === 'string' ? v : JSON.stringify(v, null, 2)).join('\n\n');
      item.review = item.fields.includes('critique') ? reviewHeader(item.bindings.critique) : null;
    }
    messages.set(id, item);
  }
  return [...messages.values()].sort((a, b) => (a.send_id ?? a.receive_id) - (b.send_id ?? b.receive_id));
}
export function localHistory(events, state, role) {
  const entries = new Map();
  let active = false, invocation = null;
  for (const event of events) {
    const raw = event.event;
    if (event.type === 'runtime' && raw.lifeline === role && raw.action_kind === 'assistant') {
      if (raw.type === 'act_start') active = true;
      if (raw.type === 'act') { active = false; invocation = null; }
    }
    if (['room.completed', 'room.failed', 'room.stopped'].includes(event.type)) { active = false; invocation = null; }
    if (event.type === 'assistant.invocation' && event.role === role && active) invocation = event.invocation_id;
    if (event.type === 'assistant.progress' && event.role === role && active && invocation === event.invocation_id) {
      entries.set(event.id, { id: event.id, text: event.activity.text });
    }
  }
  for (const item of state.progress || []) if (item.role === role) entries.set(item.id, item);
  // Keep the most recent occurrence of equivalent activity; never make protocol entries.
  const unique = new Map();
  for (const item of [...entries.values()].sort((a, b) => a.id - b.id)) {
    const key = item.text.replace(/[…\.\s]+$/g, '').toLowerCase();
    unique.delete(key); unique.set(key, item);
  }
  return [...unique.values()].slice(-5);
}
const states = { working: 'Working', reviewing: 'Reviewing', waiting: 'Waiting',
  'needs human': 'Needs you', completed: 'Completed', failed: 'Failed', stopped: 'Stopped', ready: 'Ready' };
const cli = backend => ({ codex: 'Codex CLI', claude: 'Claude CLI', demo: 'Scripted demo' }[backend] || backend || 'CLI');
function detail(key, title) {
  const el = node('details'); el.dataset.key = key; el.append(node('summary', title)); return el;
}
function meta(values) {
  const dl = node('dl', undefined, 'participant-meta');
  for (const [key, value] of Object.entries(values)) dl.append(node('dt', key), node('dd', value));
  return dl;
}
function preserve(container, key, build) {
  if (container.dataset.renderKey === key) return;
  const open = new Map([...container.querySelectorAll('details[data-key]')].map(d => [d.dataset.key, d.open]));
  const focusKey = document.activeElement?.closest('[data-key]')?.dataset.key;
  container.replaceChildren(...build());
  for (const d of container.querySelectorAll('details[data-key]')) {
    if (open.has(d.dataset.key)) d.open = open.get(d.dataset.key);
    if (d.dataset.key === focusKey) d.querySelector('summary')?.focus({ preventScroll: true });
  }
  container.dataset.renderKey = key;
}
export function resetInspector(containers) {
  for (const el of containers) { el.replaceChildren(); delete el.dataset.renderKey; }
}
function messageCard(message, role) {
  const sent = message.from === role;
  const card = node('article', undefined, 'message-card'); card.dataset.message = message.id;
  card.dataset.direction = sent ? 'sent' : 'received';
  const route = sent ? `Sent to ${message.to}` : message.receive_id ? `Received from ${message.from}` : `Incoming from ${message.from}`;
  card.append(node('p', `${sent ? '→' : '←'} ${route}`, 'message-route'), node('h4', message.label));
  if (!message.receive_id) card.append(node('small', 'Awaiting runtime receive', 'message-pending'));
  if (message.review) card.append(node('p', reviewLabel(message.review), `review-badge ${message.review.verdict.toLowerCase()}`));
  card.append(node('p', preview(message.review?.headline || message.text.split(/\n\s*\n/)[0]), 'message-preview'));
  const full = detail(`message:${message.id}`, `View full ${message.label.toLowerCase()}`);
  full.className = 'message-full';
  // Render full content only on demand. Previews never contain multi-page payloads.
  full.addEventListener('toggle', () => {
    if (!full.open || full.querySelector('.full-payload')) return;
    const body = node('div', undefined, 'full-payload');
    for (const [field, value] of Object.entries(message.bindings)) {
      if (message.fields.length > 1) body.append(node('h4', titles[field] || field));
      if (typeof value === 'string') body.append(markdown(value));
      else body.append(node('pre', JSON.stringify(value, null, 2)));
    }
    const refs = detail(`refs:${message.id}`, 'Message details');
    refs.append(meta({ Route: `${message.from} → ${message.to}`, Channel: message.channel ?? 'Default',
      Sequence: String(message.seq ?? 'Not exposed'), 'Send event': String(message.send_id ?? 'Awaiting trace'),
      'Receive event': String(message.receive_id ?? 'Pending') }));
    body.append(refs); full.append(body);
  });
  card.append(full); return card;
}
export function renderParticipant({ state, role, events, loading, error, overview, conversation: container, technical }) {
  const binding = state.config.agents[role.name] || {};
  const semantic = state.participants[role.name];
  const messages = conversation(events).filter(m => !m.control && (m.from === role.name || m.to === role.name));
  const sent = messages.filter(m => m.from === role.name && m.send_id).at(-1);
  const response = role.kind === 'human' ? state.transcript.filter(e => e.role === role.name && e.action === 'response').at(-1) : null;
  const active = ['working', 'reviewing'].includes(semantic);
  const activity = state.local_activity?.[role.name];
  preserve(overview, JSON.stringify([semantic, state.round, activity, sent?.id, response, loading]), () => {
    const stateRow = node('div', undefined, 'participant-state');
    const badge = node('span', states[semantic] || semantic, 'state-badge'); badge.dataset.state = semantic;
    stateRow.append(badge, node('span', `Round ${state.round} of ${state.config.max_rounds}`));
    const identity = node('p', role.kind === 'agent' ? `${cli(binding.backend)} · ${role.access}` : 'Human participant · You', 'participant-runtime');
    const section = node('section', undefined, 'current-activity');
    section.append(node('h3', active || semantic === 'needs human' ? 'Current activity' : 'Last activity'));
    if (active) section.append(node('p', activity?.text || (semantic === 'reviewing' ? 'Reviewing the proposal…' : 'Working on the task…'), 'activity-title'));
    else if (semantic === 'needs human') section.append(node('p', 'Your decision is needed', 'activity-title'));
    else if (response) {
      section.append(node('p', 'Responded to the crew', 'activity-title'));
      section.append(node('p', preview(response.outputs.answer || 'No additional guidance'), 'activity-headline'));
    }
    else if (sent) {
      const title = sent.label === 'Review' ? 'Completed review' : sent.label === 'Proposal' ? 'Completed implementation' : `Sent ${sent.label.toLowerCase()}`;
      section.append(node('p', title, 'activity-title'));
      if (sent.review) {
        section.append(node('p', reviewLabel(sent.review), `review-badge ${sent.review.verdict.toLowerCase()}`));
        section.append(node('p', preview(sent.review.headline, 160), 'activity-headline'));
      }
      section.append(node('small', `${sent.label} sent to ${sent.to}`, 'activity-consequence'));
    } else section.append(node('p', loading ? 'Loading conversation…' : 'No protocol message sent yet.', 'hint'));
    return [stateRow, identity, section];
  });
  const conversationKey = JSON.stringify([state.id, role.name, state.round, messages, loading, error]);
  if (container.dataset.round !== String(state.round)) {
    for (const group of container.querySelectorAll('.conversation-round')) group.open = false;
    container.dataset.round = state.round;
  }
  preserve(container, conversationKey, () => {
    const heading = node('h3', 'Conversation', 'section-heading');
    if (error) return [heading, node('p', 'Conversation unavailable. Reopen the participant to retry; the full trace remains available below.', 'hint')];
    if (!messages.length) return [heading, node('p', loading ? 'Loading protocol messages…' : 'No protocol messages yet.', 'hint')];
    const groups = new Map();
    for (const message of messages) {
      const round = message.round || 0;
      if (!groups.has(round)) groups.set(round, []);
      groups.get(round).push(message);
    }
    const latest = Math.max(state.round, ...groups.keys());
    const sections = [...groups.keys()].sort((a, b) => b - a).map(round => {
      const group = detail(`round:${round}`, round ? `Round ${round}` : 'Initial brief');
      group.className = 'conversation-round'; group.dataset.round = round; group.open = round === latest;
      for (const message of groups.get(round)) group.append(messageCard(message, role.name));
      return group;
    });
    if (latest && !groups.has(latest)) sections.unshift(node('p', `Round ${latest} · Waiting for the next handoff.`, 'hint'));
    return [heading, ...sections];
  });
  const history = localHistory(events, state, role.name);
  preserve(technical, JSON.stringify([state.id, role.name, history]), () => {
    const activityLog = detail('activity-log', 'Show activity log'); activityLog.className = 'quiet-details';
    activityLog.append(node('p', 'Recent distinct local activity. Complete event history is in the trace.', 'hint'));
    const list = node('ul', undefined, 'activity-log');
    for (const item of history) list.append(node('li', item.text));
    activityLog.append(history.length ? list : node('p', 'No local CLI activity recorded.', 'hint'));
    const settings = detail('technical', 'Technical details'); settings.className = 'quiet-details';
    settings.append(meta(role.kind === 'agent' ? {
      Profile: binding.profile, Runtime: cli(binding.backend), Model: binding.model || 'CLI default model',
      Effort: binding.reasoning_effort || 'Default effort', Access: role.access,
      Workspace: state.config.workspace.split('/').filter(Boolean).at(-1), 'Full path': state.config.workspace,
      'Role instructions': binding.instructions || 'No additional instructions',
    } : { Involvement: { full: 'Decide every round', brief: 'Brief me every round', auto: 'Autonomous review' }[state.config.human_mode],
      'Maximum rounds': String(state.config.max_rounds), Workspace: state.config.workspace }));
    return [activityLog, settings];
  });
}
