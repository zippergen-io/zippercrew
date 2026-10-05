"use strict";
import { PROCESS, createScene, paintScene, showMessage, resetMessages, roomMotion } from "/scene.js";

import { renderParticipant, resetInspector } from "/inspector.js";

const $ = (id) => document.getElementById(id);
const terminal = new Set(["completed", "failed", "stopped"]);
const panelIds = ["role-panel", "human-settings", "brief-panel", "settings-panel", "history-panel", "process-panel", "outcome-panel", "activity-panel", "runs-panel"];
const modes = {
  full: "See the full proposal and review. You decide whether to ship, continue, or abandon.",
  brief: "Get a concise briefing each round, then choose what happens next.",
  auto: "APPROVE finishes the process. REVISE continues within the round limit.",
};
let room = null, saveTimer, draftDirty = false, draftRevision = 0, renameSave = Promise.resolve(), saveChain = Promise.resolve();
let bootstrap, stream, current = null, selected = null, pendingId;
let profiles = {}, starting = false, navigation = 0, profileReturnRole = null;
const draft = { project: "", workspace: "", task: "", human_mode: "brief", max_rounds: 4,
  agents: { Implementer: { profile: "", instructions: "" }, Reviewer: { profile: "", instructions: "" } } };

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function showError(error) { $("error").textContent = error.message || String(error); $("error").hidden = false; }
async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json", "X-ZipperCrew": "1" }, body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error || `Request failed (${response.status})`); error.status = response.status; throw error; }
  return result;
}
function presentation(text) {
  return String(text).replaceAll("zg run trace --tail 20 --json", "the participant inspector or Download full trace")
    .replaceAll("zg run trace --tail 40 --json", "the participant inspector or Download full trace");
}
function profileDescription(profile) {
  return [profile.backend, profile.model || "CLI default model", profile.reasoning_effort ? `${profile.reasoning_effort} effort` : "default effort"].join(" · ");
}
function configuration() { return current ? current.config : draft; }
function ready() {
  return $("room-art")?.dataset.ready === "true" && draft.workspace.trim() && draft.task.trim() && Number.isInteger(draft.max_rounds)
    && draft.max_rounds >= 1 && draft.max_rounds <= 100
    && PROCESS.roles.filter(role => role.kind === "agent").every(role => profiles[draft.agents[role.name].profile]);
}
function roomStatus() {
  if (!current) return starting ? "Starting" : ready() ? "Ready" : "Setting up";
  if (terminal.has(current.status)) return current.status[0].toUpperCase() + current.status.slice(1);
  if (current.pending) return "Needs human";
  if (Object.values(current.participants).includes("working")) return "Working";
  if (Object.values(current.participants).includes("reviewing")) return "Reviewing";
  return "Waiting";
}
function renderRoom(replay = false) {
  $('run-again').hidden = !room || !current || !terminal.has(current.status);
  const runNumber = current && room ? room.runs.indexOf(current.id) + 1 : 0;
  const historical = !!current && !!room && current.id !== room.runs.at(-1);
  $('run-context').textContent = runNumber ? `Run ${runNumber}${historical ? ' · History' : ''}` : '';
  $('latest-run').hidden = !historical;
  $('run-history').disabled = !room?.runs.length;
  $('delete-room').disabled = !room || (!!current && !terminal.has(current.status));
  $('save-room').disabled = !!current;
  $('room-name').title = room ? `Room: ${room.name}` : 'Name this Room';
  const config = configuration(), status = roomStatus();
  const desktop = matchMedia('(min-width: 901px)').matches;
  $('close-inspector').textContent = desktop ? '↩' : '×';
  $('close-inspector').setAttribute('aria-label', desktop ? 'Room overview' : 'Close inspector');
  const states = current?.participants || Object.fromEntries(PROCESS.roles.map(role => [role.name, "ready"]));
  paintScene({ states, bindings: config.agents, task: config.task, workspace: config.workspace, selected, activities: current?.local_activity || {}, replay });
  $("room-status").textContent = status;
  $("room-status").dataset.status = status;
  $("workspace-label").textContent = config.workspace.split("/").filter(Boolean).at(-1) || "Choose repository";
  $("workspace-control").title = config.workspace;
  $("task-preview").textContent = config.task || "What are we working on?";
  $("task-control").title = config.task;
  $("task-control").querySelector(".edit-label").textContent = current ? "View brief" : "Edit brief";
  $("start").hidden = !!current;
  $("start").disabled = starting || !ready();
  $("start").textContent = starting ? "Starting…" : "Start working →";
  $("readiness").hidden = !!current;
  $("readiness").textContent = ready() ? "Your crew is ready." : "Choose your crew and task";
  $("round-label").hidden = !current;
  $("round-label").textContent = current ? `ROUND ${current.round} / ${config.max_rounds}` : "";
  $("stop-room").hidden = !current || terminal.has(current.status);
  $("result-control").hidden = !current || !terminal.has(current.status);
  $("human-return").hidden = !current?.pending;
  $("human-preferences").hidden = !!current;
  $("scene-hint").textContent = current ? (current.pending ? "Your turn · select Human to respond." : terminal.has(current.status) ? "Select a participant to inspect the conversation." : "Click a participant to follow their conversation.") : ready() ? "Crew ready · start when you are." : "Select a station to choose an agent.";
  for (const button of $("process-strip").querySelectorAll("button")) {
    button.classList.toggle("active", ["working", "reviewing", "needs human"].includes(states[button.dataset.role]));
  }
  $("inspector-footer").hidden = !current;
  if (current) $("trace-link").href = `/api/runs/${current.id}/trace`;
}

function setProfiles(data) {
  profiles = bootstrap.demo ? { "Scripted demo": { backend: "demo" } } : data.profiles;
  for (const binding of Object.values(draft.agents)) {
    if (binding.profile && !profiles[binding.profile]) binding.profile = "";
  }
  $("profile-status").textContent = `${Object.keys(profiles).length} saved profile(s).`;
  $("saved-profiles").replaceChildren();
  for (const [name, profile] of Object.entries(profiles)) {
    const item = element("div", name, "saved-profile");
    item.append(element("small", profileDescription(profile)));
    $("saved-profiles").append(item);
  }
  if (!Object.keys(profiles).length && !bootstrap.demo) $("add-profile").open = true;
  if (PROCESS.roles.some(role => role.name === selected && role.kind === "agent")) renderRole();
  renderRoom();
}
function profileLocation() {
  const directory = $("project").value.trim().replace(/\/+$/, "");
  $("profile-location").textContent = directory ? `Save location: ${directory}/zippergen.toml` : "Choose a profile directory.";
}
async function loadProfiles() {
  profileLocation();
  const project = $("project").value.trim();
  const data = await api(`/api/profiles?project=${encodeURIComponent(project)}`);
  if (draft.project !== project) for (const binding of Object.values(draft.agents)) binding.profile = "";
  draft.project = project;
  setProfiles(data);
}
async function loadHistory() {
  const rooms = await api("/api/rooms");
  $("history").replaceChildren();
  if (!rooms.length) $("history").append(element("p", "No conversations yet. Your first crew is waiting at the table.", "hint"));
  for (const record of rooms) {
    const button = element("button", undefined, "history-item");
    const last = record.latest;
    button.append(element("span", record.name), element("small", last ? `Run ${last.number} · ${last.status} · ${last.round} rounds` : 'Setting up'));
    if (last?.started_at) button.append(element('small', new Date(last.started_at * 1000).toLocaleString()));
    button.onclick = () => openContext(record.id);
    $("history").append(button);
  }
}
function showInspector(which) {
  if (typeof which === 'object' && which.message) {
    showInspector('activity');
    const row = [...document.querySelectorAll('#activity details')].find(n => n.dataset.message === which.message);
    if (row) { row.open = true; row.scrollIntoView({ block: 'nearest' }); row.querySelector('summary').focus(); }
    return;
  }
  selected = which;
  if (journal.error) journal.key = null;
  resetParticipantInspector();
  panelIds.forEach(id => { $(id).hidden = true; });
  const role = PROCESS.roles.find(role => role.name === which);
  const names = { brief: "The shared brief", settings: "Room settings", history: "Recent rooms", process: PROCESS.name, outcome: "Run result", activity: "Handoffs", runs: "Run history" };
  $("inspector-title").textContent = role?.name || names[which];
  $("inspector-eyebrow").textContent = role ? "Participant" : "Room";
  $("inspector").dataset.role = role?.name || "";
  $("inspector").hidden = false;
  $("room-layout").classList.add("with-inspector");
  if (role?.kind === "agent") { $("role-panel").hidden = false; renderRole(); }
  else if (which === "Human") {
    $("human-settings").hidden = false;
    const config = configuration();
    $("human-mode").value = config.human_mode;
    $("max-rounds").value = config.max_rounds;
    $("human-mode").disabled = !!current;
    $("max-rounds").disabled = !!current;
    $("mode-help").textContent = modes[config.human_mode];
    renderHuman();
  } else if (which === "brief") {
    $("brief-panel").hidden = false;
    $("workspace").value = configuration().workspace;
    $("task").value = configuration().task;
    $("workspace").readOnly = !!current;
    $("task").readOnly = !!current;
  } else {
    $({ settings: "settings-panel", history: "history-panel", process: "process-panel", outcome: "outcome-panel", activity: "activity-panel", runs: "runs-panel" }[which]).hidden = false;
    if (which === "history") loadHistory().catch(showError);
    if (which === "runs") loadRuns().catch(showError);
  }
  renderRoom();
}
function closeInspector() {
  if (matchMedia('(min-width: 901px)').matches) {
    const previous = selected;
    showInspector(current ? 'Implementer' : 'brief');
    document.getElementById(`actor-${previous}`)?.focus({ preventScroll: true });
    return;
  }
  $("inspector").hidden = true;
  $("room-layout").classList.remove("with-inspector");
  const previous = selected;
  selected = null;
  renderRoom();
  const control = { brief: "project-board", settings: "settings-control", history: "rooms-control",
    process: "process-control", outcome: "result-control", activity: "activity-control" }[previous];
  if (previous) document.getElementById(control || `actor-${previous}`)?.focus({ preventScroll: true });
}
function renderRole() {
  const role = PROCESS.roles.find(role => role.name === selected);
  if (!role || role.kind !== "agent") return;
  const binding = configuration().agents[selected];
  $("role-access").textContent = role.access;
  $("role-access").hidden = !!current;
  $("role-access").dataset.role = role.name;
  $("role-description").textContent = role.description;
  $("role-configuration").hidden = !!current;
  for (const id of ['participant-info', 'transcript', 'participant-details']) $(id).hidden = !current;
  if (!current) {
    const select = $("role-profile");
    select.replaceChildren(new Option("Choose an agent profile…", ""));
    for (const [name, profile] of Object.entries(profiles)) select.add(new Option(`${name} · ${profile.backend}`, name));
    select.value = binding.profile;
    const profile = profiles[binding.profile];
    $('profile-summary').textContent = profile ? `Runtime · ${profile.backend}` : 'Select a saved profile to take this seat.';
    const supported = bootstrap?.capabilities?.[profile?.backend] || [];
    for (const [key, id] of [['model', 'model'], ['reasoning_effort', 'effort']]) {
      $(`role-${id}-field`).hidden = !supported.includes(key);
      $(`role-${id}`).value = binding.settings?.[key] || '';
      $(`role-${id}`).placeholder = profile?.[key] ? `Default · ${profile[key]} (profile)` : 'Default · CLI default';
    }
    $('role-settings-help').hidden = !supported.length;
    $("role-instructions").value = binding.instructions;
    $("create-profile").hidden = bootstrap?.demo || false;
  }
  renderParticipantView(role);
}
// Reuse the complete, existing journal for message bodies and older rounds.
// Fetch on protocol changes only, never on each stdout/progress update.
let journal = { room: null, key: null, events: [], loading: false, error: null };
function resetParticipantInspector() {
  resetInspector([$("participant-info"), $("transcript"), $("participant-details"),
    $("human-overview"), $("human-transcript"), $("human-details")]);
}
function renderHuman() {
  for (const id of ['human-overview', 'human-transcript', 'human-details']) $(id).hidden = !current;
  $("human-preferences").hidden = !!current;
  renderParticipantView(PROCESS.roles.find(role => role.name === "Human"));
}
function renderParticipantView(role) {
  if (!current) return;
  const human = role.name === "Human";
  if (journal.room !== current.id) journal = { room: current.id, key: null, events: [], loading: false, error: null };
  const key = JSON.stringify([current.status, (current.messages || []).map(m => [m.id, m.version])]);
  if (journal.key !== key && !journal.loading) {
    const request = journal;
    request.loading = true; request.error = null;
    fetch(`/api/runs/${current.id}/trace`).then(async response => {
      if (!response.ok) throw new Error('Unable to load conversation');
      request.events = (await response.text()).split('\n').filter(Boolean).map(line => JSON.parse(line));
      request.key = key;
    }).catch(error => { request.error = error.message; request.key = key; }).finally(() => {
      request.loading = false;
      if (journal !== request || current?.id !== request.room) return;
      const selectedRole = PROCESS.roles.find(r => r.name === selected);
      if (selectedRole) renderParticipantView(selectedRole);
    });
  }
  renderParticipant({ state: current, role, events: journal.events, loading: journal.loading, error: journal.error,
    overview: $(human ? "human-overview" : "participant-info"),
    conversation: $(human ? "human-transcript" : "transcript"),
    technical: $(human ? "human-details" : "participant-details") });
}
async function answer(value) {
  const request = current?.pending;
  if (!request) return;
  const buttons = $("human-panel").querySelectorAll("button");
  buttons.forEach(button => { button.disabled = true; });
  try { await api(`/api/runs/${current.id}/answer`, { request_id: request.id, value }); }
  catch (error) { showError(error); buttons.forEach(button => { button.disabled = false; }); }
}
function humanPanel() {
  const request = current?.pending;
  if (pendingId === (request?.id || null)) return;
  pendingId = request?.id || null;
  const panel = $("human-panel");
  panel.replaceChildren(); panel.hidden = !request;
  if (!request) return;
  const { kind, rendered } = request.spec;
  const brief = element("div"), actions = element("div", undefined, "human-actions");
  brief.append(element("p", "Your decision", "small-caps"), element("h2", kind === "select" ? "How does this round look?" : "Anything to add?"));
  if (rendered.context) brief.append(element("pre", presentation(rendered.context)));
  if (kind === "select") {
    brief.append(element("p", `Round ${current.round} of ${current.config.max_rounds}. ${current.round >= current.config.max_rounds ? "The round limit is reached; Another round stops unresolved." : "Another round sends the full review back, then asks for optional guidance."} Ship it ends the process. Abandon leaves edits in the working tree.`, "hint"));
    const buttons = element("div", undefined, "human-buttons");
    for (const label of (rendered.prefill || "").split("\n").filter(Boolean)) {
      const button = element("button", label); button.onclick = () => answer(label); buttons.append(button);
    }
    actions.append(buttons);
    const inspect = element("button", "Read the full review ↗", "text-button");
    inspect.onclick = () => showInspector("Reviewer"); actions.append(inspect);
  } else {
    brief.append(element("p", rendered.instruction, "hint"));
    const form = element("form"), input = element("textarea");
    input.id = "human-guidance"; input.rows = 3; input.maxLength = 30000;
    input.placeholder = "Optional guidance. Leave empty to pass the full review through.";
    input.setAttribute("aria-label", "Guidance for the Implementer");
    const button = element("button", "Continue the conversation →", "primary"); button.type = "submit";
    form.append(input, button); form.onsubmit = event => { event.preventDefault(); answer(input.value); };
    actions.append(form);
  }
  panel.append(brief, actions);
}
function render(state, { replay = false } = {}) {
  const newlyEnded = terminal.has(state.status) && (current?.id !== state.id || current?.status !== state.status);
  const newHumanRequest = state.pending && state.pending.id !== current?.pending?.id;
  current = state;
  renderRoom(replay); humanPanel();
  if (newHumanRequest) showInspector("Human");
  if (PROCESS.roles.some(role => role.name === selected && role.kind === "agent")) renderRole();
  if (selected === "Human") renderHuman();
  const ended = terminal.has(state.status);
  if (newlyEnded && !PROCESS.roles.some(role => role.name === selected)) showInspector("Reviewer");
  $("outcome-title").textContent = state.status === "completed" ? "Completed" : state.status === "failed" ? "Execution failed" : "Stopped";
  $("outcome").textContent = presentation(state.outcome || state.error || "");
  $("review-verdict").textContent = state.review ? `${state.review.verdict} · ${state.review.findings} finding(s). ${state.review.headline}` : "Every handoff below is a real process message.";
  const expanded = new Set([...$('activity').querySelectorAll('details[open]')].map(n => n.dataset.message));
  $("activity").replaceChildren();
  const messages = state.messages || [];
  for (const item of [...messages].reverse()) {
    const row = element('details', undefined, 'activity-line');
    row.dataset.role = item.from; row.dataset.message = item.id; row.open = expanded.has(item.id);
    row.append(element('summary', `${item.from} → ${item.to} · ${item.label}`));
    const meta = element('dl', undefined, 'participant-meta');
    for (const [label, value] of Object.entries({
      Status: item.receive_id != null ? 'Received by runtime' : 'Sent · awaiting runtime receive',
      Channel: item.channel ?? 'Default', Sequence: item.seq ?? 'Not exposed',
      'Send event': item.send_id ?? 'Awaiting trace', 'Receive event': item.receive_id ?? 'Pending',
      Fields: item.fields.join(', ') || 'Runtime control',
    })) meta.append(element('dt', label), element('dd', String(value)));
    row.append(meta, element('pre', item.preview || 'Control payload is private to the runtime.'));
    row.append(element('small', 'Preview only. Download full trace below for the complete payload and exact events.'));
    $('activity').append(row);
  }
  for (const item of messages) showMessage(item, { replay });
  const message = messages.filter(m => !m.control).at(-1);
  if (message) $('handoff-label').textContent = `${message.from} → ${message.to} · ${message.label}`;
  if (ended) { stream?.close(); $("connection").textContent = "History saved locally"; }
}
function connectRoom(state, { replay = false } = {}) {
  stream?.close(); pendingId = undefined; resetParticipantInspector(); resetMessages();
  window.history.replaceState(null, "", room ? `/#room=${room.id}&run=${state.id}` : `/#room=${state.id}`);
  render(state, { replay });
  if (selected && !["settings", "history", "process"].includes(selected)) showInspector(selected);
  if (terminal.has(state.status)) { if (!PROCESS.roles.some(role => role.name === selected)) showInspector("Reviewer"); return; }
  const id = state.id, source = new EventSource(`/api/runs/${id}/events`);
  stream = source;
  source.onopen = () => { if (stream === source) $("connection").textContent = "Live · connected"; };
  source.addEventListener("state", event => { if (stream === source) render(JSON.parse(event.data)); });
  source.onerror = () => { if (stream === source && !terminal.has(current.status)) $("connection").textContent = "Reconnecting…"; };
}
async function openRoom(id) {
  const request = ++navigation;
  try {
    const state = await api(`/api/runs/${id}`);
    if (request !== navigation) return;
    connectRoom(state, { replay: true }); $("error").hidden = true;
  } catch (error) { showError(error); }
}

$("start").onclick = async () => {
  if (starting || !ready() || current) return;
  const generation = navigation;
  starting = true; $("error").hidden = true; renderRoom();
  try {
    await saveDraft();
    if (generation !== navigation) return;
    const state = await api(`/api/rooms/${room.id}/runs`, {});
    if (generation !== navigation) return;
    room.runs.push(state.id);
    connectRoom(state);
    showInspector("Implementer");
  }
  catch (error) { showError(error); }
  finally { starting = false; renderRoom(); }
};
$("role-profile").onchange = () => { draft.agents[selected].profile = $("role-profile").value; draft.agents[selected].settings = {}; renderRole(); renderRoom(); };
$("role-instructions").oninput = () => { draft.agents[selected].instructions = $("role-instructions").value; };
$('workspace').addEventListener('change', () => {
  if (!current && $('room-name').value === 'Pair programming' && draft.workspace.trim()) {
    $('room-name').value = draft.workspace.split('/').filter(Boolean).at(-1);
    scheduleSave();
  }
});
$("workspace").oninput = () => { if (!current) { draft.workspace = $("workspace").value; renderRoom(); } };
$("task").oninput = () => { if (!current) { draft.task = $("task").value; renderRoom(); } };
$("human-mode").onchange = () => { draft.human_mode = $("human-mode").value; $("mode-help").textContent = modes[draft.human_mode]; renderRoom(); };
$("max-rounds").oninput = () => { draft.max_rounds = Number($("max-rounds").value); renderRoom(); };
$("close-inspector").onclick = closeInspector;
$("brief-done").onclick = closeInspector;
$("task-control").onclick = () => showInspector("brief");
$("workspace-control").onclick = () => { showInspector("brief"); $("workspace").focus(); };
$("process-control").onclick = () => showInspector("process");
$("rooms-control").onclick = () => showInspector("history");
$('room-motion').value = roomMotion();
$('room-motion').onchange = () => roomMotion($('room-motion').value);
$("settings-control").onclick = () => showInspector("settings");
$("human-return").onclick = () => showInspector("Human");
$("result-control").onclick = () => showInspector("outcome");
$("activity-control").onclick = () => showInspector("activity");
$("project").oninput = profileLocation;
$("load-profiles").onclick = () => loadProfiles().catch(showError);
$("create-profile").onclick = () => { profileReturnRole = selected; showInspector("settings"); $("add-profile").open = true; $("profile-name").focus(); };
$("profile-form").onsubmit = async event => {
  event.preventDefault();
  const button = event.submitter; button.disabled = true;
  try {
    const name = $("profile-name").value.trim(), project = $("project").value.trim();
    const data = await api("/api/profiles", { project, name, backend: $("profile-backend").value,
      model: $("profile-model").value, reasoning_effort: $("profile-effort").value });
    if (draft.project !== project) for (const binding of Object.values(draft.agents)) binding.profile = "";
    draft.project = project; setProfiles(data); $("error").hidden = true; $("add-profile").open = false;
    if (profileReturnRole && !current) {
      draft.agents[profileReturnRole].profile = name;
      const role = profileReturnRole; profileReturnRole = null; showInspector(role); scheduleSave();
    }
  } catch (error) { showError(error); }
  finally { button.disabled = false; }
};
$("stop-room").onclick = async () => {
  try { render(await api(`/api/runs/${current.id}/stop`, {})); }
  catch (error) { showError(error); }
};
function setupRoom(record) {
  clearTimeout(saveTimer); ++navigation; stream?.close(); stream = null;
  room = record; draftDirty = false; current = null; pendingId = undefined;
  Object.assign(draft, structuredClone(record.config), { task: record.brief });
  $('room-name').value = record.name;
  $('project').value = draft.project;
  roomMotion(draft.motion || 'full'); $('room-motion').value = draft.motion || 'full';
  resetParticipantInspector(); resetMessages(); humanPanel();
  $('connection').textContent = 'Room saved locally';
  $('handoff-label').textContent = 'Human → Implementer → Reviewer → Human';
  $('error').hidden = true;
  localStorage.setItem('zippercrew.lastRoom', record.id);
  window.history.replaceState(null, '', `/#room=${record.id}&setup=1`);
  showInspector('brief');
}
async function openContext(id, runId, setup = false) {
  await renameSave.catch(() => {});
  if (!current && draftDirty) await saveDraft();
  const request = ++navigation;
  try {
    const record = await api(`/api/rooms/${id}/context`);
    if (request !== navigation) return;
    if (runId && !record.runs.includes(runId)) throw new Error("This Run does not belong to the selected Room.");
    setupRoom(record);
    await loadProfiles();
    if (!setup && (runId || record.runs.length)) await openRoom(runId || record.runs.at(-1));
  } catch (error) {
    if (error.status === 404) {
      localStorage.removeItem('zippercrew.lastRoom');
      showInspector('brief');
    }
    showError(error);
  }
}
function saveDraft() {
  clearTimeout(saveTimer);
  if (current) return Promise.resolve();
  const generation = navigation, revision = draftRevision;
  const data = { name: $('room-name').value.trim() || 'Pair programming', config: structuredClone(draft), brief: draft.task };
  delete data.config.task;
  const operation = saveChain.catch(() => {}).then(async () => {
    if (generation !== navigation) return;
    const saved = room ? await api(`/api/rooms/${room.id}/save`, data) : await api('/api/rooms', data);
    if (generation !== navigation) return;
    room = saved; draftDirty = draftRevision !== revision;
    $('connection').textContent = 'Room saved locally';
    localStorage.setItem('zippercrew.lastRoom', room.id);
    window.history.replaceState(null, '', `/#room=${room.id}&setup=1`);
    renderRoom();
  });
  saveChain = operation;
  return operation;
}
function scheduleSave() {
  if (current) return;
  draftDirty = true; ++draftRevision;
  clearTimeout(saveTimer);
  $('connection').textContent = 'Unsaved changes';
  saveTimer = setTimeout(() => saveDraft().catch(showError), 700);
}
async function loadRuns() {
  $('runs').replaceChildren();
  if (!room) return;
  const id = room.id, runs = await api(`/api/rooms/${id}/runs`);
  if (room?.id !== id) return;
  for (const run of runs) {
    const button = element('button', undefined, 'history-item');
    const date = run.started_at ? new Date(run.started_at * 1000).toLocaleString() : 'Imported run';
    button.append(element('span', `Run ${run.number} · ${run.status}`), element('small', `${date} · ${run.round} rounds`), element('small', run.task));
    if (run.outcome) button.append(element('small', String(run.outcome).slice(0, 150)));
    button.onclick = () => openRoom(run.id);
    $('runs').append(button);
  }
}
$('new-room').onclick = async () => {
  if (starting) return;
  try {
    if (!current && draftDirty) await saveDraft();
    const record = await api('/api/rooms', { name: 'Pair programming', config: { project: draft.project } });
    setupRoom(record); await loadProfiles();
  } catch (error) { showError(error); }
};
$('run-again').onclick = async () => {
  try {
    await renameSave;
    const record = await api(`/api/rooms/${room.id}/context`);
    setupRoom(record); await loadProfiles();
    $('task').focus();
  } catch (error) { showError(error); }
};
$('latest-run').onclick = () => openRoom(room.runs.at(-1));
$('run-history').onclick = () => { $('room-menu').open = false; showInspector('runs'); };
$('rename-room').onclick = () => { $('room-menu').open = false; $('room-name').focus(); $('room-name').select(); };
$('room-name').onchange = () => {
  const id = room?.id, name = $('room-name').value;
  renameSave = (async () => {
    if (current && id) {
      const saved = await api(`/api/rooms/${id}/save`, { name });
      if (room?.id === id) room = saved;
    } else await saveDraft();
  })();
  renameSave.catch(showError);
};
$('save-room').onclick = () => { $('room-menu').open = false; saveDraft().catch(showError); };
$('delete-room').onclick = async () => {
  $('room-menu').open = false;
  try { await renameSave; } catch (error) { showError(error); return; }
  if (!room || !confirm(`Delete “${room.name}” and all ${room.runs.length} runs, transcripts and traces? This deletes only ZipperCrew records and artifacts. Your source repository and shared profiles will not be deleted.`)) return;
  try {
    clearTimeout(saveTimer); await saveChain.catch(() => {});
    await api(`/api/rooms/${room.id}/delete`, { confirmation: room.name });
    stream?.close(); current = null; room = null;
    const record = await api('/api/rooms', { name: 'Pair programming', config: { project: draft.project } });
    setupRoom(record); await loadProfiles();
  } catch (error) { showError(error); }
};
for (const [id, key] of [['role-model', 'model'], ['role-effort', 'reasoning_effort']]) {
  $(id).oninput = () => {
    if (current || !draft.agents[selected]) return;
    draft.agents[selected].settings ||= {};
    draft.agents[selected].settings[key] = $(id).value.trim();
    scheduleSave();
  };
}
for (const id of ['role-profile', 'role-instructions', 'workspace', 'task', 'human-mode', 'max-rounds']) {
  $(id).addEventListener('input', scheduleSave);
  $(id).addEventListener('change', scheduleSave);
}
$('room-motion').addEventListener('change', () => {
  draft.motion = $('room-motion').value;
  if (!current) scheduleSave();
  else if (room) api(`/api/rooms/${room.id}/save`, { motion: draft.motion }).then(saved => { if (room?.id === saved.id) room = saved; }).catch(showError);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && selected) closeInspector();
});

window.addEventListener("resize", renderRoom);
document.addEventListener("room-renderer-ready", renderRoom);
document.addEventListener("room-renderer-error", event => showError(event.detail));

async function init() {
  createScene($("scene"), showInspector);
  PROCESS.sequence.forEach((name, index) => {
    if (index) $("process-strip").append(element("span", index === 2 ? "⇄" : "→", "process-arrow"));
    const button = element("button", name, "process-node"); button.dataset.role = name;
    button.onclick = () => showInspector(name); $("process-strip").append(button);
  });
  renderRoom();
  bootstrap = await api("/api/bootstrap");
  $("project").value = bootstrap.project;
  $("demo-banner").hidden = !bootstrap.demo;
  $("add-profile").hidden = bootstrap.demo;
  for (const check of Object.values(bootstrap.checks)) $("cli-checks").append(element("p", `${check.supported ? "✓" : "!"} ${check.backend} · ${check.supported ? "CLI compatible" : check.detail}`, `check${check.supported ? "" : " unavailable"}`));
  await loadProfiles();
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (params.has('room')) await openContext(params.get('room'), params.get('run'), params.has('setup'));
  else {
    const last = localStorage.getItem('zippercrew.lastRoom');
    if (last) await openContext(last);
    else showInspector('brief');
  }
}
init().catch(showError);
