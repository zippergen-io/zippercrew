# A process-driven world

ZipperCrew opens directly into a cutaway café. The viewport looks slightly down
onto a wood floor, two walls, a window, a coffee counter, two workstations and a
smaller round Human table. Application chrome is limited to a compact top bar
and task/control dock. Inspectors float beside the scene; results, history,
settings and handoffs use that same inspector instead of replacing the room.
There is no frontend framework, canvas engine, WebGL, asset download or build step.

## Scene boundary

* `world.js` owns the café assets and a common projection from floor coordinates
  `(x, y)` and height `z` into SVG. Furniture has top, front and side faces;
  floor lines, window light and contact shadows share the same geometry.
* `scene.js` owns a small entity registry, participant assets, visual state
  mapping and message effects. Entities have an ID, kind, position, SVG node
  and optional selection target. Participant entities additionally retain role,
  semantic state, pose and profile. Chairs, desks and people are separate nodes.
* `PROCESS` supplies the Pair Programming roles, station/seat/rest positions,
  label anchors, role colors and communication links. Depth sorting uses floor
  position. Another layout can supply different positions without changing
  execution logic. This is not a generic workflow editor or simulation engine.
* `app.js` retains the existing draft, API/SSE consumption and inspector logic.
  Before execution a binding makes a seat configured. After execution starts,
  server snapshots exclusively determine semantic participant state. The SVG
  and participant nodes stay mounted across rounds and outcomes.

Implementer uses terracotta, Reviewer teal and Human muted plum. Those identities
carry through clothing, desk mats, selection indicators, message documents and
inspectors. Names and written states remain available alongside visual cues.

## State and animation contract

| State | Authoritative source | Position and pose |
| --- | --- | --- |
| Unconfigured | No saved profile bound in the local draft | Empty chair, inactive screen, choose-agent marker |
| Ready | Binding selected; room has not started | Participant seated at the station |
| Working | ZipperGen assistant `act_start` for Implementer | Focused posture, typing hands and active screen |
| Reviewing | ZipperGen assistant `act_start` for Reviewer | Reading position beside the screen, raised document and annotation pencil |
| Waiting | Runtime lifecycle / completed action | Agent steps beside its desk with coffee; Human observes at the table |
| Needs human | Pending upstream Human request | Human sits forward, attention marker appears, decision inspector opens |
| Completed | Upstream process returned | Relaxed coffee pose, completed label and small check mark |
| Failed / stopped | Runtime exception / service stop event | Subdued participant and explicit state; result inspector explains the outcome |

CSS interpolates a participant's position when semantic state changes. A motion
duration never causes a state transition. Depth ordering follows the entity's
new position. The Reviewer has a separate reading pose rather than a recolored
typing animation. There are no output-silence heuristics or independent simulation
clock. Reduced motion disables interpolation and loops, preserving the poses.

Each newly observed, numbered runtime `send` produces a document traveling along
an elevated route between the actual sender and recipient stations. Multiple
near-simultaneous sends coexist so that a proposal to Reviewer cannot be erased
by the following send to Human. Finished old tokens are removed; only the latest
arrival remains. Effects are bounded to six concurrent tokens. IDs deduplicate
repeated snapshots. History and page reloads consume existing IDs without
replaying their messages. Reduced motion places a static document at its
recipient. The full trace remains authoritative if SSE coalescing omits events
from the bounded snapshot activity window. Selecting the process also reveals
its routes on the floor.

## Interaction

Desks, characters and their anchored labels select the same participant.
The shared wall board opens normal controls for a full repository path and a
substantial task. The top project chip shows only the repository's short name;
its title and the inspector retain the complete path. Profile management and
model/effort pins remain in Settings and participant configuration.

A new pending Human request opens the Human inspector without interrupting the
scene. It renders the upstream task specification: Ship it, Another round and
Abandon, followed by a separate optional-guidance request when the process asks
for one. Inspecting the Reviewer does not lose the pending interaction; Your
decision returns to it. Result reopens the final outcome after closing its panel.
Every running or historical inspector includes the full trace download.

SVG controls support keyboard focus, Enter and Space; Escape closes the
inspector. Labels, poses and state text supplement color and animation. At
narrow widths the inspector moves below the room, with normal document scrolling
and no fixed control overlay covering its contents.

## Visual verification

Browser tests capture setup, ready, implementing, reviewing, Human attention,
completed and narrow-screen frames when `ZIPPERCREW_SCREENSHOTS` is set. Inspect
those frames whenever geometry changes: character feet should meet the floor,
reading documents should clear desk occlusion, and labels must not cover people.
The automated flow also checks actual pose/position changes, message identities,
scene continuity across rounds, keyboard profile configuration and stopping.
