# Architecture

> Historical notes: much of this document describes the earlier `/` interface.
> Start with the [current README](../README.md) for setup and workflows.
> See the [audit follow-up](audit-follow-up.md) for the findings addressed on 2026-10-10.

ZipperGen defines and executes the communication process.
ZipperCrew makes that process easy to instantiate, use, observe, and enjoy.

## The boundary

One local Python HTTP service serves a browser frontend and
streams room state over SSE. Each Run has a worker process running ZipperGen's
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
native conversations throughout one Run. Access remains write for Implementer
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
Room bindings reference shared profiles and may carry `settings` overrides using
ZipperGen's existing `model` / `reasoning_effort` keys. Empty overrides inherit
profile/CLI defaults. `validate_config` resolves the profile plus these overrides
through upstream `assistant_settings`, and snapshots the effective selection into
the Run. The native backend factory receives that selection on every turn. The
upstream adapter's `setting_options` declares which setup controls are supported;
no private model catalog, new CLI command builder or upstream extension is needed.
The service checks pinned-setting CLI flags before launch. Native CLIs validate
actual model/effort availability. Shared profiles are never modified by Room edits.
Role instructions are per-Room additions. Configuration changes never rewrite a
previous Run's effective configuration or transcript.

The frontend creates one Phaser Room before loading configuration. Setup
autosaves a persistent Room draft; starting supplies server snapshots to that
same scene. `scene.js` bridges snapshots and accessible DOM controls;
`room-engine.js` re-exports `dollhouse-room.js`. Phaser owns authored image layers,
pose selection, presentation movement and message-card animation. It cannot
start work, advance rounds, acknowledge messages or decide a verdict.
`presentation.js` retains the shared ambient scheduler and observed activity
cadence. The only server support changes are static JS routes and serving atlas
JSON bytes without trying to JSON-serialize them again.

### Renderer decision — 2026-10-06

Phaser is the production renderer. Babylon solved true spatial realism, but
physical realism is not central to ZipperCrew. Character connection, coordination
readability, scalability, visual identity and lightweight animation matter more.
This is a new authored flat 2D miniature world, not restoration of the old
pseudo-realistic Phaser café or its procedural SVG surfaces.

The complete Babylon working state is preserved in commit `078f566` and tag
`archive/babylon-window-studio-2026-10-06`. Its source/assets remain available for
reference in development, but the application does not load Babylon or GLBs, and
the wheel excludes them. No product/backend rollback occurred.

Phaser 3.90.0 is vendored with its MIT license. Local PNGs + JSON frame atlases
supply all character/furniture/message artwork. Canvas requires no WebGL, external
service, npm installation or build. The original raster pixels are retained;
`tools/index_dollhouse.py` computes frame metadata only. See
[room experience](room-experience.md) for layout, navigation and pose contracts.

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
One active Run may own a workspace at a time (including overlapping directories).
Stopping terminates the worker process group, including active assistant CLIs.
Abandoning/stopping never reverts files. History survives service restarts;
interrupted Runs are marked stopped, never silently rerun. v0.1 does not resume
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
  and exposes selected tool metadata and optional command results. ZipperCrew's adapter subscribes per
  role and records sanitized summaries through `assistant.invocation` and
  `assistant.progress`; the reducer rejects stale invocation IDs. Public command
  results are stored separately as `assistant.tool_output` for trace inspection,
  with only allowlisted metrics exposed in bubbles. No stdout
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
The Room retains its Full/Reduced motion preference, with a browser fallback; it never sends ambient
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
Inspector configuration edits affect the next Run only; protocol decisions still
use the existing authoritative Human endpoint.


## Persistent Rooms and Runs

`catalog.py:Catalog` stores one atomic JSON record per named Room in
`<data-dir>/catalog/<room-id>.json`. It owns name, process, participant profile
references and overrides, workspace, Human mode, round limit, environment/motion,
a next-run brief, timestamps and an ordered list of Run IDs. Incomplete setup is
valid; full workspace/profile/task validation occurs before execution.

`rooms.py:Run` and `Runs` own workers and append-only journals. The historical
storage path `<data-dir>/rooms/<run-id>/` is retained to avoid moving existing
traces. A Run snapshots its task/configuration and has its own worker, state,
rounds, messages, timestamps, outcome and trace. Each worker creates fresh native
sessions; the two roles keep separate sessions across rounds within that Run.
Legacy `room.started` / `room.completed` event names remain unchanged for trace
compatibility. They describe execution lifecycle, not creation/deletion of a
persistent Room.

On first launch, each unowned legacy execution is adopted as a separate Room,
named after its workspace. Completed journals stay byte-for-byte intact. Migration
is idempotent. A Run's persisted `room_id` repairs ownership if a crash occurs
between worker creation and the catalog update. Interrupted Runs are stopped,
never resumed by inspecting history. The catalog and execution registry share a
lock for starts, edits and deletions; overlapping active workspaces remain blocked.

API: `GET /api/rooms` lists Rooms; `POST /api/rooms` with `{name, config, brief}`
saves setup. `/api/rooms/<id>/context` returns configuration; `/save` updates it;
`GET /runs` lists history and `POST /runs` starts a fresh execution.
`/api/runs/<id>` and its `/events`, `/trace`, `/answer`, `/stop` resources serve
executions. Old `/api/rooms/<run-id>` execution URLs and the old flat start request
remain compatible. Browser URLs contain both Room and Run IDs; `setup=1` restores
an editable next brief. A prior Run's brief and configuration are read-only.

Deletion requires confirmation matching the current Room name, refuses active
Runs, and removes only known run directories under ZipperCrew storage plus the
Room record. It never traverses workspace/profile config paths. A persisted
deletion marker lets startup finish an interrupted deletion rather than re-adopt
orphaned execution directories. Symlinked run directories are refused.

### Observable result detail and scene surfaces

The CLI progress hook previously exposed commands and exit codes, but discarded
command results and Claude Read ranges. A small upstream telemetry extension adds
optional observed command output and read offset/limit metadata. Claude completion
records are correlated by tool-use ID within one invocation, never across sessions.
This remains an observation API; workflow actions, permissions, messages and final
result validation are unchanged. The UI only displays deterministic allowlisted
result summaries. Public command output is available in the trace (bounded at
262,144 characters per tool result, with explicit truncation metadata); reasoning and file-read
bodies are excluded. As with existing full action payloads, traces are local debug
artifacts and may contain workspace content.

The miniature studio uses authored furniture/character layers and small contact
shadows. Floor anchors determine occlusion order. Environment shading is
part of the artwork; there is no physical shadow simulation. The brief is text
inside an authored flat board sprite, matching the fixed front-facing viewpoint.

Lightweight Room edits autosave after 700 ms, with a persistent Saving / Saved /
Not saved indicator and a Retry action. Switching or closing an inspector flushes
pending draft changes; a failed write retains the draft. Navigation flushes drafts,
and leaving the document warns while changes remain unpersisted. Creating a shared
named assistant profile remains an explicit operation.

Ambient actions are role-specific and use authored aisle/approach points. Coffee,
board and window trips share a reservation; ordinary stillness remains the usual
outcome of a scheduling opportunity. A bounded long idle interval prevents a
participant remaining frozen indefinitely. Semantic work and Human attention cancel
ambient movement immediately. Reduced motion disables ambient actions altogether.

### Responsive application shell

The shell has one fluid, full-width grid: intrinsic header, flexible workspace,
and intrinsic action footer. The workspace divides into `minmax(0, 1fr)` for the
Room and a bounded 22–27rem inspector. The inspector header/footer remain in view;
only its body scrolls. Flexible children explicitly permit shrinking in both axes.
Legacy floating-inspector margins and competing fixed scene heights are removed.

On ordinary laptop viewports the Room receives the space left after controls.
Below the minimum usable workspace height (20rem), the document scrolls instead
of hiding overflow. At widths of 900px or less, Room and inspector stack, with the
footer in normal flow; it cannot cover either surface. Header and footer controls
wrap, and long brief/path content cannot impose a minimum page width.

A ResizeObserver resizes Phaser's Canvas drawing buffer to the host dimensions. The
world container scales to a stable logical viewport. Additional bays extend the
world horizontally instead of shrinking the cast. DOM hit targets
and activity bubbles use projected world positions, never hard-coded screen
coordinates. Resizing redraws the scene immediately so a changed backing buffer
cannot leave the room blank between layout and the next animation frame.
