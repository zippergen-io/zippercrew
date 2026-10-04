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
