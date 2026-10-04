# Corner Café: the scene boundary

The viewport looks into a close three-quarter café. Large, distinct characters
occupy the foreground; the warm windows, coffee counter and shared brief sit
behind them. The scene persists through setup, work, decisions and completion.
Settings, repository paths, long text, profiles and transcripts remain ordinary
DOM inspectors. No game mechanic controls the workflow.

## Rendering

* `room-engine.js` owns a single Phaser Canvas scene. `ROLES` supplies identity,
  seat/rest/desk positions, sizes, access labels and assets. Characters, chairs,
  desks, shadows, selection rings, the brief board and messages are separate
  objects. Floor Y determines overlap order, including while walking.
* `scene.js` adapts runtime snapshots into the renderer and keeps accessible DOM
  controls aligned with scene entities. `PROCESS` declares Pair Programming's
  roles and communication links. It also deduplicates messages received via SSE.
* `app.js` retains the existing draft, API/SSE, profile, inspector and human-task
  logic. Before starting, bindings determine whether a seat is occupied. Once
  running, server snapshots exclusively determine participant semantic states.
* Phaser 3.90.0 is vendored with its MIT license. Assets are served locally and
  packaged in the Python wheel. No frontend build or remote asset host is needed.
  Renderer initialization errors are visible and prevent starting a hidden run.

Phaser mouse input is restricted to its canvas; keyboard handling and window
mouse listeners are disabled. This is necessary for ordinary web inspectors to
work independently of objects behind them. A ResizeObserver resizes the canvas;
the camera fills laptop viewports and fits the whole scene on narrow screens.

## Art and identity

The environment, furniture and three character atlases are original generated
bitmap assets, not code-drawn figures. See [art provenance](art/README.md) and
[generation prompts](art/prompts.md). Transparent character sheets contain nine
poses. Runtime alpha bounds become frame metadata without modifying the images.
Each pose is anchored at the feet. Furniture has its own atlas and explicit
regions, allowing desks and chairs to overlap characters independently.

Implementer has a swept auburn silhouette, coral headphones and a short maker's
jacket. Reviewer has a silver bob, glasses, a broad teal cardigan and a tablet.
Human has an asymmetric indigo curl silhouette, plum sweater and phone. Their
silhouettes, accessories, seated poses and working gestures differ. Role colors
continue into selection rings, documents, inspectors and transcript entries.

## State and animation contract

| State | Authoritative source | Position and pose |
| --- | --- | --- |
| Unconfigured | No profile in the draft binding | Empty chair with a compact choose-agent target |
| Ready | Profile selected, execution not started | Agent stands beside the station; Human observes at the table |
| Working | Implementer `act_start` | Walk to chair, sit forward, type; occasional thinking pose during the same action |
| Reviewing | Reviewer `act_start` | Return to desk, read the tablet, pause to think/annotate |
| Waiting | Runtime lifecycle / action completion | Agent walks to a nearby coffee position; Human observes |
| Needs human | Pending upstream Human request | Human stands with the lit phone and attention expression; inspector opens |
| Completed | Upstream process returned | Crew stands relaxed with a restrained success gesture |
| Failed / stopped | Runtime exception / service lifecycle | Concerned pose, subdued color, explicit result |

Two authored walking frames interpolate short predetermined routes. Implementer
moves faster than Reviewer. Small posture loops distinguish typing from reading.
Timers only animate a pose inside an existing semantic state; they never infer
work, completion, testing, silence or review results. A new state cancels its
predecessor's movement, reaction and posture callbacks. No autonomous simulation
decides what the characters do next.

Each newly observed numbered runtime `send` creates a role-colored document on
an elevated route between its actual participants. Arrival triggers a short
receive reaction without changing semantic state. Concurrent sends coexist,
bounded to six tokens; completed effects are removed. Repeated snapshots do not
duplicate messages. Opening history or reloading consumes past IDs without
replaying them. Switching rooms cancels all old transfers and their callbacks.
The full trace remains authoritative if the snapshot's bounded activity window
omits older sends during a long disconnection.

Reduced motion removes walking, easing and loops while retaining distinct poses,
positions and a static document at the latest recipient. Changes to that OS
preference apply immediately. The scene is silent.

## Interaction and accessibility

Characters, desks and chairs select the participant. The wall board opens the
workspace/task editor. Labels appear on hover or selection, with persistent
choose-agent targets for empty seats. DOM buttons aligned with the objects
provide keyboard focus, Enter/Space activation, role/state/access names, and
visible focus indicators. Escape closes the inspector and restores focus.
At narrow widths, the inspector moves beneath the scene with normal scrolling.

New Human requests open the existing inspector alongside the room. Ship it,
Another round and Abandon come from the upstream task specification. Guidance
is a separate subsequent request, exactly as in ZipperGen. Inspecting another
participant preserves the pending decision. The Result control reopens the
outcome, and running/historical inspectors retain the full trace download.

## Visual development

`static/art-preview.html` is an isolated art fixture with explicit example states;
it is not linked or served by the application and never drives a real run.
To compare poses without launching agents:

```sh
uv run python -m http.server 8767 --bind 127.0.0.1 --directory src/zippercrew/static
# Open http://127.0.0.1:8767/art-preview.html
```

The prototype was inspected before application integration. Review setup,
implementing, reviewing, Human attention and completion at laptop sizes after
asset/layout changes. Check silhouettes, feet, furniture overlap, readable
documents, and selected objects with the inspector open. Browser tests can
capture the real process states with `ZIPPERCREW_SCREENSHOTS=/tmp/crew-shots`.
They inspect the actual canvas state, scene continuity, input isolation,
reconnects, motion preferences, canceled transfers and asset failures.
