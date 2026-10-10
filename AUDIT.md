# ZipperCrew pre-testing audit

| | |
| --- | --- |
| Audited commit | `zippercrew` 510cbf3 (main, matches origin) · `zippergen` 53a9074 (main, matches origin) |
| Date | 2026-10-10 |
| OS | macOS 26.6.2 (25G83), x86_64 |
| Toolchain | uv 0.12.15 · Python 3.12.8 (uv-managed) · zippergen 0.1.0a5 (editable sibling) · pytest 9.1.1 · ruff 0.16.10 · mypy 2.4.0 · playwright 1.63.0 (Chromium build 1243) |
| CLIs present | codex-cli 0.162.0, Claude Code 2.1.296. Only `--help` was invoked. **No model calls were made.** |

## 1. Readiness

**Ready for private testing after three small fixes:** ZC-01, ZC-02 and ZC-04.
The README install path works from a clean clone. The workflow logic held under a
controlled CLI backend, including session continuity, reviewer independence,
final-assessment aggregation and full feedback in the next round. Pause, Resume,
Stop and crash cleanup work at the process level. Duplicate and stale decisions are
rejected.

The main unknowns are about real-model behavior, which this audit did not exercise
(see §5). That includes how often reviewers break the header format (ZC-03) and
whether a Claude Worker can run shell commands (ZC-07). Testers should be told
that Claude-backed roles are less proven than Codex.

## 2. Most important findings (by impact)

| ID | Sev. | Type | Summary |
| --- | --- | --- | --- |
| ZC-01 | Medium | Confirmed | At the round limit, the only visible decision button is disabled. Ship it / Abandon are hidden behind "Other choices". |
| ZC-02 | Medium | Confirmed | A failed task save still shows the new task on the whiteboard with "Ready to start". No error is visible once the editor closes. |
| ZC-03 | Medium | Confirmed behavior, unverified frequency | Review (single reviewer) has no format repair. A `**APPROVE**` header produces no recommendation, and the reason line becomes a format complaint. Double review repairs the format, but rejects fenced JSON. |
| ZC-04 | Medium | Confirmed | The browser suite fails at HEAD: 1 of 57 tests, deterministic. `setMood()` does not retexture the mascot. |
| ZC-05 | Medium | Confirmed | Keyboard users cannot open agents or the whiteboard from the room. Status changes such as "Your decision" are not announced. |
| ZC-06 | Low–Med | Confirmed | Day-mode muted text measures 3.87:1 against the panel, below WCAG AA 4.5:1 for 11–13 px text. |
| ZC-07 | Medium | Plausible risk | For Claude roles, reads are not confined to the repository. The Claude Worker's shell use under headless `acceptEdits` is unverified. |
| ZC-08 | Low | Confirmed | An invalid option in one room blocks switching rooms. The error appears under the heading "Connection". |
| ZC-09 | Low | Confirmed | The session and permission regression tests cover only the non-streaming CLI path. Production uses the streaming path. |

Lower-priority items (ZC-10 to ZC-14) are in §3.

## 3. Detailed findings

### ZC-01 · Medium · Human decisions: round-limit decision has no usable primary action

- **Impact:** On the final round, when the recommendation is "Another round", the
  user sees one disabled primary button. The workflow's normal endings are hidden.
  This happens on every final round of Review or Double review where a reviewer
  objects. It contradicts the "single panel, one-click action" intent.
- **Reproduce:** Run the demo with Double review and Advanced → Maximum rounds = 1.
  Run, then open the decision. The panel shows "The reviewers disagree", a
  **disabled** "Run next round", an "Other choices" disclosure, and "The round limit
  is reached. Finish or abandon this run." The disclosure is still labelled "Why
  another round?".
- **Code:** `src/zippercrew/static/office/decisions.js:68` picks the recommended
  choice as primary. Line 72 then disables it at the limit. Line 105 sets the
  disclosure label.
- **Expected:** At the limit, the primary action is an enabled terminal choice
  (Ship it / Done, or Abandon), and "Another round" is not offered.
  **Actual:** The primary action is disabled.
- **Fix direction:** When `limit` is true, drop "Another round" from `choices` before
  choosing the primary. Use a neutral primary such as Ship it, and keep the
  reviewers' objection visible in the reason text.
- **Verify:** Extend `tests/test_office_decisions_browser.py`: with max_rounds=1 and a
  REVISE review, assert the primary button is enabled and is not "Run next round".

### ZC-02 · Medium · State: unsaved task shown as ready

- **Impact:** If a save fails (server stopped, disk error, 4xx), the whiteboard and
  top bar show the new task as set, and Play is enabled. The only error text lives
  in the editor, which closes. The `beforeunload` prompt is the only warning before
  the edit is lost.
- **Reproduce (verified):** In the demo, intercept `POST /api/rooms/*/save` with a 500
  response. Edit the task, wait until the editor shows "Not saved — …", then close
  the panel. Results:
  - The board shows "UNSAVED TASK TITLE".
  - The status reads "Ready to start" and Play is enabled.
  - No `[role=alert]` is visible, and the server copy of the brief is `''`.

  Screenshot was taken during the audit.
- **Code:** `task-drafts.js:22` writes `session.room.brief` optimistically, before the
  save. `flushAll()` (lines 11 and 25) swallows errors on close.
  `configuration.js:243` (`launch`) does flush first. So Play saves before running,
  which limits the harm to lost edits and false status.
- **Expected:** An unsaved or failed task is visibly marked outside the editor, for
  example on the board footer or the status line. **Actual:** It looks saved.
- **Fix direction:** Derive the board and status from the saved brief plus the draft
  state, not from the optimistic value. When a draft has `error`, show "Task not
  saved" in `#scene-state` and on the board, with Retry.
- **Verify:** A browser test that routes the save to a 500 and closes the editor. It
  should assert a visible "not saved" state outside the dialog, and assert it clears
  after a successful retry.

### ZC-03 · Medium · Workflow: malformed reviewer headers

- **Impact:** LLMs commonly bold or decorate the first line. With the **Review**
  workflow, such a review yields no recommendation, and the reason line becomes
  "The reviewer's first line was not APPROVE or REVISE." That hides the reviewer's
  actual reason unless the `<decision-summary>` block supplies one. In auto mode the
  same review counts as REVISE and spends another round. This fails safe but wastes
  usage.
  **Double review** has a format-repair turn, but it accepts only bare JSON. A
  repair answer wrapped in fenced JSON is discarded, and the verdict stays
  unconfirmed.
- **Reproduce (fake CLI on PATH, real server):**
  - Review workflow, reviewer output `**APPROVE**\nFINDINGS: 0\nAll good.` gives
    `recommendation: None`, `reason: "The reviewer's first line was not APPROVE or
    REVISE."` and zero `assistant.review_format` events.
  - Double review, final critical review `**APPROVE**…`, with repair reply
    `` ```json\n{"verdict":"APPROVE","findings":0}\n``` `` gives `repaired: False`
    and "One reviewer's recommendation could not be confirmed".
  - The same repair reply as bare JSON gives Ship it.
- **Code:** `adapter.py:170-175` limits repair to `double_review`. `adapter.py:191-200`
  does a strict `json.loads(raw)`. The upstream parser is
  `zippergen/examples/pair_programming.py:203-219`. `decisions.py:53-58` copies the
  complaint into `reason`.
- **Expected:** Both reviewed workflows treat format errors the same way. A repair
  that carries a valid verdict is accepted. **Actual:** Behavior differs by workflow,
  and fenced JSON is rejected.
- **Fix direction:**
  - Apply the bounded repair turn to the Review reviewer too, keyed on
    `review_fields(report)["verdict"] is None`.
  - Strip a single surrounding code fence before `json.loads`.
  - When the header is invalid but `<decision-summary>` has a reason, keep that
    reason and show the format problem separately. Double review already does this
    through `format_issue`.
- **Verify:** Unit tests for the fenced repair and the Review repair path. Then, with
  permission, one real-model run per backend to measure how often headers are
  malformed.

### ZC-04 · Medium · Tests: browser suite is red at HEAD

- **Impact:** `pytest -m browser` exits 1, so a "tests pass" claim cannot be trusted
  as is. The product defect is minor: the mascot keeps its day texture until the
  next frame.
- **Reproduce:**
  `uv run pytest -q tests/test_office_mascot_browser.py` fails at line 84
  (`studio.mascot.sprite.texture.key.startsWith('night:')`) in 2 of 2 reruns. The
  test stops the game loop (line 29), and `setMood` never updates the mascot.
- **Code:** `static/office/app.js:145-165` (`setMood` loops over `this.people` only).
  The mascot texture is set only in `mascot.js:82`.
- **Fix direction:** In `setMood`, also call
  `this.mascot?.sprite.setTexture(this.lighting.characterKey(this.mascot), frame)`.
- **Verify:** Run the full browser suite and expect 57 of 57.

### ZC-05 · Medium · Accessibility: room objects are mouse-only; no live status

- **Impact:** A keyboard or screen-reader tester cannot follow the documented first
  task ("click each AI agent", "click the whiteboard").
- **Evidence:**
  - Tab order is game canvas → room header → day/night → menu → zoom, then wraps.
  - Enter or Space on the focused `#game` opens nothing.
  - `#scene-state` has no `aria-live` ancestor, so "Your decision" is never
    announced.
  - Indirect paths exist. Agents: room header → Team → role name. Task: agent card →
    "Current focus". Neither is documented.
- **Code:** `index.html:35`. `app.js:88` handles only arrow keys. Selection happens
  only through pointer handlers (`app.js:48,66`).
- **Fix direction (keeps the room as the interface):**
  - Make Enter/Space on `#game` act on the nearest object to the Human: the agent,
    the whiteboard, or the Human when a decision is pending.
  - Optionally add Tab-reachable invisible hotspots over agents and the board.
  - Put `aria-live="polite"` on `#scene-state`.
- **Verify:** A keyboard-only Playwright walkthrough of the README first-task path,
  and an assertion that the live region text changes when a decision appears.

### ZC-06 · Low–Medium · Accessibility: day-mode muted text contrast

- **Evidence:** The computed `--muted` color `#7c8184` on `#fdfdfb` gives 3.87:1.
  It is used for field help, the "Advanced" and "How this workflow works"
  summaries, "Delete room", the panel kicker and the "Your decision" status, at
  11–13.2 px. The "Setup needed" status `#a16961` gives 4.38:1. Night mode passes
  (5.3:1).
- **Code:** `static/office/style.css:1` (`--muted`) and the `.room-status` colors in
  `session.css:103`.
- **Fix:** Darken day `--muted` to about `#6b7073`, which gives ≥4.5:1. Re-run the
  contrast probe.

### ZC-07 · Medium · Permissions: Claude role boundaries (plausible, unverified)

- **Enforced and verified** (fake Codex, command line inspected):
  - The Codex Worker gets `--sandbox workspace-write` with network disabled.
  - Codex reviewers get `--sandbox read-only`.
  - User config and MCP are ignored, and API keys are stripped from the environment.
- **Enforced by flags, not exercised:** Claude reviewers get `--permission-mode plan`
  with tools `Read,Glob,Grep`.
- **Not enforced:** Claude's file tools are not confined to the repository. Upstream
  `_claude_command` (`zippergen/src/zippergen/assistant_backends.py:145-185`) does
  not pass `--restricted`. Per `claude --help`, that flag "confines the file tools to
  the working directories". A Claude reviewer or Worker can therefore read files
  such as `~/.ssh` or other repositories, and that content may be sent to the
  provider. The README promises only read-only access, not confinement, but testers
  will likely assume confinement.
- **Unverified:** The Claude Worker runs headless (`--print`) with `acceptEdits`, and
  no `--allowedTools` is passed for Bash. Bash calls may be denied, which would
  contradict the README line "The Worker can … run local commands". This needs one
  real Claude run to settle.
- **Instruction-only:**
  - "Do not commit/push/deploy" is enforced by nothing for a Claude Worker with Bash.
  - For Codex, the network-disabled sandbox prevents a push.
- **Fix direction:**
  - Evaluate `--restricted` (plus `--add-dir` if needed) for Claude roles upstream.
  - State plainly in the README: Claude roles can read outside the repository, and
    the Worker's no-commit rule is an instruction.
- **Verify:** With the user's permission, one cheap Claude run (Worker and Reviewer)
  against a temporary repository. Check whether `Bash` succeeds, and whether a read
  of a file outside the repository is refused.

### ZC-08 · Low · State: invalid room option blocks room switching

- **Reproduce:**
  1. Open room B → Advanced and set Maximum rounds = 0. The panel shows "Not saved
     — Choose a round limit between 1 and 100."
  2. Close the panel, then choose Menu → Rooms → enter room A.
  3. The switch is refused. A dialog appears titled **"Connection / Something needs
     attention / Your files and saved rooms are unchanged"** with the validation
     message.
- **Code:** `session.js:169` awaits `options.flush()` before loading a room.
  `session.js:127` uses a generic "Connection" window for every error.
- **Fix direction:** Show draft validation errors in context, by reopening the room
  panel with the field highlighted. Let navigation proceed with the invalid draft
  discarded, after confirmation. Reserve the "Connection" title for network
  failures.
- **Verify:** A browser test that repeats the steps above.

### ZC-09 · Low · Test coverage: production CLI path lacks a regression test

- `tests/test_process.py:129-221` verifies session resume, model and effort flags,
  and the sandbox. It calls `assistant_backend(config)` with no `emit`, so upstream
  uses `subprocess.run`. Real runs pass `emit` (`worker.py:93`), and that path goes
  through `on_progress`, using streaming `Popen` (`zippergen/assistant_progress.py:248`).
  The streaming path has only fake-factory tests (`tests/test_activity.py`).
- This audit verified the streaming path manually with a fake `codex` on `PATH`
  (§4). A future upstream change could break it without any test failing.
- **Fix:** Add a test that puts a small fake CLI script on `PATH`, like the one used
  here, and runs `worker.execute` with `emit`. Assert resume IDs per role, a fresh
  run for new sessions, sandbox flags, and full review text in the round-2 prompt.

### ZC-10 · Low · Process: detached CLI descendants survive Stop (plausible)

- Stop and crash cleanup signal only the worker's process group (`rooms.py:337-357`,
  `worker.py:113`). With the fake CLI:
  - An ordinary child (`sleep 300`) was stopped by Pause, resumed, and killed by
    Stop.
  - A child started in a new session (`sleep 301`) survived Stop. That second case
    is synthetic. Whether Codex or Claude detach tool processes is unverified.
- **Fix direction:** If real CLIs do detach, track descendants by session or job,
  or document the limitation. **Verify** during one real run by listing processes
  after Stop.

### ZC-11 · Low · Copy and docs drift

- **History shows terminal commands:** Review run outcomes come from the upstream
  example. History shows them verbatim, including "Full proposals and reviews: zg
  run trace --tail 40 --json" (`zippergen/examples/pair_programming.py:346-349`,
  rendered at `configuration.js:300`). Only the old `/` interface rewrites this
  (`static/app.js:37`).
- **Restart message:** "History retained; use Run again to continue"
  (`rooms.py:386-387`) suggests resumption, but Play starts a fresh run.
- **Night mode is not remembered:** It is stored only in the `?mood=` URL parameter
  (`app.js:164`). The README URL always opens in day mode, although
  `/api/preferences` supports `appearance`.
- **Stale docs:** `docs/verification.md` and parts of `docs/architecture.md` describe
  the old `/` UI and test counts ("37 tests", "58 tests"), and point to "README
  commands" for checks. The README has no test commands.
- **Formatting:** `ruff format --check src tests` flags `tests/test_dollhouse.py:177`.
  `ruff check .` reports 19 errors, all under `spikes/`.

### ZC-12 · Low · Direct: "Run next round" without a note gives the Worker nothing new

- In Direct, an empty note produces `guidance: ''` in round 2 (verified in the
  prompt). The Worker is told to "apply the supplied guidance" with none.
  `decisions.js:94` labels the note "Optional".
- **Fix:** In Direct, require a note for another round, or send an explicit "The
  human requested another attempt without further guidance."

### ZC-13 · Low · Note discarded at the round limit (API only)

- The UI disables "Another round" at the limit, but the API accepts it with a note.
  The run ends with "Round limit reached", and the note is recorded but never
  delivered (`worker.py:71-75`). Reject notes at the limit in `Run.respond`.

### ZC-14 · Optional · Responsiveness

- **Global lock during start:** `POST /api/rooms/<id>/runs` holds the global
  `runs.lock` while running `check_cli_assistant` once per role (`server.py:321-326`,
  `350-360`). A concurrent `GET /api/rooms` waited 0.98 s with three Codex roles.
  Claude's `--help` is slower. Move the CLI checks outside the lock.
- **Large SSE payloads:** Every SSE event sends the full snapshot, including the full
  transcript with inputs (`state.py:162-170`). A short two-round fake Double review
  was 21.7 KB. Real reports, with guidance repeating all four reviews, will grow
  this per progress event. Measure during a real run before deciding.

## 4. Checks performed

**Install and static checks:** fresh HTTPS clones of both repositories into a
scratch directory, then `uv sync --locked`.

| Check | Result |
| --- | --- |
| `uv sync --locked` (clean clone) | OK in ~2 s. No frontend build needed, as the README says. |
| `ruff check src tests` / `ruff check .` | Pass / 19 errors, all under `spikes/` |
| `ruff format --check src tests` | 1 file: `tests/test_dollhouse.py` |
| `mypy src` | Pass (14 files) |
| `pytest -m "not browser"` | **100 passed** (76 s) |
| `pytest -m browser` | **56 passed, 1 failed** (ZC-04, deterministic on 2 reruns) |

**Demo instances:** `--demo`, isolated `--data-dir` and `XDG_CONFIG_HOME`, ports 8791
and 8794.

| Check | Result |
| --- | --- |
| README first-task path (headless Chromium, 1440×900) | New room → repository → task → Run → decision in 3.3 s. Setup hints and Play gating match the README. No page errors. |
| Failed save, invalid option, room switch | ZC-02, ZC-08 |
| Keyboard, contrast, night mode, 390×844 mobile | ZC-05, ZC-06, ZC-11. No horizontal overflow on mobile, and the room panel is usable. |
| Double review at the round limit, then History | ZC-01, ZC-11 |

**Fake `codex` CLI on `PATH`:** delegates `--help` to the real CLI and logs argv,
session and prompt for each call. No network or model use. Isolated server on port
8792.

| Check | Result |
| --- | --- |
| Review: REVISE, then next round with a note, APPROVE, Ship it | Worker and Reviewer each resume their own session, and the sessions are distinct. Round 2 prompt contains the full review and the note. The second run used fresh sessions with no `resume`. |
| Double review | Initial reviews ran concurrently, and neither prompt contained the other review. Each response resumed its own session and saw the peer report. The human summary used the **final** assessments: initial APPROVE plus final REVISE gave "Both reviewers request changes". Round 2 guidance contained all four reports and the note. |
| Auto mode | Disagreement continued to "Round limit reached". A malformed final with a failed repair did not ship. |
| Malformed headers | ZC-03 |
| Direct | Done / Another round / Abandon. Empty-note guidance (ZC-12). |
| Pause, Resume, Stop (`ps` inspected) | Pause put the CLI and its child in state `T`. Pausing twice is a no-op. Answers and room edits during pause returned 409. Resume returned them to `S`. Stop while paused took 0.08 s, killed the group, kept file edits and recorded history. Detached child: ZC-10. |
| Server SIGKILL during a run, and while paused | The worker group and pause guard were gone within 4 s. After restart both runs showed `stopped`, "Service interrupted…". |
| Concurrency | 3 parallel starts → 1×201, 2×409. 6 parallel answers → 1×200, 5×409. A stale answer → 409. An overlapping workspace → 409. |
| Security | Deletion requires the exact name, removes only the run directories and keeps the workspace. Path traversal → 404. Wrong `Host` → 403. Cross-origin POST → 403. Run directories `0700`, profile TOML `0600`. |

## 5. Not tested, and why

- **Real Codex or Claude runs:** these are paid, and the brief requires asking first.
  They would settle ZC-03 frequency, ZC-07, ZC-10 and ZC-14, plus real login
  failures. Demo and fake results say nothing about real-model reliability.
- **Claude-backed roles end to end:** only the command-line flags were reviewed.
- **Linux:** only macOS was available.
- **Browsers other than Chromium; screen readers:** not available headless.
- **Private-repository access for testers:** my clone succeeded with this machine's
  credentials, which does not show what a new tester will see.
- **Long multi-hour runs, browser offline/online events, two tabs racing a
  decision:** the decision race was covered at the API level only.
- **The user's running instance (port 8765) and its rooms:** deliberately untouched.

## 6. Handover for the implementation agent (in order)

1. **ZC-04:** update the mascot in `setMood` and get the browser suite green.
2. **ZC-01:** at the round limit, remove "Another round" and choose an enabled
   terminal primary action. Add a browser test.
3. **ZC-02:** show unsaved or failed task state outside the editor. Add a browser test
   with a forced 500.
4. **ZC-03:** run the repair turn for Review too, accept fenced JSON, and keep the
   reviewer's reason when the header is malformed. Add unit tests.
5. **ZC-05 and ZC-06:** Enter/Space on the room acts on the nearest object, add an
   `aria-live` status, and darken `--muted`.
6. **ZC-09:** add a fake-CLI-on-PATH integration test for the streaming path.
7. **ZC-07:** decide upstream about Claude `--restricted`, then correct the README's
   permission wording. Ask before the one real Claude verification run.
8. **ZC-08 and ZC-10 to ZC-13:** copy, docs and small guards, as time allows.
