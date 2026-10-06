# Hybrid Hub — Babylon visual and interaction spike

This is a new, isolated Babylon.js scene. It does not load the production room,
previous GLBs, illustration atlases, or workflow code. The engine is the existing
local Babylon 9.15.0 distribution; no CDN or asset download is needed.

From the **zippercrew repository root**:

```sh
.venv/bin/python -m http.server 8773 --bind 127.0.0.1
```

Open **http://127.0.0.1:8773/spikes/babylon-hub/**. Keep the server running while
using the scene. This is a source-checkout spike, not part of the packaged app.

## What to inspect

- A vermilion asymmetric Implementer: typing, handling a small test object,
  checking output, and a small physical reaction.
- A broad teal Reviewer: reading, page movement, a pause, and annotation.
- A new Human: sculptural swept hair, iris overshirt with one marigold sleeve,
  oversized hands, listening, notebook checks, and open orchestrating gestures.
- A perspective room camera, matte materials, geometric cast/received shadows,
  a real window opening and a doorway with a short, unoccupied passage.

All meshes, facial features, objects and motion are authored directly in Babylon.
The room is not an image or a 2D rendering. DOM elements are used only for the
surrounding controls and projected local-activity/message labels.

## Controls

The first visit demonstrates local work, a send at 7 seconds, a separate receive
at 14 seconds, Human attention at 24 seconds, then ambient life at 34 seconds.
These times use the scene's presentation clock. Any scenario button takes control
from that one-shot demonstration. Selecting a person does not move the camera.

- **Watch them work** interrupts breaks and returns everyone to their station.
- **Quiet moment** starts staggered window, coffee, and shared-brief visits.
- Select a person, then **Take a short break** to inspect their walk and action.
  Only one break excursion runs at a time; occupied routes wait.
- **Send a Proposal** creates a physical packet. It waits visibly after arrival.
- **Receive Proposal** is a separate scripted semantic event. It immediately
  starts the Reviewer's work state, even during a break or while the packet is
  still travelling. Motion never manufactures a receive event.
- **Ask the Human** reveals adjacent web decision controls. Decisions are demo
  events only; they do not run agents, edit a repository, ship or abandon real work.
- **Pause motion**, **Reset view**, gentle drag and wheel support inspection.
  An operating-system reduced-motion preference starts the scene paused.

The local-activity bubble contains representative scripted test output, not
live CLI output. The interface explicitly labels the handoff as a scripted demo.

## Boundary and spatial behavior

`protocol.js` owns the scripted semantic events and authoritative send/receive
records. `app.js` consumes them. The scene owns only presentation state: poses,
paths, packet flight and camera. The future ZipperGen adapter can supply the same
event boundary without moving workflow decisions into Babylon.

`world.js` defines approach and working transforms, orientation, look targets,
and furniture footprints. A small A* grid expands obstacles by the participant's
body radius, rejects diagonal corner cutting, and avoids other participants.
Walking uses actual translation and articulated limbs. Ambient actions yield
immediately; the return walk is cosmetic and never gates a semantic event.

This room is for three participants. The doorway reserves a plausible future
transition; it does not implement another room or reduce character scale for a
larger crew. All three work poses are standing; seating animation is deliberately
outside this spike. The spare perch is a physical obstacle.

## Verification and captures

With the server running:

```sh
.venv/bin/python spikes/babylon-hub/check.py
```

The Playwright check opens the actual scene, validates geometry orientation,
cast/received shadows and animated transforms, walks each participant to their
interaction point and back, samples obstacle/body separation each frame, checks
ambient preemption and both receive orderings, exercises Human controls, pause,
reduced motion, and a compact viewport. It saves unmodified browser screenshots
under `captures/`.

Live browser frames verify changing poses and the start of a walk. Longer routes
also use the scene's same `step` function at deterministic 1/30-second intervals,
checking separation at every step without depending on software GPU speed.

The scene targets 30 presentation frames per second, caps pixel density at 1.5,
and suspends rendering in hidden tabs. The procedural scene has about 50,000
triangles. Headless browser timing is not a hardware performance benchmark.

## Files

| File | Responsibility |
| --- | --- |
| `geometry.js` | Indexed curved profiles and a small mesh/material vocabulary |
| `characters.js` | Three different body grammars and articulated pose variation |
| `world.js` | Sparse Hub, furniture, openings and interaction transforms |
| `navigation.js` | Small-room path planning and movement |
| `protocol.js` | Standalone demo events; independent of Babylon |
| `app.js` | Scene, lighting, camera, projection and event consumption |
| `index.html`, `style.css` | Ordinary web controls surrounding the 3D viewport |

This is an evaluable procedural cast, not final production character art. It
does not implement a general editor, real CLI execution, multi-room loading,
inverse-kinematics animation rigs, or a production migration.
