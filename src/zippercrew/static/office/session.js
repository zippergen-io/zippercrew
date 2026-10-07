// The office is a client of the existing Room API, not a second orchestrator.
// The visual spike stays in spikes/pixel-office; this scene has no simulated work.
const $ = id => document.getElementById(id);
const terminal = state => !state || ['completed', 'failed', 'stopped'].includes(state.status);
const roles = {worker: 'Implementer', reviewer: 'Reviewer', human: 'Human'};
const names = {Implementer: 'Theo · Worker', Reviewer: 'Jules · Reviewer', Human: 'You'};
const node = (tag, text = '', className = '') => {
  const result = document.createElement(tag);
  result.textContent = text;
  result.className = className;
  return result;
};
const button = (text, action, primary = false) => {
  const result = node('button', text, primary ? 'primary-action' : 'secondary-action');
  result.type = 'button';
  result.onclick = action;
  return result;
};
const field = (name, control, hint = '') => {
  const label = node('label', name, 'form-field');
  label.append(control);
  if (hint) label.append(node('span', hint, 'field-help'));
  return label;
};
const input = (id, value = '', multiline = false) => {
  const result = node(multiline ? 'textarea' : 'input');
  result.id = id;
  result.value = value;
  if (multiline) result.rows = 3;
  return result;
};
const select = (id, options, value) => {
  const result = node('select');
  result.id = id;
  for (const [key, title] of options) {
    const option = node('option', title);
    option.value = key;
    result.append(option);
  }
  if (options.some(([key]) => key === value)) result.value = value;
  return result;
};

async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-ZipperCrew': '1'},
    body: JSON.stringify(data),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

export class OfficeSession {
  constructor(scene) {
    this.scene = scene;
    this.room = null;
    this.run = null;
    this.connected = false;
    this.busy = false;
    this.navigation = 0;
    this.profiles = {};
    this.guidanceDrafts = new Map();
    this.mode = null;
    $('room-action').onclick = () => this.openCurrent();
    $('status-action').onclick = () => this.openCurrent();
    $('show-rooms').onclick = () => this.showRooms();
    $('edit-room').onclick = () => this.editRoom(this.room);
    $('detail-dialog').addEventListener('close', () => { this.mode = null; });
    // A save/start is one operation. Keep its destination stable until it finishes.
    $('detail-dialog').addEventListener('cancel', event => { if (this.busy) event.preventDefault(); });
    window.addEventListener('hashchange', () => {
      const id = new URLSearchParams(location.hash.slice(1)).get('room');
      if (id && id !== this.room?.id && !this.busy) this.openRoom(id);
    });
    window.addEventListener('pagehide', () => this.stream?.close());
    window.addEventListener('pageshow', event => {
      if (event.persisted && !terminal(this.run)) this.attach(this.run);
    });
    window.addEventListener('offline', () => {
      this.stream?.close(); this.stream = null; this.connected = false;
      this.scene.handoffs.cancel();this.replayNext=true;
      this.refreshChrome(); this.updateRunWindow();
    });
    window.addEventListener('online', () => { if (!terminal(this.run)) this.attach(this.run); });
  }

  async boot() {
    await this.perform(async () => {
      this.bootstrap = await api('/api/bootstrap');
      this.profiles = (await api(`/api/profiles?project=${encodeURIComponent(this.bootstrap.project)}`)).profiles;
      this.connected = true;
      const rooms = await api('/api/rooms');
      this.initialized = true;
      const id = new URLSearchParams(location.hash.slice(1)).get('room');
      if (id || rooms.length) await this.loadRoom(id || rooms[0].id);
      else await this.buildSetup(null);
    });
    this.refreshChrome();
  }

  async perform(action) {
    if (this.busy) return;
    this.setBusy(true);
    $('session-error').hidden = true;
    try { await action(); }
    catch (error) {
      if (!$('detail-dialog').open) this.window('error', 'Connection', 'Something needs attention', 'Your files and saved rooms are unchanged.');
      $('session-error').textContent = error.message;
      $('session-error').hidden = false;
      if (!this.initialized) $('detail-body').replaceChildren(button('Try again', () => this.boot()));
    } finally { this.setBusy(false); }
  }

  setBusy(value) {
    this.busy = value;
    $('detail-dialog').classList.toggle('is-busy', value);
    $('detail-dialog').setAttribute('aria-busy', String(value));
    document.querySelector('.window-content').inert = value;
    for (const id of ['close-detail', 'back-to-office']) $(id).disabled = value;
    this.refreshChrome();
  }

  window(mode, kind, title, description = '') {
    this.scene.ui.dismiss(false);
    this.scene.ui.explored();
    this.mode = mode;
    $('detail-kind').textContent = kind;
    $('detail-title').textContent = title;
    $('detail-description').textContent = description;
    $('detail-note').textContent = this.bootstrap?.demo ? 'Demo · no repository edits' : 'Local workspace';
    $('detail-body').replaceChildren();
    $('session-error').hidden = true;
    if (!$('detail-dialog').open) $('detail-dialog').showModal();
    $('close-detail').focus();
  }

  openCurrent() {
    if (!this.initialized) { this.boot(); return; }
    if (this.room) this.showTask();
    else this.editRoom(null);
  }

  async loadRoom(id) {
    const navigation = ++this.navigation;
    // Fetch before replacing the current room so failed navigation loses nothing.
    const room = await api(`/api/rooms/${encodeURIComponent(id)}/context`);
    const latest = room.runs.at(-1);
    const run = latest ? await api(`/api/runs/${latest}`) : null;
    if (navigation !== this.navigation) return;
    this.stream?.close();
    this.stream = null;
    this.scene.handoffs.reset();
    this.room = room;
    this.run = null;
    this.connected = true;
    history.replaceState(null, '', `${location.pathname}${location.search}#room=${room.id}`);
    for (const person of this.scene.people.values()) {
      person.liveStatus = 'Ready'; person.bubble?.destroy(); person.bubble = null;
    }
    if (run) this.attach(run,{replay:true});
    this.refreshChrome();
  }

  openRoom(id) {
    return this.perform(async () => {
      await this.loadRoom(id);
      $('detail-dialog').close();
    });
  }

  attach(run,{replay=true}={}) {
    this.stream?.close();
    this.stream = null;
    this.connected = terminal(run);
    this.apply(run,{replay});
    this.replayNext=false;
    if (terminal(run)) return;
    const source = new EventSource(`/api/runs/${run.id}/events`);
    this.stream = source;
    // Wait for the fresh snapshot before enabling a previously pending decision.
    source.addEventListener('state', event => {
      if (this.stream !== source) return;
      this.connected = true;
      this.apply(JSON.parse(event.data),{replay:this.replayNext});this.replayNext=false;
      if (terminal(this.run)) { source.close(); this.stream = null; }
    });
    source.onerror = () => {
      if (this.stream !== source) return;
      this.connected = false; this.replayNext=true;this.scene.handoffs.cancel();this.refreshChrome(); this.updateRunWindow();
    };
    this.refreshChrome();
  }

  apply(state,{replay=false}={}) {
    if (this.run?.id === state.id && state.version < this.run.version) return;
    const previous = this.run;
    this.run = state;
    for (const [id, role] of Object.entries(roles)) {
      const person = this.scene.people.get(id);
      const status = state.participants[role];
      person.liveStatus = status === 'needs human' ? 'Your decision' : status;
    }
    this.scene.handoffs.observe(state,{replay});
    if(!replay)this.scene.handoffs.status(state,previous);
    this.refreshChrome();
    this.updateRunWindow();
  }

  refreshChrome() {
    const run = this.taskRun;
    this.scene.board.update(this.room,run,this.connected);
    $('room-name').textContent = this.room?.name || 'The studio';
    $('room-action').disabled = this.busy;
    $('room-action').textContent = !this.initialized ? 'Connect' : !this.room ? 'New room' : this.run?.pending ? 'Your decision' : 'Task';
    const prefix = this.bootstrap?.demo ? 'Demo · ' : '';
    let status = !this.bootstrap ? 'Connecting…' : !this.room ? 'Ready for your first room' : !run ? 'Ready to start' : run.pending ? 'Your decision' : run.status;
    if (run && !terminal(run) && !this.connected) status = 'Reconnecting…';
    const round = run?.round ? ` · round ${run.round}` : '';
    $('scene-state').textContent = prefix + status.charAt(0).toUpperCase() + status.slice(1) + round;
    $('status-action').disabled = this.busy;
    $('edit-room').disabled = this.busy || !terminal(this.run);
    if (this.run && !run) for (const person of this.scene.people.values()) person.liveStatus = 'Ready';
    if (this.scene.selected) this.scene.ui.updatePerson();
  }

  editRoom(record) { return this.perform(() => this.buildSetup(record)); }

  async buildSetup(record) {
    if (record && !terminal(this.run)) { this.showTask(); return; }
    const project = record?.config.project || this.bootstrap.project;
    // Reopening a room can use a different profile directory from the server default.
    try { this.profiles = (await api(`/api/profiles?project=${encodeURIComponent(project)}`)).profiles; }
    catch (error) {
      this.window('error', 'Room setup', 'Could not load agent profiles');
      $('session-error').textContent = error.message; $('session-error').hidden = false;
      return;
    }
    this.window('setup', 'Worker → Reviewer → You', record ? 'Room setup' : 'Create a room', 'Give the crew a repository and one clear task.');
    const config = record?.config || {};
    const form = node('form', '', 'room-form');
    form.id = 'room-form';
    const name = input('setup-name', record?.name || 'My room'); name.required = true; name.maxLength = 120;
    const workspace = input('setup-workspace', config.workspace); workspace.required = true; workspace.placeholder = '/Users/you/projects/my-app';
    workspace.spellcheck = false;
    const brief = input('setup-brief', record?.brief, true); brief.required = true; brief.rows = 4; brief.maxLength = 30000;
    brief.placeholder = 'What should the agents work on? Include what a good result looks like.';
    form.append(field('Room name', name), field('Repository path', workspace), field('Task', brief));
    let options = Object.entries(this.profiles).map(([key, value]) => [key, `${key} · ${value.backend === 'codex' ? 'Codex' : 'Claude'}`]);
    if (this.bootstrap.demo) options = [['demo', 'Scripted demo']];
    else for (const backend of ['codex', 'claude']) {
      if (!options.some(([key]) => this.profiles[key]?.backend === backend)) {
        options.push([`new:${backend}`, `${backend === 'codex' ? 'Codex' : 'Claude'} · default settings`]);
      }
    }
    const choices = node('div', '', 'form-columns');
    const custom = node('details', '', 'extra-options');
    custom.append(node('summary', 'Agent instructions & options'));
    const selectors = {}, instructions = {};
    const preferred = options.find(([key]) => this.bootstrap.checks?.[this.profiles[key]?.backend || key.replace('new:', '')]?.supported)?.[0];
    for (const [role, label] of [['Implementer', 'Worker'], ['Reviewer', 'Reviewer']]) {
      const binding = config.agents?.[role] || {};
      const roleOptions = [...options];
      if (binding.profile && !roleOptions.some(([key]) => key === binding.profile)) roleOptions.unshift([binding.profile, `${binding.profile} · unavailable`]);
      selectors[role] = select(`setup-${role}`, roleOptions, binding.profile || preferred);
      choices.append(field(label, selectors[role]));
      instructions[role] = input(`instructions-${role}`, binding.instructions, true);
      instructions[role].maxLength = 30000;
      custom.append(field(`${label} instructions`, instructions[role], 'Optional; added to the shared task.'));
    }
    const rounds = input('setup-rounds', String(config.max_rounds || 4));
    rounds.type = 'number'; rounds.min = '1'; rounds.max = '100'; rounds.required = true;
    const involvement = select('setup-involvement', [['brief', 'Review each round'], ['full', 'Decide each round'], ['auto', 'Let the reviewer decide']], config.human_mode || 'brief');
    custom.append(field('Your involvement', involvement), field('Maximum rounds', rounds));
    form.append(choices, node('p', 'Worker can edit files. Reviewer has read-only access.', 'field-help'), custom);
    if (!this.bootstrap.demo) {
      const checks = Object.entries(this.bootstrap.checks || {}).filter(([, check]) => !check.supported);
      for (const [backend, check] of checks) form.append(node('p', `${backend === 'codex' ? 'Codex' : 'Claude'}: ${check.detail}`, 'field-help'));
    }
    const actions = node('div', '', 'form-actions');
    const save = button('Save room', null); save.type = 'submit'; save.value = 'save';
    const start = button('Start task', null, true); start.id = 'setup-start'; start.type = 'submit'; start.value = 'start';
    actions.append(save, start); form.append(actions);
    form.onsubmit = event => {
      event.preventDefault();
      const launch = event.submitter?.value === 'start';
      this.perform(async () => {
        const agents = {};
        for (const role of ['Implementer', 'Reviewer']) {
          let profile = selectors[role].value;
          if (profile.startsWith('new:')) {
            const backend = profile.slice(4);
            profile = await this.defaultProfile(project, backend);
          }
          agents[role] = {profile, instructions: instructions[role].value,
            settings: profile === config.agents?.[role]?.profile ? config.agents[role].settings || {} : {}};
        }
        const data = {name: name.value.trim(), brief: brief.value.trim(), config: {
          ...config, project, workspace: workspace.value.trim(), agents,
          max_rounds: Number(rounds.value), human_mode: involvement.value,
        }};
        // Retain the saved ID if launch fails; retry must not create another room.
        record = await api(record ? `/api/rooms/${record.id}/save` : '/api/rooms', data);
        await this.loadRoom(record.id);
        if (launch) { const run = await api(`/api/rooms/${record.id}/runs`, {}); this.attach(run,{replay:false}); this.showTask(); }
        else $('detail-dialog').close();
      });
    };
    $('detail-body').append(form);
    name.focus();
  }

  async defaultProfile(project, backend) {
    const base = `office-${backend}`;
    let name = base, suffix = 2;
    while (this.profiles[name] && this.profiles[name].backend !== backend) name = `${base}-${suffix++}`;
    if (!this.profiles[name]) {
      try { this.profiles = (await api('/api/profiles', {project, name, backend})).profiles; }
      catch (error) {
        this.profiles = (await api(`/api/profiles?project=${encodeURIComponent(project)}`)).profiles;
        if (this.profiles[name]?.backend !== backend) throw error;
      }
    }
    return name;
  }

  // After editing the brief, the previous result belongs in history, not under
  // the new task. An active run always retains its immutable execution snapshot.
  get taskRun() {
    return terminal(this.run) && this.run?.config.task !== this.room?.brief ? null : this.run;
  }

  showTask(owner) {
    if (!this.room) { this.editRoom(null); return; }
    this.window('task', 'Current task', this.room.name);
    this.owner = owner;
    this.pendingKey = undefined;
    this.reportKey = undefined;
    const meta = node('p', this.room.config.workspace, 'repository-path');
    $('detail-body').append(meta, node('p', this.room.brief, 'task-brief'),
      node('div', '', 'run-summary'), node('div', '', 'decision'), node('div', '', 'run-reports'), node('div', '', 'run-actions'));
    this.updateRunWindow();
  }

  updateRunWindow() {
    if (this.mode !== 'task') return;
    const run = this.taskRun;
    const summary = document.querySelector('.run-summary');
    summary.textContent = run ? run.error || run.outcome || `${this.connected ? run.pending ? 'Your decision' : run.status : 'Reconnecting…'} · Round ${run.round || 1}` : 'Ready to start';
    const pending = this.connected && !terminal(run) ? run.pending : null;
    const pendingKey = pending?.id || null;
    if (this.pendingKey !== pendingKey) {
      this.pendingKey = pendingKey;
      const panel = document.querySelector('.decision'); panel.replaceChildren();
      if (pending) {
        const {kind, rendered} = pending.spec;
        panel.append(node('h3', 'Over to you'));
        if (rendered.context) {
          const details = node('details'); details.open = true;
          details.append(node('summary', 'Review & context'), node('pre', rendered.context, 'message-text')); panel.append(details);
        }
        const actions = node('div', '', 'form-actions');
        if (kind === 'select') {
          panel.append(node('p', `Ship it completes this run without committing. Another round sends the review back for changes. ${run.round >= run.config.max_rounds ? 'The round limit is reached; another round will end this run unresolved.' : ''}`, 'field-help'));
          for (const value of (rendered.prefill || '').split('\n').filter(Boolean)) actions.append(button(value, () => this.answer(pending.id, value), value === 'Ship it'));
        } else {
          const guidance = input('decision-guidance', this.guidanceDrafts.get(pending.id) || '', true);
          guidance.maxLength = 30000;
          guidance.oninput = () => this.guidanceDrafts.set(pending.id, guidance.value);
          panel.append(field(rendered.instruction || 'Your guidance', guidance));
          actions.append(button('Continue', () => this.answer(pending.id, guidance.value), true));
          guidance.focus();
        }
        panel.append(actions);
      }
    }
    const reports = document.querySelector('.run-reports');
    const reportKey = `${run?.id}:${run?.transcript.length || 0}:${this.owner}`;
    if (this.reportKey !== reportKey) {
      this.reportKey = reportKey;
      this.renderReports(reports, run, this.owner);
    }
    const actions = document.querySelector('.run-actions');
    // Do not recreate controls on every progress event (keyboard focus stays put).
    const actionKey = `${run?.id}:${terminal(run)}:${this.connected}`;
    if (actions.dataset.key !== actionKey) {
      actions.dataset.key = actionKey;
      actions.replaceChildren();
      if (terminal(run)) actions.append(button(run ? 'Edit task & run again' : 'Edit setup / start', () => this.editRoom(this.room), true));
      else {
        const stop = button('Stop run', () => this.perform(async () => {
          const state = await api(`/api/runs/${run.id}/stop`, {}); this.apply(state);
          this.stream?.close(); this.stream = null; this.connected = true; this.refreshChrome();
        }));
        stop.disabled = !this.connected; actions.append(stop);
      }
    }
  }

  answer(requestId, value) {
    return this.perform(async () => {
      const state = await api(`/api/runs/${this.run.id}/answer`, {request_id: requestId, value});
      this.guidanceDrafts.delete(requestId);
      this.apply(state);
    });
  }

  renderReports(container, run, owner) {
    container.replaceChildren();
    const entries = (run?.transcript || []).filter(entry => !roles[owner] || entry.role === roles[owner]);
    if (!entries.length) {
      container.append(node('p', run && !terminal(run) ? 'Agent messages appear here as each turn finishes.' : 'No messages yet.', 'field-help'));
      return;
    }
    container.append(node('h3', owner && roles[owner] ? `${names[roles[owner]]} · messages` : 'Conversation'));
    for (const entry of entries) {
      const details = node('details', '', 'run-message');
      details.append(node('summary', `${names[entry.role] || entry.role} · Round ${entry.round || 1}`));
      for (const [key, value] of Object.entries(entry.outputs || {})) {
        details.append(node('h4', key.replaceAll('_', ' ')), node('pre', typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'message-text'));
      }
      container.append(details);
    }
    const trace = node('a', 'Download full trace', 'trace-link');
    trace.href = `/api/runs/${run.id}/trace`; trace.download = `run-${run.id}.jsonl`;
    container.append(trace);
  }

  showRooms() {
    return this.perform(async () => {
      const rooms = await api('/api/rooms');
      this.window('rooms', 'Your workspace', 'Rooms');
      const list = node('div', '', 'room-list');
      for (const room of rooms) {
        const item = button('', () => this.openRoom(room.id));
        item.append(node('strong', room.name), node('span', room.latest?.status || 'Ready', 'field-help'));
        list.append(item);
      }
      if (!rooms.length) list.append(node('p', 'Your saved rooms will appear here.', 'field-help'));
      list.append(button('New room', () => this.editRoom(null), true));
      $('detail-body').append(list);
    });
  }

  showHistory() {
    if (!this.room) { this.showRooms(); return; }
    return this.perform(async () => {
      const runs = await api(`/api/rooms/${this.room.id}/runs`);
      this.window('history', this.room.name, 'Run history');
      const list = node('div', '', 'room-list');
      for (const run of runs) list.append(button(`Run ${run.number} · ${run.status}`, () => this.perform(async () => {
        const state = await api(`/api/runs/${run.id}`);
        this.window('history-run', 'Saved run · read only', `Run ${run.number}`, state.error || state.outcome || state.status);
        $('detail-body').append(node('p', state.config.task, 'task-brief'));
        const reports = node('div'); this.renderReports(reports, state); $('detail-body').append(reports);
      })));
      if (!runs.length) list.append(node('p', 'No runs yet.', 'field-help'));
      $('detail-body').append(list);
    });
  }
}
