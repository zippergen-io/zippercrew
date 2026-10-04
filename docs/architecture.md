# Architecture

ZipperGen defines and executes the communication process.
ZipperCrew makes that process easy to instantiate, use, observe, and enjoy.

## The boundary

One local Python HTTP service serves a dependency-free browser frontend and
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

The frontend creates one SVG scene before loading configuration. Setup edits a
local draft; starting replaces that draft's presentation with server snapshots
without replacing the scene. Participant and shared-brief inspectors serve both
configuration and live inspection. `scene.js` maintains separate participant and
object entities, projects semantic states into poses/positions, and depth-sorts
their SVG nodes. `world.js` supplies the shared 2.5D projection and café assets.
The only backend change for this scene is serving the additional static module. See
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
| `runtime` / `send`, `recv` | ZipperGen channels | Handoff feed and full trace |
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
* The upstream native CLI backend returns completed turns, not incremental
  terminal output or public session metadata. The inspector shows all action
  inputs, proposals, reviews, human replies, and protocol events. A future
  upstream invocation/stream hook can add terminal inspection without changing
  the protocol or visual state model.

No database, workflow editor, remote service, or replacement agent framework.
