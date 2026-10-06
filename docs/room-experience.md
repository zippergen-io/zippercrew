# The inhabited Room

The Room is the visual home of the crew, not a simulation of an office.
Phaser presents a clean illustrated miniature studio. Large readable characters
and clear handoffs take priority over physical realism. Normal web UI owns
profiles, model/effort, autosaving briefs, Room/Run management, Human decisions,
conversation and trace. These facilities survived the renderer migration.

## Rendering boundary

`scene.js` forwards semantic snapshots and versioned message envelopes through
`room-engine.js` to `dollhouse-room.js`. `presentation.js` owns cosmetic ambient
scheduling and observed-activity cadence. The renderer cannot change execution.
The production page loads Phaser 3.90.0 locally; no Babylon, WebGL, CDN or remote
asset request is required. Babylon is archived at tag
`archive/babylon-window-studio-2026-10-06`; it is not the production renderer.

The production assets now use the approved Linked Studio background and the
refined Patchwork Cue atlas, copied byte-for-byte from the approved integration
package. `patchwork-cast.json` contains Human neutral/orchestrating frames and
the locked Implementer/Reviewer characteristic frames. The previous cast sheets
remain on disk for history but are not loaded by the renderer. Existing stationery
assets still represent actual protocol envelopes.

The room, characters, desk/laptop occlusion and communication layers are separate.
A masked copy of the room draws the foreground furniture. Canvas masks are kept
outside the world container and explicitly projected at every resize, avoiding
incorrect clipping when the viewport scales. Dynamic text displays the actual
brief, state labels and message metadata; DOM activity bubbles remain crisp.

## Cast and purposeful ambient behavior

Human retains the compact broad silhouette, structured auburn fringe, understated
face and constructed plum/mint/ochre clothing. Implementer is the approved red
rabbit maker; Reviewer is the pale green paper inhabitant. No character artwork
was regenerated for this implementation. Unconfigured roles remain open seats.

The semantic states are unchanged: unconfigured, ready, working, reviewing,
waiting, needs human, completed and failed/stopped. A separate presentation mode
identifies protocol work, ambient occupation, or rest. These cosmetic modes never
change a backend state or acknowledge a message.

`AmbientDirector` starts a local occupied action immediately for ready, waiting
and completed participants. Human listens, reads notes and reflects; Implementer
checks tools, reads sketches and organizes papers; Reviewer reads documents,
checks cards and thinks. Occasional coffee, window, board and short pacing visits
use furniture-safe paths. Routines last roughly 10–19 seconds locally and 21–30
seconds for excursions, avoid the last two choices, and always follow a trip with
a local action. Shared-aisle reservations prevent simultaneous excursions;
returning walkers yield until the aisle is free.

The approved raster art is animated through restrained walk steps, irregular
work/nod gestures, breathing, Human blinks and a lifted mug during coffee. The
Human switches between its approved neutral and orchestrating frames. Agents
retain their approved characteristic frames; this is lightweight 2D animation,
not a complete skeletal or walk-cycle rig. Failed/stopped participants remain calm.

A real task preempts ambient work immediately. Observed sends/receives briefly
suspend ambient routines, interrupt travel and direct attention back to the
station. Timers resume ambient routines only when semantic state allows it.
No CLI action waits for an animation. Reduced motion suppresses travel, blinks,
micro-motion and ambient cycling while preserving task state and static poses.

## Spatial kit, navigation and expansion

`dollhouse-layout.js` places the trio in the approved 1836-unit Linked Studio:
Human near the coffee/window area, Implementer at the central worktable, Reviewer
near the side ledge. Foot anchors, local excursion destinations and inflated
furniture footprints are explicit. Visibility-graph routes test every segment;
unreachable destinations fail closed. The table foreground occludes a participant
behind it, while foreground walkers sort ahead of it by foot position.

Additional role descriptors allocate another three-person studio compartment at
the same character scale. The viewport retains one studio width; selection and
horizontal panning bring annex participants into view. Tests cover three, five
and eight roles. Pair Programming remains the only exposed workflow; an expanded
crew navigation UI is future work. Narrow views retain readable art through
cropping rather than shrinking according to crew count.

## Activity is not communication

**The Room distinguishes local activity from protocol communication. Local
activity is shown through participant animation and short activity bubbles.
Every visible protocol handoff corresponds to a real ZipperGen message and is
represented as a message object moving between participants.**

`ActivityCadence` displays only observable progress supplied by runtime events.
Main line: a short action; secondary line: a safe output/result snippet when
available. Duplicate meanings are suppressed; replacement is limited to 4.5s;
bubbles expire after 6.5s. Silence never changes working state and never invents
new commentary. Separate ambient bubbles briefly describe only the visible
cosmetic action (for example, reading notes or taking coffee). Observed work
always takes priority over ambient labels. Neither kind claims hidden reasoning
or generates a protocol message. Complete information remains in the trace.

Protocol cards require a real `send_id`. Envelopes retain sender, receiver,
label, sequence, channel, payload reference, version and receive status. Send and
receive remain distinct. Cosmetic arrival never writes `receive_id`. A sent-only
card stays pending; received cards fade after a brief inbox dwell. Replayed
consumed messages do not pretend to be new handoffs. Small ordered inbox stacks
show at most three cards; the front card carries legible metadata. Transfers on
one sender/receiver channel are lightly staggered; independent channels can move
concurrently. Clicking a card opens the existing message inspector. Full history
is retained by the existing protocol conversation and trace, not by floor clutter.
Telegram remains another Human endpoint, never an invented fourth participant.

## Responsive and accessible shell

One Canvas persists through setup, runs, decisions, completion and history. The
existing desktop grid keeps the inspector beside the Room and the action dock in
flow. A ResizeObserver resizes the actual drawing buffer, then recomputes the
world transform and DOM hit targets. Short windows shrink the scene; narrow
screens retain the existing stacked/scrollable fallback. No CSS-only canvas
stretching or page-level horizontal scroll is introduced.

Keyboard-selectable participant and brief buttons mirror the exact Canvas
positions. State labels do not depend on color or motion. Inspectors, full
payloads, safe Markdown, errors and actions remain conventional readable web UI.

## Validation

`tests/test_dollhouse.py` checks alpha atlas/frame bounds, furniture-safe routes
for every destination at 3/5/8-role counts, approved-source identity, scaled
foreground occlusion, ten-minute ambient coverage, gestures and all-role preemption. Existing browser tests retain two-round workflow,
message send/receive, history, profile/model/effort, autosave and shell coverage.
See [verification](verification.md) for the real CLI acceptance run, and
[production art](art/dollhouse-production/README.md) for screenshots and prompts.
