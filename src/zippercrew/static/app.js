"use strict";
import { PROCESS, createScene, paintScene, showMessage, resetMessages, roomMotion } from "/scene.js";

const $ = (id) => document.getElementById(id);
const terminal = new Set(["completed", "failed", "stopped"]);
const panelIds = ["role-panel", "human-settings", "brief-panel", "settings-panel", "history-panel", "process-panel", "outcome-panel", "activity-panel"];
const modes = {
  full: "See the full proposal and review. You decide whether to ship, continue, or abandon.",
  brief: "Get a concise briefing each round, then choose what happens next.",
  auto: "APPROVE finishes the process. REVISE continues within the round limit.",
};
let bootstrap, stream, current = null, selected = null, pendingId, transcriptKey;
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
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
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
  const config = configuration(), status = roomStatus();
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
  $("human-preferences").hidden = !!current?.pending;
  $("scene-hint").textContent = current ? (current.pending ? "Your turn · select Human to respond." : terminal.has(current.status) ? "Select a participant to inspect the conversation." : "Click a participant to follow their conversation.") : ready() ? "Crew ready · start when you are." : "Select a station to choose an agent.";
  for (const button of $("process-strip").querySelectorAll("button")) {
    button.classList.toggle("active", ["working", "reviewing", "needs human"].includes(states[button.dataset.role]));
  }
  $("inspector-footer").hidden = !current;
  if (current) $("trace-link").href = `/api/rooms/${current.id}/trace`;
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
  for (const room of rooms) {
    const button = element("button", undefined, "history-item");
    button.append(element("span", room.task), element("small", `${room.status} · round ${room.round} ↗`));
    button.onclick = () => openRoom(room.id);
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
  transcriptKey = null;
  panelIds.forEach(id => { $(id).hidden = true; });
  const role = PROCESS.roles.find(role => role.name === which);
  const names = { brief: "The shared brief", settings: "Room settings", history: "Recent rooms", process: PROCESS.name, outcome: "Room result", activity: "Handoffs" };
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
    renderTranscript("Human", $("human-transcript"));
  } else if (which === "brief") {
    $("brief-panel").hidden = false;
    $("workspace").value = configuration().workspace;
    $("task").value = configuration().task;
    $("workspace").readOnly = !!current;
    $("task").readOnly = !!current;
  } else {
    $({ settings: "settings-panel", history: "history-panel", process: "process-panel", outcome: "outcome-panel", activity: "activity-panel" }[which]).hidden = false;
    if (which === "history") loadHistory().catch(showError);
  }
  renderRoom();
}
function closeInspector() {
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
  $("role-access").dataset.role = role.name;
  $("role-description").textContent = role.description;
  $("role-configuration").hidden = !!current;
  $("participant-info").hidden = !current;
  if (!current) {
    const select = $("role-profile");
    select.replaceChildren(new Option("Choose an agent profile…", ""));
    for (const [name, profile] of Object.entries(profiles)) select.add(new Option(`${name} · ${profile.backend}`, name));
    select.value = binding.profile;
    $("profile-summary").textContent = profiles[binding.profile] ? profileDescription(profiles[binding.profile]) : "Select a saved profile to take this seat.";
    $("role-instructions").value = binding.instructions;
    $("create-profile").hidden = bootstrap?.demo || false;
  } else {
    const meta = element("dl", undefined, "participant-meta");
    for (const [key, value] of Object.entries({ Profile: binding.profile, Assistant: profileDescription(binding),
      State: current.participants[selected], Round: `${current.round} of ${current.config.max_rounds}`,
      Workspace: current.config.workspace })) meta.append(element("dt", key), element("dd", value));
    $("participant-info").replaceChildren(meta);
    const progress = (current.progress || []).filter(item => item.role === selected).slice(-6);
    if (progress.length) {
      const recent = element("div", undefined, "recent-progress");
      recent.append(element("h4", "Recent activity"));
      for (const item of progress) recent.append(element("p", `Round ${item.round} · ${item.text}`));
      $("participant-info").append(recent);
    }
  }
  renderTranscript(selected, $("transcript"));
}
function renderTranscript(role, container) {
  const key = `${current?.id}:${role}:${current?.transcript.length}`;
  if (key === transcriptKey) return;
  transcriptKey = key;
  container.replaceChildren();
  if (!current) return;
  const entries = current.transcript.filter(entry => entry.role === role);
  if (!entries.length) container.append(element("p", "Completed turns will appear here. The scene shows work in progress.", "hint"));
  for (const entry of entries) {
    const detail = element("details", undefined, "transcript-entry");
    detail.dataset.role = role;
    detail.append(element("summary", `Round ${entry.round} · ${entry.action}`));
    detail.open = entry === entries.at(-1);
    for (const group of ["inputs", "outputs"]) {
      if (!entry[group]) continue;
      detail.append(element("h4", group === "inputs" ? "RECEIVED" : "SAID"));
      for (const [name, value] of Object.entries(entry[group])) detail.append(element("h4", name), element("pre", typeof value === "string" ? value : JSON.stringify(value, null, 2)));
    }
    container.append(detail);
  }
}
async function answer(value) {
  const request = current?.pending;
  if (!request) return;
  const buttons = $("human-panel").querySelectorAll("button");
  buttons.forEach(button => { button.disabled = true; });
  try { await api(`/api/rooms/${current.id}/answer`, { request_id: request.id, value }); }
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
  if (selected === "Human") renderTranscript("Human", $("human-transcript"));
  const ended = terminal.has(state.status);
  if (newlyEnded) showInspector("outcome");
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
  stream?.close(); pendingId = undefined; transcriptKey = null; resetMessages();
  window.history.replaceState(null, "", `/#room=${state.id}`);
  render(state, { replay });
  if (selected && !["settings", "history", "process"].includes(selected)) showInspector(selected);
  if (terminal.has(state.status)) { showInspector("outcome"); return; }
  const id = state.id, source = new EventSource(`/api/rooms/${id}/events`);
  stream = source;
  source.onopen = () => { if (stream === source) $("connection").textContent = "Live · connected"; };
  source.addEventListener("state", event => { if (stream === source) render(JSON.parse(event.data)); });
  source.onerror = () => { if (stream === source && !terminal.has(current.status)) $("connection").textContent = "Reconnecting…"; };
}
async function openRoom(id) {
  const request = ++navigation;
  try {
    const state = await api(`/api/rooms/${id}`);
    if (request !== navigation) return;
    closeInspector(); connectRoom(state, { replay: true }); $("error").hidden = true;
  } catch (error) { showError(error); }
}

$("start").onclick = async () => {
  if (starting || !ready() || current) return;
  starting = true; $("error").hidden = true; renderRoom();
  try { connectRoom(await api("/api/rooms", draft)); }
  catch (error) { showError(error); }
  finally { starting = false; renderRoom(); }
};
$("role-profile").onchange = () => { draft.agents[selected].profile = $("role-profile").value; renderRole(); renderRoom(); };
$("role-instructions").oninput = () => { draft.agents[selected].instructions = $("role-instructions").value; };
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
      const role = profileReturnRole; profileReturnRole = null; showInspector(role);
    }
  } catch (error) { showError(error); }
  finally { button.disabled = false; }
};
$("stop-room").onclick = async () => {
  try { render(await api(`/api/rooms/${current.id}/stop`, {})); }
  catch (error) { showError(error); }
};
$("new-room").onclick = () => {
  if (starting) return;
  ++navigation; stream?.close(); stream = null; current = null; pendingId = undefined; transcriptKey = null;
  resetMessages(); closeInspector(); humanPanel(); $("outcome-panel").hidden = true; $("activity-panel").hidden = true;
  $("activity").replaceChildren(); $("review-verdict").textContent = ""; $("error").hidden = true;
  $("connection").textContent = "Local workspace";
  $("handoff-label").textContent = "Human → Implementer → Reviewer → Human";
  window.history.replaceState(null, "", "/");
};

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && selected) closeInspector();
});

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
  const match = window.location.hash.match(/^#room=([a-f0-9]{32})$/);
  if (match) await openRoom(match[1]);
}
init().catch(showError);
