# v0.1 verification

Verified locally on 2026-10-04 with Python 3.12 and the editable ZipperGen checkout
at `b712745a4d2dc5767c3e525e52fffc4e03f6fc9b`.

* 24 tests pass, including a real Chromium browser walkthrough. Coverage includes
  full/brief/automatic modes, ship/abandon, round limits, invalid review headers,
  optional guidance with the complete review, SSE reconnect, stale/concurrent
  responses, workspace exclusion, CLI failure, service-pipe closure, and history.
* The native ZipperGen backend is exercised with fake Codex and Claude subprocess
  responses. Tests verify distinct conversation IDs and exact resume IDs across
  two rounds, workspace paths, write/read-only flags, and Claude's read-only
  tool allowlist. Fakes write/read a fixture file through the selected workspace.
* Ruff and mypy pass. Browser JavaScript executes without page errors; the mobile
  Room has no horizontal overflow. Desktop and mobile screenshots were inspected.
* Upstream `zg validate`, the communication view, full process view, and all three
  participant projections were inspected. The upstream shell warnings explain
  why this adapter disables Bash for a Claude Reviewer.

A separate live test used the actual installed Codex CLI for both roles against
a disposable Git repository. The task fixed `add(a, b)` from subtraction to
addition and added a negative-input test. After the first real review, the
browser HTTP endpoint answered Another round, then supplied guidance to add a
zero-input case. The same role backends performed round two. Reviewer returned
APPROVE, Human answered Ship it, and the Room completed. The resulting positive,
negative, and zero tests all passed when run independently with `unittest`.

This verifies real workspace edits plus the complete two-round local path. A
live Claude model run and Telegram/browser shared delivery were not exercised.
The latter is deliberately outside this local transport; see architecture notes.

Reproduce deterministic checks with the README commands. The live test uses
authenticated external assistants and is intentionally not part of default tests.
