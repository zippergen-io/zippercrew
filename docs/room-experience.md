# Corner Café: the scene boundary

The viewport looks into a close three-quarter café. Large, distinct characters
occupy the foreground; the warm windows, coffee counter and shared brief sit
behind them. The scene persists through setup, work, decisions and completion.
Settings, repository paths, long text, profiles and transcripts remain ordinary
DOM inspectors. No game mechanic controls the workflow.

## Rendering

* `babylon-room.js` owns one Babylon scene, with `room-engine.js` as its stable
  entry point. Role data declares seat, approach and rest positions in metres.
  Desks, chairs, people and handoffs occupy the same right-handed, Y-up world.
* `scene.js` adapts runtime snapshots and deduplicated message envelopes, and
  projects accessible DOM controls onto the scene. Inspectors remain normal HTML.
* The renderer imports the local GLB kit. Each persona has an articulated skin
  and the same animation-channel vocabulary, with role-specific geometry/poses.
  Clips crossfade; movement follows authored aisles, with a turn and seated pose
  at the workstation. Semantic state changes cancel cosmetic routes immediately.
* Babylon 9.15.0 and its glTF loader are vendored. There is no CDN, npm install, or
  frontend build requirement. WebGL/asset failures remain explicit.
* One window key light casts real shadows; a sky fill keeps silhouettes readable.
  Characters and environment receive shadows through the same rendering path.
* A ResizeObserver updates the drawing buffer and perspective camera. Activity
  bubbles remain crisp DOM elements anchored above the actual 3D heads. Pointer
  picking selects geometry; accessible buttons retain keyboard navigation.

The permanent desktop inspector and responsive shell are unchanged: bounded
inspector, flexible scene, normal-flow action footer, internal inspector scrolling.
Short windows shrink the scene, then scroll. Narrow windows stack the two surfaces.

## Art and identity

Corner Café is now an original stylized game level: broad coral and slate walls,
chunky trestle desks, large monitors, iconic coffee equipment, and a few oversized
leaves. The floor extends beyond the foreground instead of framing a miniature
architectural display. Clean rough materials replace photographic textures.

Implementer is a compact coral robot with a wide headset and antenna; Reviewer
has a taller teal silhouette, asymmetric scanner and review pad. Human has swept
graphic hair, a plum jacket and exaggerated shoes/hands. All use the same game
proportions. These are first-pass articulated models, not realistic people.

`tools/build_cafe.py` authors the original mesh profiles, rigid skin weights,
materials and clips into self-contained GLBs. Run it with Python's standard
library to regenerate the asset kit. The source is editable; no proprietary
modeling tool, generated bitmap or third-party character license is required.
See [3D direction and validation](art/babylon-cafe.md). Earlier bitmap studies
remain in the art history but are not loaded by the current Room.

## State and animation contract

| State | Authoritative source | Position and pose |
| --- | --- | --- |
| Unconfigured | No profile in the draft binding | Empty chair with a compact choose-agent target |
| Ready | Profile selected, execution not started | Agent stands beside the station; Human observes at the table |
| Working | Implementer `act_start` | Walk to chair, sit forward, type; occasional thinking pose during the same action |
| Reviewing | Reviewer `act_start` | Return to desk, read the tablet, pause to think/annotate |
| Waiting | Runtime lifecycle / action completion | Agent relaxes near its station; occasional ambient actions follow |
| Needs human | Pending upstream Human request | Human stands with the lit phone and attention expression; inspector opens |
| Completed | Upstream process returned | Crew stands relaxed with a restrained success gesture |
| Failed / stopped | Runtime exception / service lifecycle | Concerned pose, subdued color, explicit result |

Skinned walk clips blend into seated work/review poses. Timers only animate an
existing semantic state; they never infer work, testing, silence or results. A new
state cancels its predecessor's movement and temporary gestures. Semantic state
always wins, including during an ambient walk. Animation never gates a runtime
action. Reduced motion uses stationary poses, disables ambient travel, and places
message cards directly at their visual destination without inventing receipts.

### Ambient life

`presentation.js` owns a small, pure `AmbientDirector` with injected time and
randomness. `semanticState`, `ambientAction`, and `currentActivity` are separate.
Only ready, waiting and completed participants are eligible. Initial pauses are
18–44 seconds; later attempts are 25–65 seconds apart. 65% of attempts do nothing
until the 100-second anti-starvation bound. An in-place action lasts 6.5–11 seconds;
a destination interaction holds for 8.5 seconds after arrival, then returns home.
Rest periods are 30–80 seconds. Small authored idle loops continue between trips. Consecutive
actions differ. Human attention, active work, unconfigured and error states
never allow ambient behaviour.

Implementer stretches, glances at the monitor or visits the coffee counter.
Reviewer reads the tablet, checks the shared board or holds coffee. Human checks
the phone, looks around, visits the window or sits at the laptop. The corresponding rigged clips supply these poses. Short authored destinations stay behind the
workstations; an exclusive back-aisle reservation avoids simultaneous visits.
A new semantic state cancels ambient movement and releases its reservation
immediately. A real incoming message also interrupts an ambient action.

### Local activity bubbles

**Activity bubbles describe observable local work, never hidden reasoning.**
`ActivityCadence` deduplicates event IDs, coalesces new activity, allows at least
4.5 seconds to read a bubble, and expires it after 6.5 seconds. Silence generates
nothing. Work animation continues after the bubble fades. Leaving the active
state removes the bubble immediately. Human gets the real decision UI, not
invented commentary. Accessible status text mirrors the short bubble.

The native ZipperGen CLI backend now offers an optional `on_progress` observer.
ZipperCrew subscribes per role, retaining ZipperGen's prompts, permissions and
persistent conversations. Codex's JSON tool events and Claude's streamed tool-use
blocks supply public command/file metadata. Unknown events, reasoning, assistant
text, raw tool output and patches never become bubbles.

`activity.py` makes conservative deterministic summaries: recognized test commands
become “Running tests…”, `git diff` becomes “Checking the diff…”, explicit file
changes become “Updated session.py.” Unrecognized or compound commands remain
“Running a shell command…”. Exit status can report a test command's success or
failure; it cannot invent a finding count or change a review verdict. Only short
summaries, basename, public tool ID and operation/phase enter the progress journal;
raw command arguments are not persisted by ZipperCrew.

Each CLI invocation has a unique ID. The reducer accepts its progress only while
that same invocation is semantically active. Delayed observer events cannot revive
an ended turn or leak into another round. Progress uses the existing bubble cadence
and a bounded Recent activity section in the participant inspector. The normalized
observations are in the full room journal. This is best-effort telemetry; missing
progress leaves the work animation running without invented commentary. The
observer queue never backpressures tool execution, and subscriber errors cannot
change the final action result. Action-start bubbles remain the fallback until
observable tool activity arrives.

### Protocol handoffs

**The Room distinguishes local activity from protocol communication. Local
activity is shown through participant animation and short activity bubbles.
Every visible protocol handoff corresponds to a real ZipperGen message and is
represented as a message object moving between participants.**

`state.py` projects `send`/`recv` onto envelope identities
`(sender, receiver, channel, sequence)`. Send and receive journal IDs are separate,
including when concurrent trace callbacks report receive before send. Binding
names supply labels (Task, Proposal, Review, Guidance, or generic field names).
Runtime control messages use smaller members of the same card family; private
control payloads are never exposed. Channel/sequence are correlation cues, not
invented CLI session identifiers.

Sends originate at the actual sender, branch as separate recipient envelopes,
and can fly concurrently. Per-channel sequence orders incoming stacks. Animation
arrival does **not** mark delivery: unreceived cards stay visibly pending, with
an incoming count. Only runtime receive updates the receipt. The runtime consumes
the channel item on receive; no extra acknowledgement or failure is inferred.
Animations may catch up after a recorded receive, but never delay it.

Cards carry a sender-colored edge, a compact label and receipt/sequence. Click a
card or open **Handoffs** for sender, receiver, channel, sequence, separate event
IDs, a bounded payload preview and the full trace link. Only three cards per
recipient are drawn; the inspector preserves every outstanding envelope and
80 recently consumed envelopes. Received cards fade after a short readable
pause. Repeated snapshots do not duplicate flights. Reload/history restores
pending cards statically and does not replay consumed messages. Room changes
cancel old effects. Full payloads and complete history remain in the trace.

**Settings → Room animation → Reduced** disables ambient motion, walking and
loops while retaining poses, activity text, pending cards and real receipts.
This preference is saved in browser local storage. OS reduced motion always
wins and changes apply immediately. The scene is silent. Telegram remains a
delivery surface for Human where upstream supports it, never a new lifeline.

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

`static/assets/3d/prototype.html` is an isolated art fixture with explicit example states;
it is not linked or served by the application and never drives a real run.
To compare poses without launching agents:

```sh
uv run python -m http.server 8767 --bind 127.0.0.1 --directory src/zippercrew/static
# Open http://127.0.0.1:8767/assets/3d/prototype.html
```

The prototype was inspected before application integration. Review setup,
implementing, reviewing, Human attention and completion at laptop sizes after
asset/layout changes. Check silhouettes, feet, furniture overlap, readable
documents, and selected objects with the inspector open. Browser tests can
capture the real process states with `ZIPPERCREW_SCREENSHOTS=/tmp/crew-shots`.
They inspect the actual canvas state, scene continuity, input isolation,
reconnects, motion preferences, canceled transfers and asset failures.


## Room refinement

A Room is the persistent crew/workspace/process context. A Run is one task executed
inside it. The inline Room name and compact actions menu support rename, history,
and confirmed deletion; Run again returns to an editable brief in the same scene.
The latest Run opens by default. Earlier Runs display a history indicator and a
Latest run shortcut, and cannot be edited or resumed through their inspectors.

Setup inspectors show profile/runtime, supported native model/effort overrides,
access and instructions. They contain no empty conversation or activity sections.
Running inspectors lead with state, round, current local activity and conversation.
Completed participants lead with the semantic result, including review verdict and
findings. Technical information remains collapsed.

Workstations use actual GLB desk/chair/screen geometry. The role's approach point,
chair point, seated transform and monitor direction share the same world. The
keyboard is positioned under the forward-reaching work pose; short legs use the
chair footrest. Perspective and depth are handled by Babylon, not sprite ordering.
The ZipperCrew wordmark stays distinct from the unchanged canonical ZipperGen
mark in the powered-by attribution.

### Character performance, separate from process state

`tools/cafe_motion.py` authors 24 clips shared across the three articulated rigs,
with different timing and gesture amplitudes by role. Idle and active clips include
body shifts, glances, breathing and brief blink windows. Independent brow and
mouth joints, eye openness and small gaze shifts make the cast readable at room
scale. These expressions are authored animation, not inferred model emotions. Implementer types in bursts
and pauses to inspect the monitor; Reviewer tilts its head and taps the pad; Human
observes or attends to a phone. These are expressive poses, never claims about an
agent's hidden reasoning. They do not emit activity summaries or messages.

Large ambient actions remain scheduled and reserved independently of those clips.
The coffee trip has an arrival/reach phase followed by a drinking phase. Seated
actions use actual chair/table transforms. Standing precedes departure; sitting
blends into working/reading. Semantic transitions discard pending cosmetic stages
and reservations immediately; no clip completion gates a ZipperGen action.

Reduced motion retains representative still poses. Returning to Full explicitly
restarts paused Babylon animation groups: `start()` on an already-started paused
group does not resume it. Browser tests measure actual joint changes over time
for all three personas so pose metadata cannot disguise a frozen rig.

Activity summaries recognize single observed test, formatting, lint, type-check
and build commands (including simple `uv run` / `poetry run` launchers). Bounded
pytest/unittest/Jest totals, Ruff/Mypy counts and `git diff --check` success become
secondary result lines. Simple `sed` reads expose only a safe basename and line
range. Compound commands and unknown tools keep generic descriptions; arbitrary
output, paths, command arguments and reasoning are never copied into bubbles.

### Furniture-aware navigation and chair interactions

`tools/cafe_layout.json` is the shared source for station position/orientation,
interaction points, room bounds and fixed furniture. Asset authoring emits
`assets/3d/layout.js`; `navigation.js` builds a small visibility graph around
expanded, rotated furniture footprints. Each walking segment is checked against
current footprints, including moving chairs. An unreachable goal stops/retries
safely; there is no direct-line fallback. This is floor navigation, not crowd AI.

Chairs are separate movable GLB groups. A seat request pulls the chair out, routes
the participant to its open front, blends a sit/back-step, then moves chair and
seated persona to the work transform together. Departure reverses those stages.
Swept chair space is reserved while it moves; an empty chair returns only when
participants are clear. Incoming semantic state replaces the destination at once.
A partially seated persona completes a safe exit/re-entry instead of snapping
through a chair; the runtime never waits for that cosmetic transition. Reduced
motion uses the final stationary transforms.

The Human starts seated at the shared café table; Reviewer usually checks a tablet
while waiting. Neither is arranged as a front-facing standing display. Human
attention uses a seated phone pose. A newly configured agent joins at a clear
waiting position, not inside the unconfigured chair's placeholder coordinates.

The navigation tests cover every role/destination pair, unreachable goals, actual
per-frame walking clearance, chair entry/exit and attention during departure. A
separate test compares imported GLB vertices with collision footprints. Planters
and stems are solid; soft foliage can overhang the walkable floor.
