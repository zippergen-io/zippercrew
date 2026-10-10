# Cooperative Pause audit

**Verdict: ready for private testing.** Fix CP-01 before testers use it if possible. It is a small server-side change. Otherwise, list CP-01 as a known issue.

The core of the change works as specified, and these held up under real server and worker processes and randomized races:

- admission control
- draining of calls already in flight
- session continuity
- Stop
- server loss
- restart
- compatibility with the old transport

The one confirmed defect concerns what the user sees at a natural boundary. No pause-related state was lost or corrupted.

## Scope and environment

| Item | Value |
| --- | --- |
| Audited code | `654d833` plus the uncommitted working-tree diff (19 modified files and the new `tests/test_cooperative_pause.py`) |
| ZipperGen | `53a9074` (0.1.0a5), sibling checkout |
| OS | macOS 26.6.2 (Darwin 25.6.0), x86_64 |
| Python / Playwright | 3.12.8 / 1.63.0, Chromium |
| Codex CLI on the machine | 0.162.0. Used only for `--help`; no model calls |
| Isolation | Clones in the scratchpad: `new/` (HEAD plus the working-tree patch) and `old/` (HEAD). Separate data directories, `XDG_CONFIG_HOME`, temporary workspaces, and ports 8801–8803. The server on port 8765 and real rooms were not touched. |

**Fake CLI.** A file-controlled fake `codex` was placed first on `PATH`. For each call it:

- logs the argv, session, PID, process group and prompt;
- starts an ordinary heartbeat child and, optionally, a detached one (`start_new_session`);
- blocks until a release file appears, then returns the controlled output, or `FAIL`.

No paid model calls were made.

## Confirmed findings

### CP-01: A pending pause shows "Paused" before a natural decision, completion or failure (Medium, confirmed)

**Impact.** The brief requires that a natural Human decision, completion or failure takes precedence over a pending pause. Instead:

- The server records and broadcasts `paused` first, then the natural outcome.
- The browser shows "Paused" and the Human says "RUN PAUSED. RESUME WHEN READY." That bubble stays for 3 seconds on top of the waiting decision.
- In Double review, the switch to paused cancels the couriers carrying the two final reviews. They never reach You. Delivering them is the behaviour this same diff adds in `handoffs.js:72-80`.
- The journal permanently records a pause that never held any call: `room.paused`, then `room.resumed` (reason "Human decision ready"), or `room.paused`, then `room.completed` or `room.failed`.

**Reproduction.**
1. Start a Review run with the fake CLI holding the Reviewer call.
2. Press Pause. The header shows "Pausing…".
3. Release the Reviewer call.

**Expected:** the run goes from Pausing… straight to Your decision. With `human_mode=auto` it goes straight to Completed, and when the CLI fails it goes straight to Failed.

**Actual:**

| Case | SSE status sequence | Journal after `room.pausing` |
| --- | --- | --- |
| Human decision | running → pausing → **paused** → Your decision | `room.paused`, `review.verdict`, `room.resumed`, `human.required` |
| Completion (auto) | running → pausing → **paused** → completed | `room.paused`, `review.verdict`, `room.completed` |
| Failure | running → pausing → **paused** → failed | `room.paused`, `room.failed` |
| Double review, pause during the final exchange | pausing → **paused** → Your decision | `room.paused`, `review.verdict`, `room.resumed`, `human.required` |

**Browser evidence.** Same flow, Chromium, events timed in milliseconds from the page hooks:

- **Review:** "Pausing…" at 1448 ms, "RUN PAUSED. RESUME WHEN READY." at 1492, header "Paused" at 1493, and a queued review courier cancelled. Header "Your decision" at 1500.
- **Double review without Pause:** both final reviews are delivered to You, and the Human says "BOTH REVIEWS READY. YOUR DECISION."
- **Double review with Pause:** 0 of 2 final reviews delivered. One second after the decision appears, the Human's bubble still reads "RUN PAUSED.\nRESUME WHEN READY.".
- Screenshot: `shots/b4-double-True.png` in the scratchpad.

**Cause.** `rooms.py:251-252` settles the pause as soon as the last admitted call finishes. That happens before the worker has shown what it will do next. A decision or end of run arrives afterwards, and `rooms.py:126-127` then reverses the pause. On the client, `session.js:240-242` treats any change to `paused` as real: it cancels handoffs and ambient animation and speaks the paused message.

The existing test `tests/test_cooperative_pause.py:165-179` checks only the final status, so it passes despite this.

**Suggested fix.** Settle to `paused` only when the worker is actually blocked at the gate:

- During `pausing`, with no active calls, record `room.paused` only if `waiting_calls` is non-empty, or when the next `assistant.call_requested` arrives.
- If `human.required` or a terminal event arrives first, go directly from `pausing` to that state. This removes the need for the synthetic `room.resumed`.
- `pause()` with no active calls and no waiting call can stay `pausing` until the worker's next request. At most that is the worker's start-up time.

**How to verify.**
- Extend `test_natural_boundary_takes_precedence_over_pause` to assert that no `room.paused` appears between `room.pausing` and `human.required`, `room.completed` or `room.failed`.
- Add a browser case to `test_office_coordination_browser.py`: pause during the Double review exchange, release both calls, and assert that 2 final deliveries complete and that no "RUN PAUSED" speech is shown.

### CP-02: Format-repair calls are recorded under the review action's name (Low, confirmed)

**Impact.** A format-clarification call appears in `assistant.call_requested`/`call_started` and in `active_calls` with the same action as the review it repairs, for example `Reviewer:respond_delivery`. Nothing in the history or the live state separates the extra call. A tester checking calls against the README ("including review-format clarifications") cannot tell them apart.

**Reproduction.**
1. In Double review, pause during the exchange.
2. Release `respond_delivery` with `**APPROVE**\nNo blocking problems found.`.

The journal shows two `call_requested(Reviewer:respond_delivery)` entries; the second is the repair.

**Reference.** `adapter.py:191-202`: `repair = replace(effective, …)` keeps `effective.name`, and the call is gated with `call_scope(role, repair.name)`.

**Suggested fix.** Pass a distinct label, such as `f"{action.name}:format"`, to `call_scope` for the repair call. The gate is unaffected.

**How to verify.** Run the existing `test_review_format_repair_also_waits_for_resume` and assert the waiting call's action label.

## Unverified risks

- **R1: Real providers (not tested).** Calls already in flight keep running, editing files and using quota while the header says "Pausing…". The README documents this. Not tested:
  - real Codex or Claude streaming under the gate;
  - session resume after a long pause, including any provider-side session expiry;
  - how long real calls keep the room in Pausing…

  The Claude backend goes through the same `adapter.invoke` gate, but no fake `claude` was run.
- **R2: Detached subprocesses (partly observed).**
  - A child started with `start_new_session` keeps running during Pausing, Paused and after Stop. The README documents this, and the fake confirmed it.
  - In a separate fake-CLI setup, a detached child that **inherited the CLI's stdout** kept that call active after the CLI exited, so the run stayed in "Pausing…" indefinitely. Stop still ended the run. This is not specific to Pause: the call would also hang without it.
  - Unverified whether real CLIs pass their own stdout to tool processes.
- **R3: Browser tabs open across a server upgrade (not tested).** Reading the code: an old `session.js` treats only `paused` as resumable. During `pausing` it disables Play, so the pause cannot be cancelled until a reload. It also leaves Pause enabled; pressing it is a harmless no-op. The server sends no cache headers, so a reload fetches the new code.
- **R4: Already-running older server (verified that it works).** A server started before the update keeps its in-memory transport. Workers spawned from the updated files see no `_cooperative_pause` flag and run without the gate, so its Pause still freezes processes with SIGSTOP. Meanwhile the README and the newly served UI describe cooperative pause. Tell testers to restart the server after updating.

## What was tested

| Area | Method | Result |
| --- | --- | --- |
| Existing tests | `uv run pytest -q -p no:cacheprovider tests` in the working tree | **189 passed** (704 s), browser tests included. `test_cooperative_pause.py` passed 3 further times in a row (13 each). `ruff check` and `ruff format --check` are clean. |
| Pause while a call is running (Review) | HTTP and real worker, fake CLI | Status is `pausing`. The CLI and its heartbeat child keep running, and no process is in state `T`. The Reviewer does not start. Status becomes `paused` when the Worker finishes. |
| Pause before the first call | Pause immediately after start | Status goes straight to `paused`, and the Worker does not start within 2 s. Resume admits it. |
| Concurrent reviews (Double review) | Both reviewers active, then Pause | Each reviewer finishes. `respond_*` waits until both are done, and status is `paused` only after the second. Resume admits both exchange calls. |
| Format repair | Malformed exchange review while pausing | The repair call does not start while paused, and starts after Resume in the same reviewer session. The decision then forms normally. |
| Session continuity | Session IDs and `resume` flag logged per call | The Worker and Reviewer sessions stay separate. Round 2 resumes each role's session, including across pause cycles, and the note plus findings reach the Worker. |
| Races, skipped or duplicate calls | 12 runs (Review, Double review, Direct). 3 threads toggling Pause/Resume at random 0–80 ms intervals, random call durations, repair calls included. | About 1,700 accepted toggles. 0 calls admitted between Pause and Resume. Every call was requested, admitted and finished exactly once, and CLI invocations equal admissions. Sessions were never split. |
| Repeated controls | HTTP | Repeated Pause returns 200 with no change. Resume when not paused returns 409. Repeated Stop returns 200. Pause or Resume after Stop returns 409, and Pause while a decision is pending returns 409. |
| Natural boundaries | Human decision, auto completion, CLI failure, Double review | The final state is correct, but a transient pause is recorded and shown first (CP-01). |
| Stop | During Pausing and during Paused | Stops in about 0.01 s. The CLI and its ordinary children end and the heartbeat stops. The detached child survives, as documented. |
| Server loss | SIGKILL and graceful SIGTERM of the server, during Pausing and during Paused | The worker, CLI and child are gone within 1.5 s. After restart the run is `stopped` with the expected message and empty `active_calls`, and controls return 409, except Stop which returns 200. |
| Old-transport compatibility | Old server (HEAD) started, then the working-tree patch applied on disk, then a run started | The worker runs without the gate and emits no call events. Pause still uses SIGSTOP, so the CLI is in state `T` and the heartbeat is frozen. Resume, decision, completion, and Stop while paused all work. |
| Browser, desktop (1440×900) | Playwright against the real server | See the list below the table. |
| Browser, mobile (390×844, touch) | Same | No horizontal overflow, and the header is visible. Tap Pause shows "Pausing…" then "Paused". Tap Play resumes, and Stop works through the confirm dialog. |

Browser results on desktop:

- **Pausing:**
  - Header "Review · Pausing…".
  - Play is enabled and labelled "Resume run". Pause is disabled with the tooltip "Pause after current agent calls". Stop is enabled.
  - Only the agent whose call is running is animated.
- **Paused:** all agents are shown as Paused, and none is animated.
- **Reload:** the header stays correct in both states.
- **Play during Pausing** cancels the pause.
- **Stop through the UI during Pausing** works.

## Not tested

- Real Codex or Claude calls (paid, not approved), a fake `claude` CLI, and provider-side session expiry after long pauses.
- Linux, other browsers, and screen readers. `#scene-state` is `role=status aria-live=polite`, but what is announced was not checked.
- The user's server on port 8765, and browser tabs left open across a server upgrade (R3).
- Detached subprocesses beyond the fake's two patterns (R2), and CLIs that ignore SIGTERM.
- Permission-denied process control. The new code no longer sends signals for Pause or Resume. Stop's existing EPERM path was covered only by the unit test.

## Handover

1. **Fix CP-01** in `rooms.py` (settle on a gated request, not on the last finish) and add the two regression checks listed there.
2. **Optional:** CP-02, a distinct label for repair calls.
3. Before handing it to testers, restart any running ZipperCrew servers so they use the new transport (R4).
4. With approval, make one cheap real run per CLI against a throwaway repository. Check R1 and the inherited-stdout case in R2.

All test servers (ports 8801–8803), workers, fake CLIs and heartbeat processes were stopped. The working-tree diff is unchanged: it was compared byte-for-byte against the copy taken at the start. The only addition is this file.
