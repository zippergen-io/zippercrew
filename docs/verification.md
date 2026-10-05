# v0.1 verification

Verified locally on 2026-10-04 with Python 3.12 and the editable sibling ZipperGen
checkout, including its model and reasoning-effort profile support.

* 37 tests pass, including eight Chromium browser cases. Coverage includes
  full/brief/automatic modes, ship/abandon, round limits, invalid review headers,
  optional guidance with the complete review, SSE reconnect, stale/concurrent
  responses, workspace exclusion, CLI failure, service-pipe closure, and history.
* The native ZipperGen backend is exercised with fake Codex and Claude subprocess
  responses. Tests verify distinct conversation IDs and exact resume IDs across
  two rounds, workspace paths, write/read-only flags, Claude's read-only
  tool allowlist, and distinct per-role model/effort pins on every invocation.
  Fakes write/read a fixture file through the selected workspace.
* Ruff and mypy pass. Browser JavaScript executes without page errors; the mobile
  Room has no horizontal overflow. Desktop and mobile screenshots were inspected.
* Browser tests configure empty seats and the shared brief, verify the same Phaser canvas
  survives execution, observe working/reviewing/human states, request another
  round with guidance, inspect transcripts, reload a pending decision, ship, and
  reopen history. Separate cases exercise upstream profile creation with pins,
  autonomous completion with normal and reduced motion, and stopping at a laptop
  viewport. Scene assertions verify separate typing/reading/coffee poses,
  waiting-position changes, deduplicated proposal transfers and continued access
  to results. Additional cases verify direct canvas selection, keyboard/inspector
  input isolation, missing-asset errors, live motion-preference changes, and
  canceling document effects when switching rooms. The canvas and camera expand
  after closing the inspector. Setup, working, review, Human-attention and
  completion screenshots were inspected against the previous SVG room.
* Upstream `zg validate`, the communication view, full process view, and all three
  participant projections were inspected. The upstream shell warnings explain
  why this adapter disables Bash for a Claude Reviewer.

A separate live Chromium test used the actual installed Codex CLI for both roles
against a disposable Git repository. From the Phaser room it bound both
profiles, configured the task/workspace, and pressed Start working. The profile
pinned high reasoning effort; model selection used the CLI default. The task
fixed `add(a, b)` from subtraction to addition and added a negative-input test.
After the first real review, the browser clicked Another round, then supplied
guidance to add a zero-input case. The same role backends performed round two.
Reviewer returned APPROVE, Human clicked Ship it, and the Room completed. The
same Phaser canvas element remained mounted throughout. The resulting positive,
negative, and zero tests all passed when run independently with `unittest`.

This verifies real workspace edits plus the complete two-round local path. A
live Claude model run and Telegram/browser shared delivery were not exercised.
The latter is deliberately outside this local transport; see architecture notes.

Reproduce deterministic checks with the README commands. The live test uses
authenticated external assistants and is intentionally not part of default tests.

## Persistent Rooms and focused desktop layout — 2026-10-05

The refinement suite passes **58 tests**. Ruff, mypy, JavaScript syntax checks and
an offline wheel/source build pass. The wheel includes the Room catalog, the
corrected workstation atlas and the canonical ZipperGen SVG; the SVG is byte-for-byte
identical to both the upstream project asset and website favicon.

New coverage exercises named setup persistence, rename, a second Run in the same
Room, distinct worker processes, independent traces, restart/replay, read-only Run
history, confirmation and active-run rejection for deletion, and retention of a
source-workspace sentinel file. Legacy adoption is tested twice for idempotence
and unchanged journal bytes. Native Codex/Claude command tests now resolve actual
Room overrides through upstream profile settings, verify model/effort flags on
initial/resumed turns, confirm shared profiles are unchanged, and start a second
execution with fresh session IDs.

Chromium checks the permanent non-overlapping inspector and visible/clickable
bottom controls at 1024×600, 1280×720, 1366×768, 1440×900 and 1536×864, plus no
horizontal overflow at 390×844. The same canvas survives two-round execution and
Run again. Screenshots of setup, working, reviewing, Human attention, completion
and the desktop layout were inspected. The corrected monitor backs face the viewer;
the characters use the clear working side of their stations.

The three existing ANR-GLOVE journals were hashed before migration and after
read-only inspection: all remain identical. The actual two-round Reviewer view
shows Completed review, Round 2 of 4, Claude/read-only, REVISE with 2 findings,
proposal/review cards and readable expanded Markdown, with no browser errors.
This refinement did not launch another paid CLI task against ANR-GLOVE. New-run
browser validation uses the real ZipperGen process with scripted participants;
native assistant invocation assertions use controlled subprocess responses.

## Workstations, surfaces, autosave and observable results (2026-10-05)

- Full ZipperCrew suite: 58 passed initially; two browser checks required updating
  the obsolete save-indicator assertion and allowing a two-round scripted run to
  finish under workstation load. Both passed on rerun. Two additional browser
  tests cover persistence failure/retry and all-persona lighting.
- The final affected browser group (autosave, lighting, rerun/history, progress
  detail, profile pins) passed all five tests. The real ZipperGen Pair Programming
  process still runs with deterministic test participants; no paid model execution
  or changes to the ANR source workspace were needed for this presentation pass.
- Upstream assistant progress/session/model tests: 51 passed. Result snippets are
  derived from observed structured tool events. A separate trace-only output event
  retains available command results without making conversation cards.
- Ruff and mypy passed for ZipperCrew, and changed JavaScript modules passed Node
  syntax checks. Upstream progress tests passed; its broad Ruff configuration still
  reports pre-existing broad-exception warnings in the observer/pipe-reader code.
- Browser lighting acceptance walks **each** Human, Implementer and Reviewer past a
  desk, behind the coffee counter, across window shadow, and into unobstructed light.
  It inspects opaque sprite pixels in idle, walking and seated poses: shadowed
  regions contain both lit and dark pixels, while the clear region has no received
  dark pixels. It checks moving contact/cast shadows and counter depth ordering.
  Screenshots are captured per persona/region in pytest's temporary output.
- Ambient coffee actions for every role are interrupted by Working / Reviewing /
  Needs human. Reduced motion cancels travel. Activity detail is displayed below
  the main line and does not create or acknowledge protocol messages.
- Reviewed the full-scene workstation frame in `/tmp/zippercrew-surfaces/` and
  checked chalk alignment, seated tablet/keyboard height, chair facing and shadow
  softness. Lighting is an authored 2.5D approximation, not physical ray tracing.

## Responsive shell refinement (2026-10-05)

Measured the rendered shell before changing CSS. Setup fitted normal laptop sizes
in this checkout; the risky rules were document `overflow:hidden`, accumulated
floating-sidebar offsets, and the narrow-screen sticky dock overlapping the
inspector. Replaced these with one explicit fluid grid and a document-scroll escape
for very short viewports.

The browser acceptance uses a real Pair Programming process with scripted agents.
It checks setup, Human decision, completion and Run again at 1440×900, 1366×768,
1280×720, 1200×650 and 1000×600. It also resizes repeatedly through 1920×900,
2560×900, 1000×320, 800×500, 800×300 and 390×600. Assertions cover:

- full footer bounds and actual primary-button hit targets;
- no horizontal page overflow or workspace/footer overlap;
- right inspector edge at the available desktop edge, bounded inspector width,
  and increasing Room width on wider windows;
- canvas backing dimensions matching its current host, same canvas across runs,
  and canvas participant selection matching the DOM target after each resize;
- Ship it / Another round / Abandon reachable inside the scrolling inspector;
- result, shared brief and Run again reachable after completion;
- vertical document scrolling rather than clipping at exceptionally short sizes.

Both responsive browser checks passed (including the full lifecycle/resize matrix).
Screenshots and final measurements are in `/tmp/zippercrew-layout/`.
