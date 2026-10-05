# Architecture

ZipperGen defines and executes the communication process.
ZipperCrew makes that process easy to instantiate, use, observe, and enjoy.

## The boundary

One local Python HTTP service serves a browser frontend and
streams room state over SSE. Each Room has a worker process running ZipperGen's
existing `examples/pair_programming.py:pair_programming`. The source is loaded
from the editable sibling checkout, never copied or rewritten. Workers isolate
ZipperGen's module loading and CLI lifetimes between executions. These are local
child processes, not independently deployed services.

ZipperGen owns projection onto Human/Implementer/Reviewer lifelines, messages,
review parsing, decisions, round limits, full/brief/auto behavior, native CLI
session persistence, CLI permission flags, and human answer validation.
ZipperCrew owns Crew bindings, workspace selection, a browser human transport,
event presentation, local execution lifecycle, and the café Environment.

The adapter only replaces assistant action workspace and appends optional role
instructions. Separate upstream CLI backend instances per role retain separate
native conversations throughout a Room. Access remains write for Implementer
and read-only for Reviewer. External tools remain disabled. Claude's Reviewer
uses restricted shell (no Bash) because its plan permission mode alone is not
an OS filesystem sandbox. Codex retains sandboxed shell for verification.

Named profiles are read and saved through `zippergen.workspace.Workspace` in a
selected profile directory's `zippergen.toml`. The default is
`~/.config/zippercrew` (or `$XDG_CONFIG_HOME/zippercrew`), independent of the launch
directory and working repository. This is a user-owned ZipperGen configuration
project, using the same profile API and file format. An explicit `--project`
or browser directory selection can reuse a repository's existing configuration.
Existing project profiles are never moved automatically. No credentials are
read or stored by the UI.
Crew bindings are execution data, not a second assistant profile registry.
Each binding snapshots its profile's backend, optional model, and reasoning
effort at room creation. Those settings go unchanged to ZipperGen's native
backend factory, which applies them to initial and resumed CLI turns. Browser
configuration cannot override the saved profile's pins. Role instructions are
per-Room additions. Profiles can change without altering an existing execution.

The frontend creates one Phaser Canvas scene before loading configuration. Setup edits a
local draft; starting replaces that draft's presentation with server snapshots
without replacing the scene. Participant and shared-brief inspectors serve both
configuration and live inspection. `scene.js` is the boundary between snapshots,
accessible DOM controls, and the renderer. `room-engine.js` owns a small entity
registry, authored sprite poses, floor positions, depth sorting, and message
effects. `presentation.js` isolates cosmetic ambient scheduling and bubble cadence
from authoritative runtime state. The role layout and café/character assets are separate from execution.
Phaser is pinned and served locally; no npm install, CDN request, or frontend
build is needed to run the application. Canvas rendering avoids a WebGL dependency.
The backend additions serve packaged assets within the static directory and allow
the loader's local blob image URLs in CSP. See
[room experience](room-experience.md) for the visual contract.

## Events and human endpoint

Runtime `act_start`/`act` events determine working, reviewing, and waiting states.
Runtime send/receive events remain available in the full trace. Review verdicts
are parsed with the example's own `review_header` helper for presentation only.
The process alone decides whether to loop. A monotonically numbered JSONL journal
stores every event; snapshots and transcripts are reduced from that journal.
SSE reconnects deliver the latest complete snapshot, so dropped browser
connections do not lose a pending interaction or duplicate a response.

The browser transport renders `build_human_task_spec` and validates answers with
`human_task_result_from_value`. Each request has a unique ID, with stale and
duplicate answers rejected. Another round and optional guidance remain two
separate human actions, exactly as in the source workflow. At the round limit
ZipperGen does not request guidance it would discard.

The service binds only to loopback, validates Host/Origin, and requires a
same-origin custom header for mutations. This is a local tool, without accounts.
One active Room may own a workspace at a time (including overlapping directories).
Stopping terminates the worker process group, including active assistant CLIs.
Abandoning/stopping never reverts files. History survives service restarts;
interrupted rooms are marked stopped, never silently rerun. v0.1 does not resume
interrupted executions. Native conversations persist across rounds while running.
The worker watches its service pipe: EOF terminates its process group, including
an in-flight CLI, so a service crash does not leave an unobserved agent working.

| Event | Source | Presentation |
| --- | --- | --- |
| `room.started` | Worker launch | Running, all participants waiting |
| `runtime` / `act_start` (assistant) | ZipperGen trace callback | Implementer working / Reviewer reviewing |
| `runtime` / `act` (assistant) | Completed ZipperGen action | Waiting; append full turn to inspector |
| `runtime` / `send`, `recv` | ZipperGen channels | Correlated message cards, inboxes, inspector and full trace |
| `assistant.invocation`, `assistant.progress` | Optional native CLI observer | Current local activity and recent progress; no protocol messages |
| `review.verdict` | Upstream `review_header` on completed review | APPROVE/REVISE display only |
| `human.required` | Upstream human backend invocation | Pending task; Human active |
| `human.responded` | Validated answer returned to runtime | Human waiting; append response |
| `room.completed` | `run()` returned | Final upstream outcome |
| `room.failed`, `room.stopped` | Runtime exception / process lifecycle | Terminal status and explanation |

Each event receives an ordered ID and timestamp in the service. `room.started`
includes the Crew configuration so a downloaded trace stands alone. Rendering
changes only the example's terminal-specific trace directions into browser
inspector directions. The persisted process outputs remain verbatim.

## Upstream gaps, deliberately isolated

* The process lives in `examples`, outside the installed package. Development
  requires the sibling editable checkout; `ZIPPERGEN_SOURCE` can select another
  checkout. Packaging reusable process factories upstream would remove this
  source-tree dependency. An integration test pins the expected process contract.
* Telegram consumes durable tasks in ZipperGen's SQLite execution store and uses
  its existing connector/deployment routing. This first local browser transport
  does not create a competing Telegram subsystem. Existing `zg deploy` Telegram
  runs continue unchanged. A future durable Room adapter should render and
  complete those same stored tasks, allowing browser/Telegram completion to race
  through ZipperGen's single authoritative task completion operation.
* The native backend now has an optional public progress observer (see
  `zippergen/docs/assistant-progress.md`). It preserves result/session validation
  and exposes only selected tool metadata. ZipperCrew's adapter subscribes per
  role and records sanitized summaries through `assistant.invocation` and
  `assistant.progress`; the reducer rejects stale invocation IDs. No stdout
  scraping, monkeypatching or replacement CLI/session machinery is needed.
  Complete interactive terminal inspection remains outside this slice.

No database, workflow editor, remote service, or replacement agent framework.

## Presentation layers

The Room is a faithful, intentionally simplified visualization of execution.
Semantic state comes only from ZipperGen/runtime. Ambient behaviour makes ready,
waiting and completed participants feel alive but never changes or delays the
process. New work, receive events and Human attention preempt cosmetic actions.

The Room distinguishes local activity from protocol communication. Local activity
is shown through participant animation and short activity bubbles. Every visible
protocol handoff corresponds to a real ZipperGen message and is represented as a
message object moving between participants. Bubbles never claim access to hidden
reasoning or fabricate thoughts. The optional native CLI observer supports live tool/file/test summaries; action
boundary bubbles remain a fallback when no public progress arrives.

The reducer retains separate send/receive journal references, sender, receiver,
channel and per-channel sequence; it tolerates receive-before-send callback order.
Only actual receives mark consumption. Movement never invents receipts, failures,
acknowledgements or session IDs. A bounded payload preview belongs to the inspector;
complete information remains in the transcript/trace. The scene retains pending
cards and a short consumed history, while the journal remains complete.

Cosmetic scheduling has injected clock/random inputs for deterministic testing.
It reserves shared destinations, favors stillness and cancels on semantic changes.
The browser stores only the Full/Reduced motion preference; it never sends ambient
choices back to the worker. Existing workflow execution, human endpoints and CLI
permissions remain unchanged.

## Participant inspector

The Room shows the process happening. The inspector explains the selected
participant's part in that process. The trace records everything.

The participant inspector presents identity and semantic state first, one current
or last meaningful activity next, and protocol conversation as its primary content.
The latest round is expanded; earlier rounds and the initial brief are collapsed.
Profile, CLI, model/effort, workspace path, role instructions and recent distinct
local activity remain available in secondary disclosures. Setup keeps its existing
profile and Human-mode editors.

`inspector.js` reads real send/receive envelopes from the existing JSONL trace
endpoint. It correlates sender, recipient, channel and sequence, tolerating
receive-before-send callbacks; it does not turn assistant inputs, local progress,
or repeated task context into messages. Rounds follow actual Implementer action
starts. In particular, guidance sent before the next round starts stays with the
round in which it was sent. The original brief appears once as its real initial
handoff. Runtime control envelopes remain available in Handoffs and the trace.

The browser fetches the journal on participant selection and subsequent protocol
changes, not every local progress update. It retains complete conversation history
beyond the Room's bounded recent-message projection. Payloads are expanded on demand,
with structured review headers surfaced as verdict, finding count and headline.
Markdown is parsed by locally pinned Marked and sanitized by DOMPurify to a small
allowlist of document elements. Images, embedded controls and non-HTTP(S) navigation
are disabled. Original trace payloads are never modified.

Live snapshots update the current-activity summary. Equivalent recent activities
are deduplicated, with the last five distinct observations in a closed activity log;
the full journal is still downloadable. Expanded messages and keyboard focus persist
across local activity updates. A newly advanced round becomes the default focus.
There are no inspector writes to workflow state, no new API, and no renderer or
animation changes; the service only adds a static route for the inspector module.
