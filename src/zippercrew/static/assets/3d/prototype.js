// Explicit visual study states only. The application never imports this harness.
import { launchRoom } from "/babylon-room.js";
const view = {
  bindings: {
    Implementer: { profile: "Prototype" },
    Reviewer: { profile: "Prototype" },
  },
  states: { Implementer: "working", Reviewer: "waiting", Human: "ready" },
  task: "Make the communication visible.",
  selected: "Implementer",
};
const room = launchRoom(document.querySelector("#world"), {
  reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  onReady: (scene) => scene.present(view),
  onError: console.error,
  onSelect: console.log,
});
window.room = room;
function phase(states) {
  view.states = states;
  room.scene.present(view);
}
document.querySelector("#idle").onclick = () =>
  phase({ Implementer: "waiting", Reviewer: "waiting", Human: "ready" });
document.querySelector("#work").onclick = () =>
  phase({ Implementer: "working", Reviewer: "waiting", Human: "ready" });
document.querySelector("#walk").onclick = () => {
  const scene = room.scene,
    person = scene.people.get("Reviewer"),
    now = performance.now();
  view.states.Reviewer = "waiting";
  scene.present(view);
  scene.ambient.step("Reviewer", "waiting", now);
  Object.assign(scene.ambient.people.get("Reviewer"), {
    action: "coffee",
    until: now + 18000,
  });
  scene.ambientAction(person, "coffee");
};
document.querySelector("#review").onclick = () =>
  phase({ Implementer: "waiting", Reviewer: "reviewing", Human: "ready" });
document.querySelector("#human").onclick = () =>
  phase({ Implementer: "waiting", Reviewer: "waiting", Human: "needs human" });
document.querySelector("#done").onclick = () =>
  phase({
    Implementer: "completed",
    Reviewer: "completed",
    Human: "completed",
  });
