# ZipperCrew

Assemble two CLI coding agents, give them a task, and watch their communication
process in a character-driven 2.5D café. The Implementer edits your repository; an
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

Open http://127.0.0.1:8765. You are already in the room:

1. Click the **Implementer** and **Reviewer** stations to choose saved assistant
   profiles, or **Create a profile**. Each seat has its own persistent conversation.
2. Click the shared board to enter your repository path and task.
3. Click **Human** to choose your involvement and maximum rounds.
4. Press **Start working**. The same room becomes live; select any participant
   to inspect their conversation. Human decisions appear beside the room.
   Waiting agents walk away with coffee;
   proposals travel between workstations as the process advances.

**Settings** contains profile management and Full/Reduced room animation; **Rooms** reopens previous executions.
**Result** reopens the final outcome. Escape closes an inspector.
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

Click any participant to inspect their state, role, profile, action inputs and
outputs. **Handoffs** inspects real message envelopes and payload previews;
download the full JSONL trace for complete information. Calm ambient behaviour
makes waiting participants feel alive and yields immediately to real work.
Short bubbles describe observable local activity; travelling cards represent
actual protocol messages. An optional ZipperGen CLI progress observer supplies live tool/file/test activity
for bubbles and the participant inspector. Update the sibling ZipperGen checkout
to include that hook; older checkouts retain action-start bubbles. Unknown commands get a general shell
label. Bubbles never expose reasoning, invent thoughts, or infer state from silence.

CLI/model failures appear in the Room with their error. Compatibility checks
verify safety flags, not authentication. Profiles select Codex or Claude and
optionally pin an exact model ID and reasoning effort. Create separate profiles
to use different pins for each role. ZipperGen applies them on every turn,
including resumed sessions; empty fields use the CLI defaults.
Claude Reviewers have no Bash tool to preserve the read-only boundary. Codex
Reviewers can run verification commands within the CLI's read-only sandbox.

## Development

The room uses Phaser Canvas with locally packaged café and character assets.
The surrounding UI is plain JavaScript and CSS. `uv sync` is sufficient; no npm
install, frontend build, or external asset service is required. See the
[scene notes](docs/room-experience.md) for the isolated visual preview.

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

Room journals live in `.zippercrew/rooms/` by default; use `--data-dir PATH` to
change it. They contain tasks, prompts, outputs, and paths: keep them private.
History and transcripts survive a restart. Interrupted executions are stopped,
not automatically retried; restart/resume of a live process is outside v0.1.
Closing a browser does not stop a Room; Stop or Ctrl-C in the service does.

The local service binds to `127.0.0.1` only. Do not expose it through a public
proxy. No remote, account system, database, or cloud service is configured.

See [architecture](docs/architecture.md) for the runtime boundary and upstream
gaps, [room experience](docs/room-experience.md) for the scene/state mapping, and
[process specification](docs/specification.md) for the protocol.
The existing ZipperGen Telegram deployment path remains available in ZipperGen;
this browser version does not mirror local tasks into Telegram yet.
