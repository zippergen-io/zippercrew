import { OfficeConfiguration } from './configuration.js';
import { OfficeDecisions } from './decisions.js';
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
  control.setAttribute('aria-label',name);
  label.append(control);
  if(hint){const help=node('span',hint,'field-help');help.id=`${control.id}-hint`;help.setAttribute('aria-hidden','true');control.setAttribute('aria-describedby',help.id);label.append(help);}
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
    this.preferences={motion:"full",appearance:"day"};
    this.guidanceDrafts = new Map();
    this.mode = null;
    $('room-action').onclick = () => !this.room ? this.configuration.newRoom() : terminal(this.run) ? this.configuration.start() : this.run.pending ? this.showTask() : this.stopRun();
    this.configuration=new OfficeConfiguration(this);
    this.decisions=new OfficeDecisions(this);
    $('detail-dialog').addEventListener('close', () => { if(!$('detail-dialog').open)this.mode = null; });
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
      this.preferences=this.bootstrap.preferences;
      this.configuration.sync();
      if(!this.scene.explicitMood)this.scene.setMood(this.preferences.appearance);
      this.profiles = (await api(`/api/profiles?project=${encodeURIComponent(this.bootstrap.project)}`)).profiles;
      this.connected = true;
      const rooms = await api('/api/rooms');
      this.initialized = true;
      const id = new URLSearchParams(location.hash.slice(1)).get('room');
      if (id || rooms.length) await this.loadRoom(id || rooms[0].id);
      else await this.configuration.showDrawer('rooms');
    });
    this.refreshChrome();
  }

  async perform(action,{errorHost=null}={}) {
    if (this.busy) return;
    this.setBusy(true);
    $('session-error').hidden = true;
    errorHost?.querySelector('.decision-error')?.remove();
    try { await action(); }
    catch (error) {
      if(errorHost?.isConnected&&!$('detail-dialog').open){
        const message=node('p',error.message,'decision-error session-error');message.setAttribute('role','alert');errorHost.append(message);
      }else{
        if (!$('detail-dialog').open) this.window('error', 'Connection', 'Something needs attention', 'Your files and saved rooms are unchanged.');
        $('session-error').textContent = error.message;
        $('session-error').hidden = false;
      }
      if (!this.initialized) $('detail-body').replaceChildren(button('Try again', () => this.boot()));
    } finally { this.setBusy(false); }
  }

  setBusy(value) {
    this.busy = value;
    $('studio-menu').inert=value;$('person-card').inert=value;$('menu-toggle').disabled=value;
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
    if(this.room)await this.configuration.drafts.flush(this.room.id);
    // Fetch before replacing the current room so failed navigation loses nothing.
    const room = await api(`/api/rooms/${encodeURIComponent(id)}/context`);
    const profiles=(await api(`/api/profiles?project=${encodeURIComponent(room.config.project||this.bootstrap.project)}`)).profiles;
    const latest = room.runs.at(-1);
    const run = latest ? await api(`/api/runs/${latest}`) : null;
    if (navigation !== this.navigation) return;
    this.stream?.close();
    this.stream = null;
    this.scene.ambient.cancel();this.scene.activity.reset();
    this.scene.handoffs.reset();
    this.room = room;this.profiles=profiles;
    this.run = null;
    this.configuration.sync();
    this.connected = true;
    history.replaceState(null, '', `${location.pathname}${location.search}#room=${room.id}`);
    for (const person of this.scene.people.values()) {
      person.liveStatus = 'Ready'; person.bubble?.destroy(); person.bubble = null;
    }
    if (run) this.attach(run,{replay:true});
    this.configuration.sync();this.refreshChrome();
  }

  openRoom(id) {
    return this.perform(async () => {
      await this.loadRoom(id);
      $('detail-dialog').close();this.scene.ui.dismiss(false);
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
      const person = this.scene.people.get(id);if(!person)continue;
      const status = state.participants[role];
      person.liveStatus = status === 'needs human' ? 'Your decision' : status;
    }
    this.scene.handoffs.observe(state,{replay});
    this.scene.activity.observe(state,{replay});
    if(!replay&&state.pending&&state.pending.id!==previous?.pending?.id)this.scene.handoffs.status(state,previous);
    this.refreshChrome();
    this.updateRunWindow();
  }

  refreshChrome() {
    const run = this.taskRun;
    this.scene.board.update(this.room,run,this.connected);
    this.scene.attention?.update();
    $('room-name').textContent = this.room?.name || 'The studio';
    const missing=this.room?this.configuration.missing():[],active=!terminal(this.run);
    $('room-action').disabled = this.busy||!this.initialized||(active?!this.connected:!!missing.length);
    $('room-header').disabled=this.busy||!this.initialized;
    $('room-action').textContent = !this.room ? 'New room' : active ? this.run.pending ? 'Your decision' : 'Stop' : 'Run';
    $('room-action').dataset.state=active?'active':'ready';
    $('room-action').title=active?'':missing.length?missing.join(' · '):'Run the current task';
    $('scene-state').dataset.state=!this.initialized||!this.connected?'neutral':missing.length?'setup':'ready';
    const prefix = (this.bootstrap?.demo?'Demo · ':'')+(this.room?`${this.configuration.workflow==='direct'?'Direct':'Review'} · `:'');
    let status = !this.bootstrap ? 'Connecting…' : !this.room ? 'Ready for your first room' : !run ? this.configuration.missing().length?'Setup needed':'Ready to start' : run.pending ? 'Your decision' : run.status;
    if (run && !terminal(run) && !this.connected) status = 'Reconnecting…';
    const round = run?.round ? ` · round ${run.round}` : '';
    $('scene-state').textContent = prefix + status.charAt(0).toUpperCase() + status.slice(1) + round;

    if (this.run && !run) for (const person of this.scene.people.values()) person.liveStatus = 'Ready';
    if (this.scene.selected) this.scene.ui.updatePerson();
  }

  editRoom(record) { return this.perform(() => this.buildSetup(record)); }

  async buildSetup(record){return record?this.configuration.editTask():this.configuration.newRoom();}

  async defaultProfile(project, backend) {
    const base = `office-${backend}`;
    let name = base, suffix = 2;
    while (this.profiles[name] && (this.profiles[name].backend !== backend||this.profiles[name].model||this.profiles[name].reasoning_effort)) name = `${base}-${suffix++}`;
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
    return terminal(this.run) && (this.run?.config.task !== this.room?.brief||(this.run?.config.workflow||'review')!==(this.room?.config.workflow||'review')) ? null : this.run;
  }

  showTask(owner) {
    if (!this.room) { this.editRoom(null); return; }
    if(this.decisions.pending){this.decisions.open();return;}
    if(!this.room.brief?.trim()){this.configuration.editTask();return;}
    this.window('task', 'Current task', this.room.name);
    this.owner = owner;
    this.pendingKey = undefined;
    this.reportKey = undefined;
    const meta = node('p', this.room.config.workspace, 'repository-path');
    $('detail-body').append(meta, node('p', this.room.brief, 'task-brief'),
      node('div', '', 'run-summary'), node('div', '', 'decision'), node('div', '', 'run-progress'), node('div', '', 'shell-log'), node('div', '', 'run-reports'), node('div', '', 'run-actions'));
    this.updateRunWindow();
  }

  updateRunWindow() {
    if(this.mode==='decision'){this.decisions.update();return;}
    if (this.mode !== 'task') return;
    if(this.decisions.pending){this.decisions.open();return;}
    const run = this.taskRun;
    const summary = document.querySelector('.run-summary');
    summary.textContent = run ? run.error || run.outcome || `${this.connected ? run.pending ? 'Your decision' : run.status : 'Reconnecting…'} · Round ${run.round || 1}` : 'Ready to start';
    this.scene.activity.renderRecent(document.querySelector('.run-progress'),this.owner,1,run);
    const reports = document.querySelector('.run-reports');
    const reportKey = `${run?.id}:${run?.transcript.length || 0}:${this.owner}`;
    if (this.reportKey !== reportKey) {
      this.reportKey = reportKey;
      reports.replaceChildren(button('Open activity history',()=>this.configuration.showDrawer('history')));
    }
    const actions = document.querySelector('.run-actions');
    // Do not recreate controls on every progress event (keyboard focus stays put).
    const actionKey = `${run?.id}:${terminal(run)}:${this.connected}`;
    if (actions.dataset.key !== actionKey) {
      actions.dataset.key = actionKey;
      actions.replaceChildren();
      if (terminal(run)){actions.append(button('Edit task',()=>this.configuration.editTask()));const start=button('Run task',()=>this.configuration.start(),true);start.disabled=!!this.configuration.missing().length;actions.append(start);if(start.disabled)actions.append(node('p',this.configuration.missing().join(' · '),'field-help'));}
      else {
        const stop = button('Stop run', () => this.stopRun());
        stop.disabled = !this.connected; actions.append(stop);
      }
    }
  }

  stopRun(){
    return this.perform(async()=>{
      const state=await api(`/api/runs/${this.run.id}/stop`,{});this.apply(state);
      this.stream?.close();this.stream=null;this.connected=true;this.refreshChrome();
      this.confirmInOffice('worker','Run stopped.\nYour edits and history are kept.');
    });
  }

  confirmInOffice(id,text){
    $('detail-dialog').close();this.mode=null;this.scene.ui.dismiss(false);
    this.scene.activity.react(id,text);this.scene.ui.explored();
  }

  answer(requestId, value, {note='',noteKey=requestId,errorHost=null}={}) {
    return this.perform(async () => {
      const id=this.run.id,round=this.run.round,legacy=value==='Another round'&&!this.bootstrap.decision_notes;
      if(legacy)this.decisionContinuation={id,round};
      try{
        const state = await api(`/api/runs/${id}/answer`, {request_id: requestId, value,...(value==='Another round'&&!legacy?{note}:{})});
        this.apply(state);
        if(legacy)await this.completeLegacyDecision(id,round,note);
        this.guidanceDrafts.delete(noteKey);
      }finally{this.decisionContinuation=null;}
      const reactions={
        'Done':['worker','Result accepted.\nFinishing this run.'],
        'Ship it':[this.configuration.workflow==='direct'?'worker':'reviewer','Approval received.\nFinishing this run.'],
        'Abandon':[this.configuration.workflow==='direct'?'worker':'reviewer','Decision recorded.\nEnding this run.'],
        'Another round':['worker',this.configuration.workflow==='direct'?'Another round requested.\nReturning to the task.':'Review received.\nStarting the next round.'],
      };
      const [actor,text]=reactions[value]||['worker','Guidance received.\nReturning to the task.'];
      this.confirmInOffice(actor,text);
    },{errorHost});
  }

  async completeLegacyDecision(id,round,note){
    // A live pre-upgrade worker still exposes ask_note. Complete that exact
    // request on behalf of the same click; never answer a later round or run.
    for(let attempt=0;attempt<40;attempt++){
      const state=await api(`/api/runs/${id}`);
      if(terminal(state)||state.round>round)return;
      if(state.round===round&&state.pending?.action==='ask_note'){
        const key=`${id}:${state.pending.id}`;this.guidanceDrafts.set(key,note);
        const next=await api(`/api/runs/${id}/answer`,{request_id:state.pending.id,value:note});
        this.guidanceDrafts.delete(key);if(this.run?.id===id)this.apply(next);return;
      }
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw Error('The room has not accepted the next round yet. Reopen the current decision to retry.');
  }

  renderToolLog(container,run,owner){
    const key=`${run?.id}:${owner}`;if(container.dataset.key===key)return;
    container.dataset.key=key;container.replaceChildren();if(!run)return;
    const details=node('details'),output=node('div'),refresh=button('Refresh output',()=>load());
    const trace=node('a','Download full trace','trace-link');trace.href=`/api/runs/${run.id}/trace`;
    trace.download=`run-${run.id}.jsonl`;
    details.append(node('summary','Shell output'),output,refresh,trace);container.append(details);
    let loaded=false;
    const load=async()=>{
      refresh.disabled=true;output.replaceChildren(node('p','Loading output…','field-help'));
      try{
        const response=await fetch(trace.href);if(!response.ok)throw Error('Could not load shell output.');
        const events=(await response.text()).split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}})
          .filter(e=>e.type==='assistant.tool_output'&&(!roles[owner]||e.role===roles[owner])).slice(-8);
        output.replaceChildren();
        for(const event of events){
          output.append(node('h4',names[event.role]||event.role),node('pre',String(event.output||'').slice(-12000),'message-text'));
          if(event.truncated||String(event.output||'').length>12000)output.append(node('p','Showing an excerpt. See the trace for the recorded output.','field-help'));
        }
        if(!events.length)output.append(node('p','No shell output recorded yet.','field-help'));
        loaded=true;
      }catch(error){output.replaceChildren(node('p',error.message,'field-help'));}
      finally{refresh.disabled=false;}
    };
    details.ontoggle=()=>{if(details.open&&!loaded)load();};
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

  showRooms(){return this.configuration.showDrawer('rooms');}

  showHistory(){return this.configuration.showDrawer('history');}
}

export {api,node,button,field,input,select,terminal,roles};
