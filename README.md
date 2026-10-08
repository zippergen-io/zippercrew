# ZipperCrew

Assemble two CLI coding agents, give them a task, and watch their communication
process in an inhabited illustrated miniature world. The Implementer edits your repository; an
independent, read-only Reviewer examines the actual files. You decide when to
ship, ask for another round with optional guidance, or let review drive the loop.

**ZipperGen defines and executes the communication process.**
**ZipperCrew makes that process easy to instantiate, use, observe, and enjoy.**

## Run locally

Requires Python 3.11+, uv, and the sibling `../zippergen` checkout. macOS and Linux
are supported. Install and authenticate Codex or Claude using its own CLI first.

```sh
cd ~/zippergen-io/zippercrew
uv sync
uv run zippercrew
```

Open **http://127.0.0.1:8765/office/** for the pixel office. The world stays full-screen;
setup, task messages, and decisions open in small modern windows.

1. Open **⋯ → Rooms → + New room**. Optionally name it, then choose a workflow:
   **Direct** (You → Worker → You) or **Review** (You → Worker → Reviewer → You).
   Choosing a workflow creates and enters the room immediately.
2. Click the **room name** to rename it or browse for its repository folder. This compact panel also holds the
   workflow, a collapsed Team overview, and advanced room options.
3. Click each **agent** to choose its avatar, model, and reasoning effort inline.
   Model names come from local CLI metadata and existing bindings; profile nicknames
   stay hidden. Custom instructions are optional, in a collapsed section.
   Authenticate the chosen CLI beforehand. Quiet room markers show missing models.
4. Click the **whiteboard** and define the task. Edits save automatically after a short
   pause and when leaving the editor. Choose **Run** in the top bar when ready.
   The Worker edits the repository. Review adds an independent, read-only Reviewer.
5. When **Your decision** appears, open the result and finish or request another round.
   Direct returns the Worker's result to you; Review includes the review. Finishing a
   run does not commit or push.

The room title and status are one clickable target. Setup uses muted red; ready
rooms use muted green. **Run** becomes **Stop** during execution and **Your decision**
when the workflow needs you. Stop ends the process group, retaining edits and history;
Run starts a fresh run. ZipperGen supports durable execution, but this app currently
uses its in-memory runner: resumable pause is not exposed.

The task editor shows saving/saved status and keeps failed drafts available for retry.
Run waits for all pending task edits to save before taking its execution snapshot.

The hierarchy is **Studio → Room → Workflow → Roles / Agents + Task**. The Studio
menu contains only **Rooms** and **History**. Day/night stays in the top bar, and
ambient motion respects the system’s reduced-motion preference. Repository, workflow,
round limits and human involvement belong to the room panel. History groups previous
runs by room and provides full conversations, activity, shell output and traces.

Click a room name in the list to enter it; the current room is highlighted. Rename
it in its room options. The trash button confirms deletion. Changing workflows keeps the Worker and task; removing
configured Reviewer settings requires confirmation. Existing rooms default to Review.
Past run snapshots and conversations retain their original workflow and participants.
Direct always returns the result to the Human; Review additionally offers automatic
review decisions in its advanced room options.

Creating rooms and saving configuration never launch agents. Closing a panel or entering
another room does not stop a run. Running tasks use immutable configuration; edit roles
and workflows after the run finishes or is stopped. Starting again creates fresh agent
sessions. The office has no global agent administration or workflow graph editor.
Day/night lighting, movement, and seating use the approved pixel-office artwork.
Agent states and work bubbles follow backend events, with no scripted work fallback.

Fit retains integer physical-pixel scaling; manual zoom uses finer 12.5% steps with
nearest-neighbor rendering and no sprite smoothing. Small screens can pan. Agents walk at 64 art pixels/second (formerly 25);
your avatar moves at 76. The wall clock follows your computer's local time.
Working agents type and their monitors animate; idle agents turn away and stretch,
occasionally visit the coffee corner or lounge, and exchange short social bubbles.
Agents needing configuration stay at their desks. Ambient breaks yield to real work and handoffs. Pause/reduced motion freezes
ambient movement and typing, while the clock and actual task feedback stay live.

A crocodile companion stands quietly along the lounge edge, occasionally peeking or
taking a short walk after 37–51 seconds of rest. Every pose stays upright on its
hind legs, including idle and blinking. The default is about 6% smaller than the
approved avatar-height version; set `COMPANION.size` to `'original'` to restore it.
The original artwork is retained unchanged, alongside a nearest-neighbor size variant.
The rounded muzzle, big eyes, tiny hands and striped belly follow the pencil reference.
It yields to agent movement,
messages, human decisions, and open panels, and respects pause/reduced motion.
It has no workflow role or click target. Its original pixel poses live in
`static/office/crocodile-art.js`; nooks and timing are data in `office/world.js`
(`COMPANION`), with behavior isolated in `office/mascot.js`.

Blue-tinted work bubbles carry up to six lines of deliberate public status; warm thought
bubbles denote ambient moments, and conversations use speech tails and role accents.
With the matching ZipperGen checkout, agents publish explicit `<ui-status>` updates
before the first tool call and at meaningful milestones, aiming for an update every
20–30 seconds during sustained work when the CLI can speak. The prompt asks for
concrete findings, next actions, and their purpose. New statuses can replace older
work bubbles after four seconds; reading time scales with message length. Those updates remain separate from shell telemetry and
private reasoning. Older runtimes use specific tool-based descriptions, never generic
Working/Thinking bubbles. The detail window has an on-demand shell-output log.
Agent cards show the latest three activity events; the task window shows twelve,
alongside full turn responses. Screen marks are abstract activity,
not literal terminal output. Tool details depend on the CLI progress observer;
without it, the office shows the actual working/reviewing state and final messages.

The framed project board at the back of the room shows the task title, two short
excerpt lines, and a separately padded round/status line. Its warm writing surface,
magnets, marker tray, and slim supports use native pixel art in both moods.
Click it to read the full brief and open task controls.
Real protocol messages trigger visible handoffs: the sending agent carries a note
over, the recipient briefly acknowledges it, and the crew returns to their desks.
A quiet amber arc marks a pending human decision, subdued at night and static with
reduced motion. The carried note crosses from sender to recipient in a short transfer;
the sender returns empty-handed while the recipient briefly holds the document.
The crocodile has a small collision body and yields to moving office inhabitants.
Accepted Start, Save, Stop and decision actions close the dialog and show a brief agent
acknowledgment; failed requests keep the dialog and draft intact. If another input is
required (such as guidance), use **Your decision** to reopen it.
These animations never delay execution or invent a receipt. Reloading and reconnecting
do not replay old exchanges; reduced motion uses brief bubbles without courier walks.

The original visual-only preview remains in `spikes/pixel-office/`. The packaged live
client lives in `src/zippercrew/static/office/`; it uses the existing Room/Run API and
SSE stream. No orchestration or backend permissions were changed.

## Classic view and advanced settings

The earlier interface is still available at http://127.0.0.1:8765. Its profile
management, model overrides, and detailed inspectors remain available:

Open http://127.0.0.1:8765. The Room is a clean, dollhouse-like studio with a
red rabbit Implementer, pale green paper Reviewer, and the refined Patchwork Cue
Human orchestrator. The approved Linked Studio, purposeful ambient routines, and
travelling protocol cards keep the crew readable and occupied between tasks. You are already in the room:

1. Click the **Implementer** and **Reviewer** stations to choose saved assistant
   profiles, or **Create a profile**. Each seat has its own persistent conversation.
2. Click the shared board to enter your repository path and task.
3. Click **Human** to choose your involvement and maximum rounds.
4. Press **Start working**. The same room becomes live; select any participant
   to inspect their conversation. Human decisions appear beside the room.
   Waiting agents walk away with coffee;
   proposals travel between workstations as the process advances.

Name your Room in the header. Setup changes save automatically. **Run again** keeps
its crew, workspace and process settings, then opens the brief for editing before
starting a fresh execution. Every Run starts fresh assistant sessions; sessions
continue across rounds within that Run. **⋯ → Run history** opens earlier Runs
read-only, without replacing their traces. **⋯ → Delete room** asks for confirmation
and deletes only ZipperCrew records, never the source repository or shared profiles.

**Settings** contains profile management and Full/Reduced animation; **Rooms** reopens
configured Rooms. The inspector stays beside the scene on desktop and moves below it
on narrow screens. **Result** reopens the final outcome.
Profiles are saved by default
in `~/.config/zippercrew/zippergen.toml`, outside your source repositories. If
`XDG_CONFIG_HOME` is set, they live in `$XDG_CONFIG_HOME/zippercrew/zippergen.toml`.
They remain ordinary ZipperGen configurations, also editable with
`zg assistant configure` from that directory. To reuse an existing project's
profiles, choose its **Profile directory** in Settings or pass `--project PATH`.
Settings shows the exact file where new profiles will be saved.
The two roles can use the same profile and still have separate conversations.

Decide every round corresponds to `full`; Brief me every round to
`brief`; Autonomous review to `auto`. Ship it completes the process without
committing or pushing. Another round sends the entire review back, then asks
for optional guidance. Abandon and Stop leave existing edits in the workspace.

Click any participant to see their state, current activity and protocol conversation
grouped by round. The latest round is open; full messages and formatted reviews
expand on demand. Profile, workspace and deduplicated local activity live in
secondary sections. **Handoffs** inspects real message envelopes and payload previews;
download the full JSONL trace for complete information. Calm ambient behaviour
makes waiting participants feel alive and yields immediately to real work.
Short bubbles describe observable local activity; travelling cards represent
actual protocol messages. An optional ZipperGen CLI progress observer supplies live tool/file/test activity
for bubbles and the participant inspector. Update the sibling ZipperGen checkout
to include that hook; older checkouts retain action-start bubbles. Unknown commands get a general shell
label. Bubbles never expose reasoning, invent thoughts, or infer state from silence.

CLI/model failures appear in the Room with their error. Compatibility checks
verify safety flags, not authentication. Profiles select Codex or Claude and
optionally pin an exact model ID and reasoning effort. A participant's setup inspector
can override those settings for that Room without changing the shared profile.
Blank **Model** / **Effort** fields use the profile's value, or the CLI default if
unconfigured. These are exact native identifiers, not a hard-coded model catalog;
the CLI validates availability. ZipperGen applies them on every turn, including
resumed sessions. Unsupported adapter settings are hidden.
Claude Reviewers have no Bash tool to preserve the read-only boundary. Codex
Reviewers can run verification commands within the CLI's read-only sandbox.

## Development

The Room uses Phaser 3.90 with locally packaged illustrated PNG atlases. Canvas
rendering works without WebGL. The surrounding UI is plain JavaScript and CSS.
`uv sync` is sufficient; no npm install, frontend build, CDN or asset service is
required. See the [scene contract](docs/room-experience.md) and
[current production captures](docs/art/linked-studio-production-2026-10-06/index.html).

```sh
uv run pytest -m 'not browser'
uv run ruff check .
uv run mypy src/zippercrew
uv run playwright install chromium
uv run pytest -m browser
```

For a deterministic walkthrough without a CLI/model:

```sh
uv run zippercrew --demo --port 8766
```

Demo mode is visibly labelled, runs the real ZipperGen process with scripted
assistant turns, and never edits workspace files. Normal mode never substitutes
a fake assistant. Integration tests also exercise the real native backend with
fake CLI subprocess results to verify session resumption and permission flags.

Room configuration lives in `.zippercrew/catalog/`; Run journals remain in
`.zippercrew/rooms/` for compatibility with existing history. By default, both are
relative to the launch directory; use `--data-dir PATH` to
change it. They contain tasks, prompts, outputs, and paths: keep them private.
History and transcripts survive a restart. Interrupted executions are stopped,
not automatically retried; restart/resume of a live process is outside v0.1.
Closing a browser does not stop a Run; Stop run or Ctrl-C in the service does.
Existing execution folders are adopted as named Rooms on first launch, without
moving or rewriting completed traces.

The local service binds to `127.0.0.1` only. Do not expose it through a public
proxy. No remote, account system, database, or cloud service is configured.

See [architecture](docs/architecture.md) for the runtime boundary and upstream
gaps, [room experience](docs/room-experience.md) for the scene/state mapping, and
[process specification](docs/specification.md) for the protocol.
The existing ZipperGen Telegram deployment path remains available in ZipperGen;
this browser version does not mirror local tasks into Telegram yet.
