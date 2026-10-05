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
  roles. Message routes come exclusively from runtime envelopes; it deduplicates SSE updates.
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
predecessor's movement, reaction and posture callbacks. Semantic state always
wins, including during an ambient walk. Animation never gates a runtime action.

### Ambient life

`presentation.js` owns a small, pure `AmbientDirector` with injected time and
randomness. `semanticState`, `ambientAction`, and `currentActivity` are separate.
Only ready, waiting and completed participants are eligible. Initial pauses are
25–55 seconds; later attempts are 35–90 seconds apart. 65% of attempts do nothing.
An action lasts 6.5–11 seconds followed by 45–120 seconds of rest. Consecutive
actions differ. Human attention, active work, unconfigured and error states
never allow ambient behaviour.

Implementer stretches, glances at the monitor or visits the coffee counter.
Reviewer reads the tablet, checks the shared board or holds coffee. Human checks
the phone, looks around or has coffee at the table. The existing authored poses
are reused; no art assets change. Short authored destinations stay behind the
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
