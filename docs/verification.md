# v0.1 verification

> Historical notes: much of this document describes the earlier `/` interface.
> Start with the [current README](../README.md) for setup and workflows.
> See the [audit follow-up](audit-follow-up.md) for the findings addressed on 2026-10-10.

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

The three existing project journals were hashed before migration and after
read-only inspection: all remain identical. The actual two-round Reviewer view
shows Completed review, Round 2 of 4, Claude/read-only, REVISE with 2 findings,
proposal/review cards and readable expanded Markdown, with no browser errors.
This refinement did not launch another paid CLI task against that project.
New-run browser validation uses the real ZipperGen process with scripted participants;
native assistant invocation assertions use controlled subprocess responses.

## Workstations, surfaces, autosave and observable results (2026-10-05)

- Full ZipperCrew suite: 58 passed initially; two browser checks required updating
  the obsolete save-indicator assertion and allowing a two-round scripted run to
  finish under workstation load. Both passed on rerun. Two additional browser
  tests cover persistence failure/retry and all-persona lighting.
- The final affected browser group (autosave, lighting, rerun/history, progress
  detail, profile pins) passed all five tests. The real ZipperGen Pair Programming
  process still runs with deterministic test participants; no paid model execution
  or changes to the existing source workspace were needed for this presentation pass.
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


## Babylon migration (2026-10-05)

The Room now loads four original GLBs in Babylon.js. The ZipperGen checkout and
orchestration are unchanged. The isolated spatial study is available at
`/assets/3d/prototype.html`; [the live preview](art/babylon-live-preview.png) shows
the integrated Human decision phase.

- Full-suite run: 63 passed; one screenshot-heavy browser test missed a transient
  review phase on software WebGL. Reduced motion now redraws only when required,
  and that complete two-round test passed twice after the fix. Scripted turn
  duration is extended only when collecting screenshots, never for real CLIs.
- Final non-browser suite: **46 passed**. Final GLB/geometry/rig/browser regressions:
  **3 passed**. The two-round live test passed again after the last rig/card fixes.
- Actual joint rotations verify seated work/review and Human attention even with
  motion reduced. A new card's asynchronous material compilation finishes before
  repainting stops; displaying the card does not invent a semantic receipt.
- Geometry checks cover indexed meshes, real skins and compatible animation
  channels. Every role walks toward coffee, is interrupted by actual work/attention,
  and is inspected at desk, counter and window locations with cast/received shadows.
- Existing browser coverage passed for Room naming/history/rerun, native profile
  overrides, Markdown inspection, autosave failures, explicit asset failures,
  autonomous review, message send/receive distinction and the full responsive
  width/height matrix documented above. Final live frames cover setup, implementation,
  review, Human decision and completion.
- Ruff, mypy, JavaScript syntax and diff whitespace checks pass. Wheel inspection
  confirms all four GLBs and local engine/loader, with no retired Phaser or sprite
  assets (about 2.49 MiB compressed).

The workflow tests use the real ZipperGen process with scripted assistants; this
pass did not spend model credits or modify the existing project. The artwork and
expressive animation are an original first-pass kit, not final artist polish. The provided
reference video's thumbnail/description were available, but full playback was not.


## Babylon art and ambient-life refinement (2026-10-05)

Kept the renderer, event model and ZipperGen integration. Refined the original
asset kit and added `tools/cafe_motion.py` as its editable performance source.
The shared vocabulary now has 23 clips and a blink/expression joint.

Validation for this pass:

- **48 non-browser tests passed**, including bounded tool-result summaries,
  unsafe/unknown command fallback and exact protocol projection tests.
- **6 Babylon/workflow/layout tests passed** in the final group: GLB structure,
  geometry/shadows/workstations, reduced-motion poses/card rendering, actual
  idle motion and coffee interruption for every role, two-round workflow/history,
  and the desktop/narrow/short-window matrix.
- Cosmetic-policy and send/receive-preemption browser checks also passed.
- Ruff, mypy and JavaScript syntax checks passed. The wheel includes four updated
  GLBs; no retired Phaser or raster room assets are loaded/shipped.

The first new motion test found a real paused-group bug: `start()` did not resume
a Babylon group that had already started and then paused. Resetting that group
before starting fixes Full motion after Reduced. The regression measures head
rotation over real elapsed time for Human, Implementer and Reviewer, checks the
standing phone pose, walks each role to coffee, and interrupts the interaction
with Working / Reviewing / Needs human. Active clip samples additionally verify
actual skeletal micro-motion rather than relying on pose names.

Screenshots in `/tmp/zippercrew-polish/` cover setup, implementation, review, Human
attention, completion and responsive sizes. Visual inspection led to moving the
right pendant out of the shared board's sightline. The demo preview on port 8766
was refreshed; the normal user server was left untouched. Workflow acceptance
uses scripted assistants with the real ZipperGen process, without a paid CLI run.


## Furniture navigation, Human and café staging (2026-10-05)

The GLB authoring tool and Babylon navigation share `tools/cafe_layout.json`.
Furniture footprints, participant clearance and visibility-graph routes replace
straight-line walking. Empty chairs pull out for a front approach, then roll the
seated participant into the workstation. Departure reverses that interaction.
Chair movement reserves its swept region only after passing participants clear it.
There is no unsafe straight-line fallback for blocked destinations.

Validation for this pass:

- All named destinations are reachable around furniture; every routed segment is
  checked against inflated solid footprints and room bounds. Blocked goals fail closed.
- Actual imported GLB vertices were checked against the navigation volumes (about
  91,800 vertices). Solid desks, chairs, table, counter and planters are covered;
  soft overhanging foliage is excluded above the planter/stem region.
- Each role walked to coffee, board and window, then entered its own chair from
  the front. Per-render-frame assertions detect furniture crossing; none occurred.
- Human attention interrupts an ambient departure. Joining previously empty roles
  spawns at clear positions. A passing Reviewer can leave a future chair sweep
  before the Implementer pulls that chair out: no reservation deadlock.
- The combined navigation, Babylon, two-round workflow/history and responsive
  browser group passed nine tests. A tenth test initially missed its deterministic
  ambient action because another idle role consumed its random seed; explicitly
  initializing all role clocks fixed the harness. That preemption test and the
  added chair-reservation regression both passed on the final rerun.
- Final non-browser regression suite: **48 passed**. Its temporary HTTP servers
  require local socket access; the sandbox-only attempt could not bind them.
- Ruff, mypy, JavaScript syntax and diff whitespace checks pass. Wheel inspection
  confirms navigation/layout modules and four GLBs, without retired Phaser assets.

The final [spatial preview](art/babylon-polish-preview.png) shows the adult female
Human at the round table, the Implementer at its angled desk, and the Reviewer
checking a tablet. The smaller clipped-paper brief and staggered workstations
replace the classroom-style staging. The [live preview](art/babylon-live-preview.png)
shows a Human decision in the actual application shell.

Workflow acceptance uses the real ZipperGen process with scripted assistants;
no paid CLI run or source-workspace modification was needed. ZipperGen remains
unchanged. Full-motion navigation is tested separately from reduced-motion poses.


## Cast personality and creative orchestrator (2026-10-05)

Kept Babylon, furniture transforms/navigation, runtime states and protocol semantics.
Refined original character GLBs with larger readable faces, independent brows and
mouth joints, warm display colors, differentiated head silhouettes and materials.
Human is an original adult female creative orchestrator with sculpted curls, layered
plum clothing, restrained bright accents, a listening earpiece and expressive hands.
The performer reference informs energy only; no likeness or specific costume is used.

Environment changes are limited to closer/lower aspect-aware framing, gentle portrait
fill, café signage and lowering the near plant canopy to clear Implementer's face.
Solid collision footprints and workstation geometry are unchanged.

The first combined browser group passed ten checks: navigation/routes/chair entry,
geometry/skins, expressions/shadows, the two-round workflow and responsive shell.
Its all-role idle-motion check caught a real regression: the new Human head had a
flat opening interval. Added continuous nod/tilt underneath occasional glances,
then reran the all-role motion/coffee-preemption test on the final GLBs.
The final targeted group passed **5 tests**: shipped GLBs, all-role live motion
and interruption, facial/hand expression and shadows, cosmetic policy, and the
complete two-round workflow/history.

Visual review includes neutral cast, silhouettes, setup, work, review, Human
attention and completion. Captures are in `/tmp/zippercrew-cast-final/`; current
[cast](art/babylon-cast.png), [silhouettes](art/babylon-cast-silhouettes.png) and
[live room](art/babylon-live-preview.png) are kept in the repository. The wheel's
four GLBs match the current production files. Ruff, mypy, JavaScript syntax and
whitespace checks pass. ZipperGen is unchanged. Workflow tests use scripted
assistants with the real Pair Programming process; no paid CLI run was performed.


## Human playful-orchestrator refinement (2026-10-05)

Human-only artwork/performance pass: swept soft locks with an orchid strand,
asymmetric expression, woven neck-wrap, rolled trousers and softer shoes.
Quiet listening nods, brow/hand cues and seated posture retain existing clip/state
semantics. No new runtime behaviour or communication is introduced.

Three targeted checks passed: shipped GLB geometry/rigs, all-role elapsed-time
motion with coffee interruption, and facial/hand animation with shared shadows.
After softening the initially sharp hair geometry, the GLB check passed again
and the actual Babylon render was visually inspected in neutral and directing
poses. Environment, Implementer and Reviewer GLBs are byte-for-byte unchanged.
Ruff, mypy and whitespace checks pass.

Updated [cast](art/babylon-cast.png), [poses](art/babylon-cast-poses.png) and
[silhouettes](art/babylon-cast-silhouettes.png) show the shipped models.
The earlier integrated room screenshots remain records of the previous cast pass.

## Young male-presenting Human (2026-10-06)

Replaced the previous Human face, hair and outfit with an original young creative
orchestrator: longer face/smaller eyes, crooked expression, shaggy falling forelock,
loose plum overshirt and teal tee. Updated authored listening/attention curves;
no renderer, navigation or workflow logic changed.

Three focused checks passed: GLB geometry/skins, real elapsed-time movement with
ambient interruption, and facial/hand gestures with seated attention and shadows.
Ruff, mypy and whitespace checks pass. Environment and both robot GLBs are verified
byte-for-byte identical to the previous kit. Cast, directing-pose and silhouette
captures were refreshed from the actual Babylon renderer. The existing two-round
workflow result is from the preceding cast pass; this Human-only change did not
repeat a paid or scripted workflow run.
# Window Studio production acceptance — 2026-10-06

Implemented the approved Window Studio atmosphere, Open Triangle relationships,
and Spark Human in the production Babylon GLBs. The existing robot GLBs remain
byte-identical. Environment authoring is now in `tools/cafe_environment.py`;
layout, fixed-bench interaction, and collision footprints share
`tools/cafe_layout.json`. No workflow/backend changes were needed.

Real CLI acceptance used the existing `coding-agent-codex` and
`reviewer-agent-claude` profiles on an isolated repository at
`/tmp/zippercrew-window-task`. Codex corrected a clamp function and added six
tests. Claude inspected the actual files and returned APPROVE with zero findings.
The browser selected Another round, supplied equal-bounds coverage guidance,
observed the second implementation/review, and selected Ship it. The final seven
unittests were independently executed successfully.

Claude's existing read-only adapter intentionally disallows shell execution.
Its review explicitly disclosed that it had inspected, but not executed, the
tests. This permission boundary was retained.

Run `6e3cc56a6d214967a995301f2fdb9553` in Room
`9244c43081ff465897fcb6ae2d466d35` completed after two rounds, with four real
assistant invocations, 30 observable progress events, 14 protocol sends and 14
receives. Full local records remain in
`/tmp/zippercrew-window-live-data/rooms/6e3cc56a6d214967a995301f2fdb9553/`.
They are not copied into the source repository.

The real browser run produced no page errors, retained the inspector and trace,
and was inspected at 1440×900, 1366×768, 1280×720, 1200×650 and 1000×600.
[Production screenshots](art/window-studio-production/completed-real-run.png)
come from that completed execution, not a visual demo.

Automated verification:

- Non-browser regression suite: 48 passed.
- Babylon/navigation suite: 9 passed (includes the GLB test also counted above).
- Two-round production UI/history workflow with scripted participants: passed.
- Responsive shell, actual canvas picking and Human decision controls: passed.
- Ruff, mypy and whitespace checks: passed.
- Every role walked to coffee, brief and window, then returned to the correct
  seated transform. Frame-by-frame checks found no furniture intersection.
- Imported furniture vertices are checked against every navigation footprint.
  Coverage is based on obstacle IDs, not the old decorative scene's vertex count.
- The fixed bench has a front-entry sit/stand interaction and must never slide.
  Real work interrupts ambient goals; the workflow never waits for animation.
- Real cast/received shadow participation, active/idle joint motion, reduced
  motion and protocol send/receive separation remain covered.

# Inhabited miniature world / Phaser migration — 2026-10-06

Preserved the complete working Babylon state in commit `078f566` and tag
`archive/babylon-window-studio-2026-10-06` before changing the renderer. The
production page now uses Phaser Canvas and a new authored illustrated PNG kit.
No old pseudo-3D café renderer was restored. ZipperGen was not modified.

The real acceptance run used `coding-agent-codex` and `reviewer-agent-claude`
in `/tmp/zippercrew-dollhouse-task`. Codex fixed `slug(text)` to normalize
whitespace and preserve punctuation, and added standard-library tests. Claude
reviewed the actual source with its existing read-only adapter. The browser
selected Another round and supplied non-breaking-space coverage guidance, then
selected Ship it after the second review. Both rounds retained the separate
assistant sessions. The five resulting unittests pass independently. Claude
explicitly disclosed that it reviewed the tests without executing shell commands.

Room: `a944fac895344f6e995e5309b89572c2`.
Run: `2b2f0afd8a6b427f900204c15c7fcaa4` — completed, two rounds.
The journal has four assistant invocations, 26 observable progress events, ten
observed tool-output records, and the original send/receive event history.
Full local records remain under `/tmp/zippercrew-dollhouse-live/`; they were not
copied into the repository. [Screenshots](art/dollhouse-production/README.md)
show the production page during that execution. Reopening the completed run,
selecting Reviewer, and opening its trace produced no browser page errors.

Validation:

- 49 non-browser tests passed; Ruff and mypy passed.
- Production browser coverage passed for two-round continuity, automatic mode,
  reduced motion, stop, profile creation/model/effort, safe inspector messages,
  real send/receive presentation, ambient preemption, history, Room management,
  autosave and responsive shell. Renderer-name/asset-failure checks were updated
  from Babylon/GLB to Phaser/PNG and rerun successfully.
- New asset checks verify RGBA sprite sheets and every atlas frame's bounds.
- New navigation checks cover every pair of seat/rest/approach/shared destinations
  for 3, 5 and 8 roles and reject goals inside furniture. These caught and fixed
  two approach/rest points too close to inflated furniture footprints.
- The eight-role production-renderer harness keeps the three-role character
  scale and brings an annex participant into view. This tests rendering only;
  no eight-agent workflow has been added.
- Every role's ambient coffee movement yields immediately to real semantic work;
  active poses use different authored frames, not just changed state strings.
- The actual shell was exercised at 1440×900, 1366×768, 1280×720, 1200×650,
  1000×600, wide desktop, short and narrow layouts. Controls remain reachable;
  Canvas buffer size and DOM/Canvas selection remain aligned.
- A clean wheel contains all eleven dollhouse PNG/JSON files and Phaser, with
  Babylon modules, engines and GLBs excluded. No npm build or runtime downloads.

The atlas has a compact eight-pose vocabulary per role. Additional in-between
frames can improve fluidity later without changing semantics or room layout.

## Linked Studio / Patchwork Cue production integration — 2026-10-06

The production Phaser renderer now loads the approved integration package's
`linked-studio-background.png` and `cast-atlas.png` under versioned production
asset names. PNG contents are byte-identical to the approved package; no new
character generation or environment exploration was performed. Human has the
approved neutral and orchestrating frames, and the agents retain their approved
characteristic artwork.

Ambient policy now starts an occupied local routine immediately, changes it on a
varied 10–19 second cadence, and mixes in 21–30 second excursions. Role libraries
cover listening/notes, tool/sketch/paper activity, thinking, window/board visits,
coffee and short pacing. Action history prevents immediate repetition. Shared
path reservations and yielding also cover the return home. Actual task states
and observed communication interrupt these routines; cosmetic arrival still
cannot acknowledge a protocol message. Reduced motion suppresses these routines.

Validation:

- Full test run: 78 passed; one archived navigation fixture failed because its
  manually forced action did not pin the new scheduler's rotation deadline.
  After pinning that fixture's deadline, its original collision/seating assertions
  pass. The focused rerun passed all 10 tests, including the new scaled-occlusion
  regression, approved-source identity, ten-minute ambient coverage, navigation
  at 3/5/8 participants, task preemption and real send/receive semantics.
- Corrected a Canvas mask/container-transform bug found in real app screenshots.
  The regression checks visible Reviewer feet and table-over-Implementer pixels.
- Real app screenshots show the approved studio, live brief, ambient labels and
  participants moving between local destinations, without browser page errors.
- Ruff and mypy pass. Offline source/wheel builds pass. Wheel inspection verifies
  that all three new production assets are included with unchanged contents.
- Capture assets are in `art/linked-studio-production-2026-10-06/`. Demo captures
  use isolated data and scripted agents; they do not run a real coding assistant.

The animation remains lightweight 2D: approved poses, foot-anchor travel,
restrained gestures, Human blinks and a lifted mug. It does not claim a complete
skeletal animation rig. State labels, activity bubbles and protocol cards remain
separate from these cosmetic motions.
