# Audit follow-up (2026-10-10)

> Historical follow-up, not a current readiness assessment. See the
> [current README](../README.md) for supported behavior and known limitations.

2026-10-10. This records the changes made after the private-testing audit of
ZipperCrew `510cbf3`. The [original audit](audits/2026-10-10-pre-testing.md)
is archived with its original findings.

## Fixed

| Finding | Change |
| --- | --- |
| ZC-01 | At the round limit, the decision panel shows enabled **Ship it** or **Done**, plus **Abandon**. It no longer offers an unusable next round. The reviewers' objections stay visible. |
| ZC-02 | Failed task saves remain visible on the whiteboard and room header after the editor closes. Play is disabled. Opening the board or header returns to the draft and its retry action. |
| ZC-03 | Review and Double review both allow one formatting clarification in the same reviewer session. A complete JSON code fence is accepted. Invalid verdicts and conflicting headers do not count as approval. The reviewer's reason remains readable, with format problems separate from it. |
| ZC-04 | Changing day or night mode immediately updates the crocodile texture, even when animation is paused. |
| ZC-05 | Enter or Space on the office opens the nearest agent or whiteboard. Tab reaches each room object directly through controls that appear on keyboard focus. The room status is a polite live region. |
| ZC-06 | Muted text and room status colors have stronger contrast in both themes. The tested small-text combinations meet 4.5:1 against their panel backgrounds. |
| ZC-08 | A room switch blocked by an invalid draft returns to the relevant editor. An invalid round limit opens Advanced and marks the field. The draft is retained for correction instead of being discarded or presented as a connection failure. |
| ZC-09 | A fake executable on PATH now exercises the production streaming CLI path. It checks session continuity, fresh sessions for a new run, role separation, model and effort flags, permissions, environment filtering, and full feedback plus the human note. |
| ZC-11 | History uses app navigation wording instead of trace commands. Restart copy explains that Play starts a fresh run. Theme choices persist. Older architecture and verification notes are marked as historical. Formatting passes, and README lint commands target application code and tests rather than archived experiments. |
| ZC-12 | A Direct rerun with an empty note explicitly tells the Worker that the human requested another attempt without further guidance. |
| ZC-13 | The answer API rejects another round at the limit before consuming the pending decision, whether or not a note is supplied. |

The room layout, character artwork, and handover timing have not changed.

## Verification

Checks ran on macOS with the existing virtual environment and sibling ZipperGen
checkout.

| Check | Result |
| --- | --- |
| Backend suite, `pytest -m 'not browser'` | 115 passed |
| Direct follow-up after adding the empty-note case | Both note cases passed |
| Browser suite, Chromium | 63 passed across two isolated test groups, 23 and 40 |
| `ruff check src tests` | Passed |
| `ruff format --check src tests` | Passed, 50 files |
| `mypy src/zippercrew` | Passed, 14 source files |
| `git diff --check` | Passed |

The browser checks include a keyboard-only setup and decision walkthrough,
failed-save recovery, round-limit choices, theme persistence and computed contrast.
Screenshots of the failed-save state and final-round decision were also inspected.

These checks use scripted participants and fake CLI processes. No paid model
calls were made. The running instance on port 8765 and its room data were left
alone. Backend fixes take effect when that server is next restarted.

## Still open

- **ZC-07, Claude boundaries.** The current Claude configuration does not confine
  file reads to the selected repository. Headless Worker shell access still needs
  a real CLI check. The README now states these limits. Enforcing a stronger
  boundary requires a change in the upstream CLI adapter and verification against
  supported Claude versions.
- **ZC-10, detached processes.** Stop terminates the run's process group. A process
  that deliberately detaches into a different session may survive. This is now
  documented. Whether real model CLIs leave such processes behind remains untested.
- **ZC-14, responsiveness.** CLI preflight still holds the start lock, and SSE still
  sends full snapshots. Measure realistic runs before changing those mechanisms.
- **Real-model behavior.** The repair logic is covered with controlled responses.
  That does not establish how often real reviewers need it, or their review quality.
- **Other environments.** Linux, other browser engines, actual screen readers,
  long-running sessions, and private-repository access for new testers remain
  outside this verification.

A separately approved real-model test should use a throwaway repository, a small
fixed task and bounded usage. It should cover both CLI backends, reviewer output,
Claude file and shell permissions, and process cleanup after Stop. Use harmless
fixture files to probe read boundaries, never personal files or credentials.
