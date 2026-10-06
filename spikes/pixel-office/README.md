# The studio — pixel-art workspace prototype

An isolated, single-screen Phaser 3.90 experiment. Four original office avatars,
four desks, a lounge, and a short repeating ambient routine. All activity is
scripted; this does not connect to agents or change the existing application or
Babylon experiment.

From the **zippercrew repository root**:

```sh
.venv/bin/python -m http.server 8774 --bind 127.0.0.1
```

Open **http://127.0.0.1:8774/spikes/pixel-office/**. No build, install, CDN, or
external asset request is needed. Phaser is the project's local distribution.

## Try it

- The office fills the app. Small corner controls replace the header, permanent
  crew row and scene frame. There is no sidebar.
- Click an avatar for a modern floating card with its role, current activity and
  focus. **Walk over** approaches them in the world. The **People** corner button
  opens the keyboard-accessible roster; selecting someone also finds them in a
  small, panned viewport.
- Click a desk for its contextual task preview. **Open task** (or an agent’s
  **Current focus**) opens a larger, dismissible detail window. Tasks are example
  content for this prototype, not connected to a backend.
- The **···** menu contains seating, pause and **Recent activity**, a local history
  of the scripted speech in this session. Escape, close buttons and floor clicks
  dismiss contextual cards; modal windows contain keyboard focus.
- Click the floor to walk as **You**. Arrow keys and WASD work when the scene has
  focus. Walking routes avoid furniture and other people.
- **Day / Night** switches the same office between ivory/honey/blue-gray and
  slate/warm brown. Night has dark blue windows, warm lamp light, and soft monitor
  light. Lighting falls on the actual material colors of desks, upholstery, rugs,
  and nearby characters; furniture also softens the light reaching the floor
  behind it. Switching preserves positions, routes, seating, selection, and pause.
  Direct links accept `?mood=day` or `?mood=night`.
- **Take a seat**, in the studio menu or your own card, walks you to your desk. You can also click any empty desk chair
  or the lounge chair. **Stand up**, a floor click, or arrow/WASD movement exits
  the seat before walking. Occupied and reserved chairs cannot be taken.
- Mira (Planner) and Jules (Reviewer) compare notes, return to their desks, and
  meet again. Theo (Worker) works at his desk and takes a coffee break.
- Pause freezes ambient activity; you can still walk. Reduced-motion preferences
  start ambient activity paused. Escape closes character details.
- **− / +** changes the physical pixel scale. **Fit** restores the fitted view.
  Source pixels always occupy whole display pixels, including Retina/browser
  zoom. If a small display cannot fit the native grid, the viewport scrolls.

## Artwork and scene contract

The world is a genuine Phaser tilemap with individually depth-sorted furniture
and animated sprites. HTML/CSS is used only for application chrome and contextual
panels. Phaser's Canvas renderer uses nearest-neighbor sampling, integer sprite
positions, and a 560 × 352 native scene on 16 px floor tiles. Text inside the
world uses an original 3 × 5 bitmap alphabet.

| File | Responsibility |
| --- | --- |
| `world.js` | Room metadata, floor bounds, zones, furniture instances and footprints, cast and home positions |
| `art.js` | Original pixel textures, sprite sheets, and bitmap labels |
| `palettes.js` | Day/night material colors and restrained role accents |
| `lighting.js` | Local material lighting, soft furniture shadows, and character light response |
| `seating.js` | Chair ownership, hip/foot anchors, seated poses and sit/stand transitions |
| `navigation.js` | Small A* grid with footprint clearance and occupied-space avoidance |
| `activity.js` | Cosmetic, repeating activity schedule |
| `app.js` | Phaser scene, sprite movement, depth sorting, controls, display scaling |
| `avatar-motion.js` | Stable facing, distance-based gait, arrival settling and idle blinks |
| `interface.js` | Contextual cards, popovers, task window, local activity history and focus handling |
| `context.js` | Replaceable example task content, linked to desks by owner |
| `index.html`, `style.css` | Surrounding application UI |

To replace the placeholder artwork, retain texture keys and dimensions in
`createArt`. Character sheets contain four 32 × 36 frames per row, in
down/left/right/up/seated-up/seated-down rows followed by a row of four directional
blink poses; the foot anchor is (16, 33), and
the seated hip anchor is (16, 25). The restrained role accents are dusty blue for
Planner, muted green for Worker, coral for Reviewer, and amber for Human. They
appear in small pins, name labels, and UI badges rather than filling the room.

Furniture uses a top-left origin and an independent floor footprint. Every chair
declares a local `seat` hip contact point, facing, and walkable approach point.
The avatar's foot position is derived from that hip contact and the sprite's
hip-to-foot offset; it is never placed at the chair origin. Background/backrest
and foreground seat-lip/armrest layers straddle the seated avatar's foot depth.
Sit/stand transitions reserve the chair and permit overlap only with that chair's
footprint. A different destination or keyboard input safely cancels an approach.
The architecture is a bespoke background for this first room; general room
generation is intentionally future work. Furniture and characters are already
instantiated from data.

Day balances neutral ivory walls and a dusty blue-gray work rug with the existing
honey wood and coral sofa. Only these two surfaces receive daylight color tuning;
their separate material references preserve the established night lighting.
The craftsmanship pass retains the room arrangement.
Desks have distinct equipment and joinery, chair backs vary within the same seat
contract, plants have broad and upright silhouettes, and the shelf includes books,
paper storage and small personal objects. Rug weave and borders are quieter so
the furniture carries the detail. Two small desk lamps join the existing floor
lamp; every light is described relative to its furniture in `world.js`.

Night lighting is calculated at native pixel resolution. It blends the original
material toward locally lit colors, preserving grain and seams rather than
painting an opaque light circle over furniture. The window exteriors and screen
faces retain their independent colors. Character illumination is cached in a
small number of light levels as avatars move through the room. No blur, bloom,
canvas filtering, or smooth vector overlays are used inside the world.

Avatar animation follows actual displacement, including keyboard collisions.
Facing changes require a sustained direction for at least 100 ms and 2.5 native
pixels, with a 180 ms turn lock and an axis bias near diagonals. The last three
pixels of a route cannot introduce a new facing. Reached waypoints are consumed
within the same update instead of causing a one-frame stop. A 120 ms settling
delay absorbs brief pauses; gait advances with distance and holds while blocked.
Face and hair registration stays identical between idle and all walking frames,
and blinking begins only after a sustained idle. Chairs and conversations can
still explicitly set facing. Simulation coordinates retain precision, while all
sprite positions and origins are snapped to the native pixel grid for drawing.

## Verification

With the server running:

```sh
.venv/bin/python spikes/pixel-office/check.py
.venv/bin/python spikes/pixel-office/check_refinement.py
.venv/bin/python spikes/pixel-office/check_animation.py
.venv/bin/python spikes/pixel-office/check_interface.py
```

The browser check exercises actual clicks and keypresses, selection without
accidental movement, walking, pause, two complete activity cycles with per-frame
furniture/avatar collision checks, zoom, compact/mobile viewports, Retina,
reduced motion, and keyboard selection. Unmodified browser screenshots are saved
in `captures/`. `--capture-only` refreshes the opening-screen capture.

The refinement check compares actual rendered palette colors without advancing
the scene, exercises all five chairs, verifies exact hip alignment and foot-based
depth/layering, rejects occupied seats, and checks movement out of a seat by
pointer and keyboard. It also verifies differing local illumination across the
same upholstery material, illuminated character textures, and unchanged dark
window colors. It saves matched `day.png` / `night.png` captures, world-only
captures, and `seated-day.png` / `seated-night.png` showing all four desk seats.

The animation check exercises noisy diagonals, tiny endpoint corrections,
zero-distance targets, real turns, blocked keys and arrival settling in both
moods at 20/30/60 Hz. It compares head pixels across every avatar's walk frames
and verifies integer render positions/origins and disabled texture smoothing.

The interface check clicks all four desks and agent cards, opens task details and
history, verifies modal keyboard containment and absence of click-through walking,
exercises Walk over and seating, and checks mobile panel bounds. Captures named
`office-interface-*`, `office-agent-*`, `office-task-*`, and `office-mobile-*`
show the modern overlay layer over the unchanged day/night world.
