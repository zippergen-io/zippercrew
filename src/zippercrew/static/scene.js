// A process describes places and communication links. The environment dresses them.
// No execution decisions live here: paintScene only renders supplied state.
export const PROCESS = {
  id: "pair_programming", name: "Pair Programming",
  roles: [
    { name: "Implementer", kind: "agent", color: "#b86d50", pale: "#f0dacb", x: 285, y: 320,
      access: "Write access", description: "Makes the change, tests it, and responds to the review." },
    { name: "Reviewer", kind: "agent", color: "#537d6c", pale: "#dce6db", x: 910, y: 320,
      access: "Read-only access", description: "Inspects the actual repository and challenges the proposal." },
    { name: "Human", kind: "human", color: "#82729d", pale: "#e5deed", x: 595, y: 423,
      access: "Process decisions", description: "Your place at the table." },
  ],
  links: [["Human", "Implementer"], ["Human", "Reviewer"],
    ["Implementer", "Reviewer"], ["Reviewer", "Human"], ["Implementer", "Human"]],
  sequence: ["Human", "Implementer", "Reviewer", "Human"],
};
const SVG = "http://www.w3.org/2000/svg";
let lastMessage = 0;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function station(role) {
  const human = role.kind === "human";
  const hair = role.name === "Implementer"
    ? '<path d="M-24 17Q-28-16 0-15Q27-14 26 17L15 5-5 8-17 3Z" fill="#493e38"/><path d="M-23 18l-5-8m14-20-5-7m13 5 3-8" stroke="#493e38" stroke-width="6"/>'
    : role.name === "Reviewer"
    ? '<path d="M-24 17Q-31-3-18-13Q-9-25 11-15Q30-17 29 6L21 18 15 5-2 8-15 2Z" fill="#353d38"/><path d="M-21 17h17v10h-17zm26 0h17v10H5m-9-5h9" stroke="#45574b" stroke-width="2" fill="none"/>'
    : '<path d="M-24 25Q-32-12-5-18Q19-22 26 4L23 14Q9 17 1 2L-19 12-18 28Z" fill="#716052"/>';
  return `<g id="actor-${role.name}" class="station empty ${role.name.toLowerCase()}" transform="translate(${role.x} ${role.y})" role="button" tabindex="0" data-role="${role.name}" aria-label="${role.name}: choose agent">
    <ellipse class="station-shadow" cy="144" rx="142" ry="21" fill="#675e44" opacity=".08"/>
    <g class="chair"><path d="M-49 65Q-52 34-24 31H27Q49 32 49 57L45 110H-44Z" fill="${role.pale}" stroke="#c7c8b7" stroke-width="2"/><path d="M-33 106-39 145m71-39 9 39" stroke="#7e8271" stroke-width="7" stroke-linecap="round"/><path d="M-42 100h86v17h-86Z" fill="${role.color}" opacity=".6"/></g>
    <g class="person"><path d="M-26 100l-3 35m56-35 3 35" stroke="#4e5751" stroke-width="17" stroke-linecap="round"/><path d="M-34 142h-17m73 0h17" stroke="#3e4841" stroke-width="9" stroke-linecap="round"/>
      <g class="upper-body"><path d="M-16 38Q-41 41-44 65L-41 104H43L41 62Q38 42 16 38Z" fill="${role.color}"/><path d="M-8 38v-9H9v9l-8 9Z" fill="#dba884"/><path d="M-35 60-51 86-23 95m57-35 18 25-22 9" fill="none" stroke="${role.color}" stroke-width="16" stroke-linecap="round"/>
      <g class="head"><rect x="-24" y="-10" width="49" height="48" rx="20" fill="${human ? '#e5bc99' : role.name === 'Reviewer' ? '#b88968' : '#e7b58b'}"/>${hair}<path d="M-11 18v3m22-3v3" stroke="#493f36" stroke-width="2.5" stroke-linecap="round"/><path d="M-4 29q4 3 8 0" stroke="#91694f" stroke-width="1.5" fill="none" stroke-linecap="round"/></g>
      <path d="M-21 86l14 2m30-2-11 2" class="hands" stroke="#dfb28e" stroke-width="9" stroke-linecap="round"/>
      <path d="M-4 60h10" stroke="${role.pale}" stroke-width="3" stroke-linecap="round"/></g>
    </g>
    <g class="desk">${human
      ? '<path d="M-70 104-83 150m154-46 14 46" stroke="#a18b6d" stroke-width="9" stroke-linecap="round"/><ellipse cy="96" rx="118" ry="35" fill="#aa8e6b"/><ellipse cy="90" rx="118" ry="35" fill="#e2c8a0"/><ellipse cy="90" rx="104" ry="27" fill="none" stroke="#d3b88f"/>'
      : '<path d="M-112 99-121 150m232-51 10 51" stroke="#8c816a" stroke-width="9" stroke-linecap="round"/><path d="M-137 85-103 60H111l30 25v13h-278Z" fill="#b89971"/><path d="M-137 85-103 60H111l30 25Z" fill="#e4c9a2"/><path d="M-122 86h246" stroke="#f1dec2" stroke-width="2"/>'}
    </g>
    <g class="laptop" transform="translate(0 ${human ? 50 : 41})"><path d="M-46 3q0-5 5-5h73q5 0 6 5l9 39h-85Z" fill="#71867a" stroke="#546c60" stroke-width="2"/><path d="M-44 42h93l-8 6h-99Z" fill="#9bac9b"/><rect x="-34" y="7" width="59" height="27" rx="2" fill="#d4dfc9"/><path d="M-27 14h20m-20 6h36m-36 6h27" class="screen-lines" fill="none" stroke="${role.color}" stroke-width="3" stroke-linecap="round"/></g>
    <g class="coffee" transform="translate(-89 57)"><ellipse cx="0" cy="23" rx="18" ry="5" fill="#ccae87"/><path d="M-10 0h22v17q-11 10-22 0Z" fill="#fcf7e6"/><path d="M12 3q15-1 9 10l-9 2" stroke="#fcf7e6" stroke-width="4" fill="none"/><ellipse cx="1" cy="1" rx="10" ry="3" fill="#786047"/><path class="steam" d="M-3-7q-7-7 0-13m9 11q5-7 0-11" fill="none" stroke="#f7f4e5" stroke-width="2" stroke-linecap="round"/></g>
    ${!human ? '<g class="notebook" transform="translate(73 67) rotate(-8)"><path d="M-9-17h42v28h-42Z" fill="#faf6e8"/><path d="M-3-11v21m6-17h22m-22 7h16" fill="none" stroke="#b8baa5" stroke-width="1.6"/><path class="pencil" d="M14-14l17 22" stroke="#bf8054" stroke-width="3" stroke-linecap="round"/></g>' : ''}
    <g class="vacancy"><circle cy="26" r="26" fill="#faf7ed" stroke="${role.color}" stroke-width="1.4" stroke-dasharray="3 5"/><path d="M-8 26H8M0 18v16" stroke="${role.color}" stroke-width="2" stroke-linecap="round"/></g>
    <g class="attention-cue"><rect x="-50" y="-61" width="100" height="25" rx="12" fill="${role.color}"/><path d="m-5-36 5 6 5-6" fill="${role.color}"/><text y="-44" text-anchor="middle" fill="#fff" font-size="10" letter-spacing="1">YOUR TURN</text></g>
    <rect class="station-hit" x="-150" y="-35" width="300" height="244" rx="18" fill="transparent"/>
    <g class="station-label" transform="translate(0 175)"><rect x="-117" y="-14" width="234" height="62" rx="11" fill="#faf7ed" fill-opacity=".92"/><circle cx="-90" cy="2" r="4" fill="${role.color}"/><text x="-76" y="6" class="role-name">${role.name}</text><text x="99" y="5" text-anchor="end" class="access-label">${human ? 'YOU' : role.name === 'Reviewer' ? 'READ ONLY' : 'WRITE'}</text><text x="-76" y="29" class="station-state">${human ? 'Ready · observing' : 'Choose agent  +'} </text></g>
  </g>`;
}

const environment = `
  <defs>
    <linearGradient id="wall-light" x2="1" y2="1"><stop stop-color="#faf5e9"/><stop offset="1" stop-color="#eae6d7"/></linearGradient>
    <linearGradient id="window-sky" x2="0" y2="1"><stop stop-color="#c7dcda"/><stop offset="1" stop-color="#e1e8d1"/></linearGradient>
    <pattern id="rug-weave" width="12" height="8" patternUnits="userSpaceOnUse"><path d="M0 0h12M0 4h12" stroke="#d9d5bd" stroke-width=".6"/></pattern>
    <symbol id="leaf-plant" viewBox="0 0 120 160"><path d="M59 125V33m0 61L28 65m31 12 33-34m-33 66 35-28" stroke="#6a7960" stroke-width="3" fill="none"/><path d="M59 52Q21 18 40 7q29 7 19 45M55 84Q6 71 15 44q31-4 40 40M61 66Q65 15 94 17q14 28-33 49M64 109q10-44 42-48 11 31-42 48" fill="#819575"/><path d="M37 117h46l-7 37H44Z" fill="#c18d6b"/><ellipse cx="60" cy="116" rx="23" ry="5" fill="#a87556"/></symbol>
    <symbol id="book" viewBox="0 0 12 40"><rect width="12" height="40" rx="2" fill="currentColor"/><path d="M2 7h8M2 31h8" stroke="#f4eddb" stroke-opacity=".55"/></symbol>
  </defs>
  <rect width="1200" height="665" rx="18" fill="#ede4d3"/>
  <path d="M0 0h1200v345H0Z" fill="url(#wall-light)"/>
  <path d="M0 329h1200v12H0Z" fill="#ddd5c1"/>
  <path d="M0 340h1200" stroke="#c5bba5" stroke-width="2"/>
  <g stroke="#ded2bb" stroke-width="1"><path d="m120 341-100 324m220-324-30 324m190-324 30 324m130-324 90 324m70-324 150 324m40-324 210 324M0 454h1200M0 581h1200"/></g>
  <path d="M58 340h384l260 248H255Z" fill="#fcf6de" opacity=".5"/>
  <g transform="translate(67 44)"><rect x="-9" y="-9" width="399" height="261" rx="6" fill="#dad8c6"/><rect width="380" height="241" rx="3" fill="url(#window-sky)"/>
    <circle cx="293" cy="64" r="31" fill="#f6e8b3"/>
    <path d="M0 180h31v-53h55v67h45v-81h72v48h46v-22h61v30h70v72H0Z" fill="#b4c9bc"/>
    <g stroke="#cfddd0" stroke-width="3"><path d="M45 141h25m-25 12h25m75-25h39m-39 12h39m-39 12h39m81 0h23m-23 12h23"/></g>
    <path d="M0 217q50-55 92 0t84-4 93 4 111-7v31H0Z" fill="#94b1a1"/>
    <g fill="#f8f4e7"><path d="M123 0h8v241h-8zm126 0h8v241h-8zM0 119h380v7H0Z"/></g>
    <rect width="380" height="241" rx="3" stroke="#fdfbf0" stroke-width="11" fill="none"/><path d="M-16 244h412v12H-16Z" fill="#f8f4e8"/><path d="M-16 256h412v5H-16Z" fill="#d1c9b4"/>
  </g>
  <g transform="translate(925 46)"><rect width="176" height="79" rx="3" fill="#e2dbc9"/><rect x="7" y="7" width="162" height="65" fill="#f4f0df"/><path d="M20 57q22-37 40-9t37-5 30-3 29 4" stroke="#a4af92" stroke-width="2" fill="none"/><circle cx="133" cy="25" r="9" fill="#d7b68b"/><text x="17" y="24" font-size="8" letter-spacing="2" fill="#939579">THE CORNER CAFÉ</text></g>
  <g transform="translate(953 178)"><path d="M-38 84h203v88H-38Z" fill="#bda482"/><g stroke="#a68f70" stroke-width="1"><path d="M-24 96v64m13-64v64m13-64v64m13-64v64m13-64v64m13-64v64m13-64v64m13-64v64m13-64v64m13-64v64m13-64v64m13-64v64m13-64v64m13-64v64"/></g><path d="M-48 78h223v12H-48Z" fill="#eadbc0"/><path d="M-48 89h223" stroke="#a99170" stroke-width="2"/>
    <rect x="-12" y="-9" width="104" height="89" rx="7" fill="#62786b"/><rect x="-5" width="89" height="21" rx="4" fill="#819587"/><circle cx="9" cy="10" r="4" fill="#d8c9a7"/><circle cx="23" cy="10" r="3" fill="#c3d3b4"/><path d="M4 29h64v8H4Z" fill="#b6c2af"/><path d="M28 37v13m31-13v13" stroke="#424f47" stroke-width="4"/><path d="M17 57h21v15H17Zm31 0h21v15H48Z" fill="#f4edd8"/><path d="M1 76h78" stroke="#3f594c" stroke-width="3"/>
    <rect x="109" y="26" width="35" height="51" rx="2" fill="#dfc296"/><path d="M109 32h35m-27 15h19m-19 5h19" stroke="#c09b70"/><ellipse cx="116" cy="14" rx="19" ry="4" fill="#eadbc0"/><path d="M96 9h39v7H96Z" fill="#eee4cb"/>
  </g>
  <g transform="translate(788 11)"><path d="M0-11v43" stroke="#857c63" stroke-width="2"/><path d="M-44 63q5-38 44-38t44 38Z" fill="#bd8868"/><ellipse cy="63" rx="44" ry="8" fill="#e0ba8e"/><ellipse cy="64" rx="28" ry="4" fill="#fff0bd"/></g>
  <g transform="translate(520 310)"><ellipse cx="78" cy="12" rx="68" ry="9" fill="#8f9276" opacity=".13"/><path d="M20-3h124v11H20Z" fill="#b7a17c"/><use href="#book" x="30" y="-38" width="10" height="35" color="#8d9a7a"/><use href="#book" x="42" y="-45" width="12" height="42" color="#bd8b72"/><use href="#book" x="57" y="-33" width="9" height="30" color="#d3be8b"/><path d="M108-5v-27m0 8q-18-14-11-19 17 3 11 19m1 5q22-13 17-23-18 4-17 23" fill="#879b73" stroke="#879b73" stroke-width="2"/><path d="M95-14h25l-4 14H99Z" fill="#e2d8bd"/></g>
  <ellipse cx="600" cy="521" rx="499" ry="110" fill="#cbcdb7"/>
  <ellipse cx="600" cy="521" rx="482" ry="99" fill="none" stroke="#e1e0ca" stroke-width="2"/>
  <ellipse cx="600" cy="521" rx="478" ry="96" fill="url(#rug-weave)"/>
  <use href="#leaf-plant" x="16" y="271" width="122" height="169"/>
  <use href="#leaf-plant" x="1100" y="274" width="94" height="137"/>
`;

export function createScene(container, onSelect) {
  container.innerHTML = `<svg id="room-art" viewBox="0 0 1200 665" xmlns="${SVG}" aria-label="The corner café, with Human, Implementer, and Reviewer stations">
    ${environment}
    <g id="project-board" role="button" tabindex="0" aria-label="Edit workspace and task" class="project-board" transform="translate(517 62)">
      <rect x="3" y="5" width="320" height="201" rx="8" fill="#b9b5a0" opacity=".3"/><rect width="320" height="201" rx="7" fill="#bb9e76"/><rect x="7" y="7" width="306" height="187" rx="3" fill="#f9f7eb"/>
      <path d="M100 0v-9h20v9m89 0v-9h20v9" fill="#8b8c77"/>
      <text x="27" y="35" class="board-heading">THE SHARED BRIEF</text><path d="M28 49h265" stroke="#e0e0d0"/>
      <text id="board-task" x="27" y="83" class="board-task">A place for your next idea.</text>
      <text id="board-task-second" x="27" y="109" class="board-task"></text>
      <text id="board-workspace" x="27" y="155" class="board-workspace">Choose a workspace + add a task</text>
      <circle cx="281" cy="164" r="13" fill="#e5e8d8"/><path d="m277 168 8-8m-8 0h8v8" stroke="#6e8069" stroke-width="1.5" fill="none"/>
    </g>
    <g id="message-paths" aria-hidden="true"></g>
    ${PROCESS.roles.map(station).join("")}
    <g id="message-tokens" aria-hidden="true"></g>
  </svg>`;
  for (const node of container.querySelectorAll('[role="button"]')) {
    const activate = () => onSelect(node.dataset.role || "brief");
    node.addEventListener("click", activate);
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); }
    });
  }
}

export function paintScene({ states, bindings, task, workspace, selected }) {
  for (const role of PROCESS.roles) {
    const node = document.getElementById(`actor-${role.name}`);
    const bound = role.kind === "human" || !!bindings[role.name]?.profile;
    const state = states[role.name];
    node.setAttribute("class", `station ${role.name.toLowerCase()} ${bound ? "bound" : "empty"} ${state.replaceAll(" ", "-")}${selected === role.name ? " selected" : ""}`);
    const label = !bound ? "Choose agent  +" : ({ "needs human": "Your decision is needed", ready: "Ready", waiting: "Waiting · coffee break", working: "Working on the task", reviewing: "Reviewing the proposal", completed: "Completed", failed: "Failed · inspect details", stopped: "Stopped" }[state] || state);
    node.querySelector(".station-state").textContent = label;
    node.setAttribute("aria-label", `${role.name}: ${label}. ${bound ? "Inspect participant" : "Choose agent"}`);
    node.setAttribute("aria-pressed", String(selected === role.name));
  }
  const words = task.trim().replace(/\s+/g, " ");
  const split = words.length > 29 ? Math.max(words.lastIndexOf(" ", 29), 0) || 29 : words.length;
  const remainder = words.slice(split).trim();
  document.getElementById("board-task").textContent = words ? words.slice(0, split) : "A place for your next idea.";
  document.getElementById("board-task-second").textContent = remainder.slice(0, 29) + (remainder.length > 29 ? "…" : "");
  document.getElementById("board-workspace").textContent = workspace ? `↳ ${workspace.split("/").filter(Boolean).at(-1) || workspace}`.slice(0, 38) : "Choose a workspace + add a task";
}

export function showMessage(message, { replay = false } = {}) {
  if (!message || message.id === lastMessage) return;
  lastMessage = message.id;
  const from = PROCESS.roles.find(role => role.name === message.from);
  const to = PROCESS.roles.find(role => role.name === message.to);
  if (!from || !to || replay || !PROCESS.links.some(([a, b]) => a === from.name && b === to.name)) return;
  const start = { x: from.x, y: from.y + 77 }, end = { x: to.x, y: to.y + 77 };
  const path = `M${start.x},${start.y} Q600,290 ${end.x},${end.y}`;
  const line = document.createElementNS(SVG, "path");
  line.setAttribute("d", path);
  line.setAttribute("class", "message-line");
  line.setAttribute("stroke", from.color);
  document.getElementById("message-paths").replaceChildren(line);
  const token = document.createElementNS(SVG, "g");
  token.setAttribute("class", "message-token");
  token.innerHTML = `<rect x="-12" y="-10" width="24" height="20" rx="4" fill="#fffaf0" stroke="${from.color}" stroke-width="1.8"/><path d="m-7-4 7 5 7-5" stroke="${from.color}" stroke-width="1.4" fill="none"/>`;
  if (reducedMotion()) {
    token.setAttribute("transform", `translate(${end.x} ${end.y})`);
  } else {
    const motion = document.createElementNS(SVG, "animateMotion");
    motion.setAttribute("path", path);
    motion.setAttribute("dur", "1.6s");
    motion.setAttribute("fill", "freeze");
    token.append(motion);
    // SVG timing is explicitly started when a real message arrives.
    document.getElementById("message-tokens").replaceChildren(token);
    motion.beginElement();
    return;
  }
  document.getElementById("message-tokens").replaceChildren(token);
}

export function resetMessages() {
  lastMessage = 0;
  document.getElementById("message-paths").replaceChildren();
  document.getElementById("message-tokens").replaceChildren();
}
