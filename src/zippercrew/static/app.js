"use strict";

const $ = (id) => document.getElementById(id);
const roles = ["Implementer", "Reviewer", "Human"];
const terminal = new Set(["completed", "failed", "stopped"]);
let bootstrap, stream, current, selected = "Implementer", pendingId, transcriptKey;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function showError(error) {
  $("error").textContent = error.message || String(error);
  $("error").hidden = false;
}

async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json", "X-ZipperCrew": "1" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

function profiles(data) {
  const entries = bootstrap.demo ? [["Scripted demo", { backend: "demo" }]] : Object.entries(data.profiles);
  for (const role of ["implementer", "reviewer"]) {
    const select = $(`${role}-profile`), previous = select.value;
    select.replaceChildren();
    if (!entries.length) select.add(new Option("Create or load a profile first", ""));
    for (const [name, profile] of entries) select.add(new Option(`${name} · ${profile.backend}`, name));
    if (entries.some(([name]) => name === previous)) select.value = previous;
  }
  $("profile-status").textContent = entries.length ? `${entries.length} profile(s) available.` : "No profiles here yet. Create one below, or load another project.";
  $("start").disabled = !entries.length;
  if (!entries.length && !bootstrap.demo) $("add-profile").open = true;
}

async function loadProfiles() {
  try {
    const data = await api(`/api/profiles?project=${encodeURIComponent($("project").value)}`);
    profiles(data);
  } catch (error) { showError(error); }
}

async function loadHistory() {
  const rooms = await api("/api/rooms");
  $("history").replaceChildren();
  if (!rooms.length) $("history").append(element("p", "Your first conversation starts here.", "hint"));
  for (const room of rooms) {
    const button = element("button", undefined, "history-item");
    button.append(element("span", room.task), element("small", `${room.status} · round ${room.round}`), element("span", "↗"));
    button.onclick = () => openRoom(room.id);
    $("history").append(button);
  }
}

function presentation(text) {
  return String(text).replaceAll("zg run trace --tail 20 --json", "the participant inspector or Download full trace")
    .replaceAll("zg run trace --tail 40 --json", "the participant inspector or Download full trace");
}

function initActors() {
  for (const role of roles) {
    const actor = element("button", undefined, `actor ${role.toLowerCase()} waiting`);
    actor.id = `actor-${role}`;
    actor.innerHTML = '<span class="figure" aria-hidden="true"><i class="head"></i><i class="body"></i></span><span class="desk" aria-hidden="true"></span><span class="laptop" aria-hidden="true"></span><span class="mug" aria-hidden="true"></span>';
    actor.append(element("span", role, "actor-name"), element("span", "Waiting", "actor-state"));
    actor.onclick = () => selectRole(role);
    $("actors").append(actor);
    const tab = element("button", role);
    tab.id = `tab-${role}`;
    tab.setAttribute("role", "tab");
    tab.onclick = () => selectRole(role);
    $("inspector-tabs").append(tab);
  }
}

function selectRole(role) {
  selected = role;
  transcriptKey = null;
  if (current) renderInspector(current);
  for (const name of roles) {
    $(`actor-${name}`).classList.toggle("selected", name === role);
    $(`tab-${name}`).setAttribute("aria-selected", String(name === role));
  }
}

function renderInspector(state) {
  const binding = state.config.agents[selected];
  const values = {
    Role: selected, Profile: binding ? `${binding.profile} / ${binding.backend}` : "You · browser endpoint",
    Access: binding ? binding.access : "Process decisions", State: state.participants[selected],
    Round: `${state.round} of ${state.config.max_rounds}`, Workspace: state.config.workspace,
  };
  const list = element("dl", undefined, "participant-meta");
  for (const [key, value] of Object.entries(values)) list.append(element("dt", key), element("dd", value));
  $("participant-info").replaceChildren(list);
  const key = `${selected}:${state.transcript.length}`;
  if (transcriptKey === key) return;
  transcriptKey = key;
  const entries = state.transcript.filter((entry) => entry.role === selected);
  $("transcript").replaceChildren();
  if (!entries.length) $("transcript").append(element("p", "Completed turns will appear here. Work in progress is visible in the room.", "hint"));
  for (const entry of entries) {
    const detail = element("details", undefined, "transcript-entry");
    detail.append(element("summary", `Round ${entry.round} · ${entry.action}`));
    detail.open = entry === entries.at(-1);
    for (const group of ["inputs", "outputs"]) {
      if (!entry[group]) continue;
      detail.append(element("h4", group === "inputs" ? "RECEIVED" : "SAID"));
      for (const [name, value] of Object.entries(entry[group])) {
        detail.append(element("h4", name), element("pre", typeof value === "string" ? value : JSON.stringify(value, null, 2)));
      }
    }
    $("transcript").append(detail);
  }
}

async function answer(value) {
  const request = current.pending;
  if (!request) return;
  const buttons = $("human-panel").querySelectorAll("button");
  buttons.forEach((button) => { button.disabled = true; });
  try {
    await api(`/api/rooms/${current.id}/answer`, { request_id: request.id, value });
  } catch (error) {
    showError(error);
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function humanPanel(state) {
  const request = state.pending;
  if (pendingId === (request?.id || null)) return;
  pendingId = request?.id || null;
  const panel = $("human-panel");
  panel.replaceChildren();
  if (!request) return;
  const { kind, rendered } = request.spec;
  panel.append(element("p", "HUMAN / YOUR TURN", "eyebrow"));
  panel.append(element("h2", kind === "select" ? "How does this round look?" : "Anything to add?"));
  if (rendered.context) panel.append(element("pre", presentation(rendered.context)));
  if (kind === "select") {
    panel.append(element("p", `Round ${state.round} of ${state.config.max_rounds}. Another round sends the full review back${state.round >= state.config.max_rounds ? "; the round limit has been reached, so the process will stop unresolved" : " and lets you add guidance"}. Ship it ends the process. Abandon leaves edits in the working tree.`, "hint"));
    const buttons = element("div", undefined, "human-buttons");
    for (const label of (rendered.prefill || "").split("\n").filter(Boolean)) {
      const button = element("button", label);
      button.onclick = () => answer(label);
      buttons.append(button);
    }
    panel.append(buttons);
  } else {
    panel.append(element("p", rendered.instruction, "hint"));
    const form = element("form"), input = element("textarea");
    input.id = "human-guidance";
    input.rows = 3;
    input.maxLength = 30000;
    input.placeholder = "Optional guidance. Leave empty to send the review as-is.";
    input.setAttribute("aria-label", "Guidance for the Implementer");
    const button = element("button", "Continue the conversation →", "primary");
    button.type = "submit";
    form.append(input, button);
    form.onsubmit = (event) => { event.preventDefault(); answer(input.value); };
    panel.append(form);
  }
}

function render(state) {
  current = state;
  $("room-task").textContent = state.config.task;
  $("round-label").textContent = `ROUND ${state.round} / ${state.config.max_rounds}`;
  $("room-status").textContent = state.pending ? "Your turn" : state.status;
  for (const role of roles) {
    const actor = $(`actor-${role}`), status = state.participants[role];
    actor.className = `actor ${role.toLowerCase()} ${status.replaceAll(" ", "-")}${role === selected ? " selected" : ""}`;
    actor.querySelector(".actor-state").textContent = status === "waiting" ? "Waiting · coffee break" : status;
    actor.setAttribute("aria-label", `${role}: ${status}. Inspect conversation`);
  }
  humanPanel(state);
  renderInspector(state);
  $("review-verdict").textContent = state.review ? `${state.review.verdict} · ${state.review.findings} finding(s). ${state.review.headline}` : "Each handoff below is a real process message.";
  $("activity").replaceChildren();
  for (const item of state.activity.filter((item) => item.type === "send").slice(-5).reverse()) {
    const line = element("div", undefined, "activity-line");
    line.append(element("strong", `${item.from} → ${item.to}`), element("span", item.fields.join(", ")));
    $("activity").append(line);
  }
  const ended = terminal.has(state.status);
  $("outcome-panel").hidden = !ended;
  $("outcome-title").textContent = state.status === "completed" ? "The conversation is complete." : state.status === "failed" ? "The crew hit a snag." : "The room has stopped.";
  $("outcome").textContent = presentation(state.outcome || state.error || "");
  $("stop-room").hidden = ended;
  if (ended && stream) { stream.close(); $("connection").textContent = "Room history saved locally"; }
}

async function openRoom(id) {
  try {
    if (stream) stream.close();
    pendingId = undefined;
    transcriptKey = null;
    const state = await api(`/api/rooms/${id}`);
    $("setup").hidden = true;
    $("room").hidden = false;
    $("new-crew").hidden = false;
    $("error").hidden = true;
    $("trace-link").href = `/api/rooms/${id}/trace`;
    window.history.replaceState(null, "", `/#room=${id}`);
    render(state);
    if (!terminal.has(state.status)) {
      stream = new EventSource(`/api/rooms/${id}/events`);
      stream.onopen = () => { $("connection").textContent = "Connected · live process"; };
      stream.addEventListener("state", (event) => render(JSON.parse(event.data)));
      stream.onerror = () => { if (!terminal.has(current.status)) $("connection").textContent = "Connection lost · reconnecting…"; };
    }
    selectRole(selected);
    window.scrollTo(0, 0);
  } catch (error) { showError(error); }
}

$("crew-form").onsubmit = async (event) => {
  event.preventDefault();
  $("error").hidden = true;
  $("start").disabled = true;
  try {
    const agents = {};
    for (const role of ["Implementer", "Reviewer"]) {
      const prefix = role.toLowerCase();
      agents[role] = { profile: $(`${prefix}-profile`).value, instructions: $(`${prefix}-instructions`).value };
    }
    const room = await api("/api/rooms", { project: $("project").value, workspace: $("workspace").value,
      task: $("task").value, human_mode: $("human-mode").value, max_rounds: Number($("max-rounds").value), agents });
    await openRoom(room.id);
  } catch (error) { showError(error); }
  finally { $("start").disabled = false; }
};

$("profile-form").onsubmit = async (event) => {
  event.preventDefault();
  try {
    profiles(await api("/api/profiles", { project: $("project").value, name: $("profile-name").value, backend: $("profile-backend").value }));
    $("add-profile").open = false;
    $("error").hidden = true;
  } catch (error) { showError(error); }
};
$("load-profiles").onclick = loadProfiles;
$("create-profile").onclick = () => {
  $("add-profile").open = true;
  $("add-profile").scrollIntoView({ block: "center" });
  $("profile-name").focus({ preventScroll: true });
};
$("human-mode").onchange = () => {
  $("mode-help").textContent = {
    full: "Full proposal and review each round. You choose: ship, another round, or abandon.",
    brief: "A concise briefing, then you choose: ship, another round, or abandon.",
    auto: "The reviewer decides: APPROVE finishes, REVISE continues within the round limit.",
  }[$("human-mode").value];
};
$("stop-room").onclick = async () => {
  try { render(await api(`/api/rooms/${current.id}/stop`, {})); }
  catch (error) { showError(error); }
};
$("new-crew").onclick = () => {
  if (stream) stream.close();
  $("room").hidden = true;
  $("setup").hidden = false;
  $("new-crew").hidden = true;
  $("connection").textContent = "Your machine. Your crew.";
  window.history.replaceState(null, "", "/");
  loadHistory().catch(showError);
};

async function init() {
  initActors();
  bootstrap = await api("/api/bootstrap");
  $("project").value = bootstrap.project;
  $("demo-banner").hidden = !bootstrap.demo;
  $("add-profile").hidden = bootstrap.demo;
  $("create-profile").hidden = bootstrap.demo;
  for (const check of Object.values(bootstrap.checks)) {
    $("cli-checks").append(element("p", `${check.supported ? "✓" : "!"} ${check.backend} · ${check.supported ? "CLI compatible" : check.detail}`, `check${check.supported ? "" : " unavailable"}`));
  }
  await loadProfiles();
  await loadHistory();
  const match = window.location.hash.match(/^#room=([a-f0-9]{32})$/);
  if (match) await openRoom(match[1]);
}
init().catch(showError);
