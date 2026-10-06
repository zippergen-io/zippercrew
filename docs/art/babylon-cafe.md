# Corner Café — Window Studio production kit

The current production direction is **Window Studio + Open Triangle + The Spark**.
The approved [layout studies](minimal-cafe-lookdev-2026-10-06/index.html) and
[Human study B](human-lookdev-2026-10-06/b-spark.png) are implemented as authored
GLBs in the normal Room. No concept image is used as a rendered background.

See the [production Room](window-studio-production/room.png) and
[completed real CLI run](window-studio-production/completed-real-run.png).

## Current composition and interaction

A large window and fixed pale-wood bench form the Human area. A small side table
supports a laptop; the Human holds an ochre notebook/score with abstract crew tiles.
Two light desks face into an open triangle. An integrated ivory coffee cabinet
and plain brief panel occupy the rear return. There is no rug, floor pattern,
plant collection, shelf, pendant lighting, café sign or decorative station trim.
The quiet sky surface is geometry beyond the window, excluded from the interior
shadow-caster list; all furniture and characters retain real cast/received shadows.

Spark has copper swept locks with an offset soft curl, an uneven plum overshirt,
mismatched teal/lilac sleeves, mustard tee, dark trousers and cream/plum high-tops.
The existing facial rig, listening gestures and blended idle/work loops remain.
The notebook follows the hand bone and is hidden during incompatible actions
such as coffee or typing. Robot model/animation GLBs are unchanged.

`tools/cafe_environment.py` authors the simplified environment;
`tools/build_cafe.py` authors the cast and exports all four GLBs.
`tools/cafe_layout.json` is shared by geometry and navigation. It now includes
the board position, Human side-table offset, fixed bench footprint and front dock.
The bench never moves: a short sit/stand interaction enters from the open front.
Other furniture stays solid during that interaction. Agent chairs retain the
existing reserved pull/seat/roll sequence. Navigation has no straight-line
fallback when a route is blocked.

Board hit targets use the same 3D position as its ink surface. The renderer keeps
semantic events, activity bubbles and actual protocol cards separate. No backend,
profile, workflow, Room/Run or inspector logic changes were required.

## Earlier development history


## Direction and reference

The reference supplied for this pass is
[Demo game BabylonJS + Vue + Colyseus](https://www.youtube.com/watch?v=RIs0URMKDRY).
The thumbnail and description were accessible; full video playback was not.
Reference qualities: visible third-person depth, strong large forms, bold color
blocking, and a character that inhabits an interactive world. No meshes, textures,
animations, character designs or level layout were taken from that work.

The old room was a realistic rendered café with sprites. This pass deliberately
replaces that direction with a chunky, clean game level and an articulated cast.
The environment is simplified too: no photographic surface textures or baked
background. The original coral bay, slate wall and wooden floor have now been replaced by
the restrained Window Studio composition described above.

## Spatial prototype, then integration

`/assets/3d/prototype.html` is an isolated visual harness, accessible on the local
service. It demonstrates seating, coffee travel, review, Human attention and
completion using explicit preview states. Those controls exist only in the
prototype. The normal application takes its states/messages exclusively from the
existing runtime projection.

Initial inspection caught mirrored board lettering, overly pale material colors,
and high camera framing. These were revised before the normal Room was connected.
The first integrated run then exposed a canvas sizing/repaint issue; the renderer
now follows the host size and repaints on resize.

The cast uses deliberately stylized hard-surface articulation, with authored
performances rather than motion-captured human movement.
The animation library has 24 clips with identical channel sets for blending;
there is no motion capture, IK solver, physics or general navigation engine.

## Assets and ownership

All geometry is original ZipperCrew asset-authoring code in `tools/build_cafe.py`
and `tools/cafe_environment.py`.
`tools/cafe_motion.py` authors the performances. The Python standard library writes GLB 2.0: bevelled cross-sections, lathed surfaces,
faceted organic shapes, simplified PBR materials, joint skins and animation clips.
The script is the editable source. The four GLBs are the shipped production assets:

- `corner-cafe.glb`: shell, workstations, chairs, monitors, coffee counter/machine,
  shared board, Human bench and side table, with named submeshes.
- `implementer.glb`: coral builder, broad headset and antenna.
- `reviewer.glb`: taller teal analyst, scanner and skinned handheld pad.
- `human.glb`: Spark creative orchestrator, swept copper hair, plum overshirt,
  mismatched sleeves, mustard tee and a held notebook.

Production imports these models; it does not reconstruct the level using Babylon
boxes. Small runtime geometry is reserved for selection rings, message cards,
the brief ink surface and held coffee cups. The protocol card's dynamic texture
contains only its label, correlation sequence and actual receive status. Full payloads stay in the
inspector and trace.

Rebuild: `python3 tools/build_cafe.py`. No network access is needed.

## Coordinates, movement and light

Metres; Y up; front +Z. Working agents face their local -Z toward their monitors, rotated by the station yaw. The authored
chair points, approach points, keyboard positions and seated clips are coordinated.
A raised chair footrest supports the cast's shorter game proportions. Side aisles
and a rear circulation lane avoid traversing the desktops. The shared ambient
reservation still controls trips to coffee, board and window.

A directional key and hemispheric fill light all geometry. A 2048 shadow map
contains environment and skinned meshes. Every persona casts and receives real
shadows, with scene depth handling occlusion. There are no sprite masks or baked
character shadows. Activity bubbles remain DOM text projected above each persona.

## Validation boundaries

Browser tests import the shipped GLBs, check skins/clips, exercise sitting and
walking, interrupt each role's coffee route with semantic work/attention, and
capture each role at desk/counter/window locations. Existing tests exercise real
ZipperGen Pair Programming with scripted assistants, protocol receipts, autosave,
history and the responsive shell. No paid CLI/model is needed for those checks.
Visual art remains a first pass and should be judged in motion as well as in stills.

## Rendering and reduced motion

Static geometry is batched by material and selectable owner, with indexed
triangles retained. Floors stay separate for shadow reception. Rig clips share
channels and use explicit animation weights for short crossfades. Reduced motion
pauses the selected clip at its authored pose; it does not leave the skeleton in
its neutral bind pose. New protocol-card shaders are allowed to finish compiling
before the scene stops redrawing. Normal motion is capped at 30 frames/second.

The asset regression checks indices as well as vertex geometry: an earlier batching
experiment produced invisible surfaces despite valid bounding boxes. Browser checks
also inspect actual joint rotations, rather than relying on pose names alone.

## Second art and performance pass

The same Babylon architecture now uses authored elliptical shell profiles, smooth
curved surface normals, upholstered chair backs/arms, sculpted desk trestles and
layered work surfaces. A fluted espresso counter, hopper/tray, framed café sign,
pendants, short book ledge and shared-table rug establish distinct places without
filling the circulation lanes. Floor proportions are tighter and the camera is
closer. The blue surrounding field and warm key/café fill separate the level from
the application chrome; characters still cast and receive the shared shadow map.

Implementer has a broad rounded shell, headset and utility belt. Reviewer has a
tapered torso, high collar, narrow head and asymmetric scanner/brow. Human has a
shaped jacket, collar, pockets, swept hair and simplified expressive eyes. These
are original reusable models, not assembled third-party asset packs. The expression
joint provides blink windows; all other poses remain joint animation.

The [live frame](babylon-live-preview.png) is captured from the integrated workflow.
The prototype remains useful for comparing working, reviewing, attention and
completed poses. Tests separately exercise all-role idle motion, coffee arrival,
seated/standing poses, interruption and reduced-motion transitions.

[Final spatial preview](babylon-polish-preview.png) includes the unobstructed board
and the finished second-pass prop placement.

## Café staging and Human refinement

The third pass staggers and angles the workstations toward the shared area. The
Human's round table/lounge chair faces into the room, the brief becomes a smaller
clipped-paper project surface, and the coffee counter keeps its identity as a
separate destination. The layout removes the rows-facing-a-board composition.

Human is now an adult stylized woman with an asymmetric swept bob, small earrings,
a plum studio jacket and a soft lip shape. The dark horizontal mouth bar that read
as a moustache is removed. Her rig, role color and semantic responsibilities stay
the same. Robot designs are retained. All furniture remains real lit geometry.

Movement and geometry use the same authored station transforms. Rolling chairs
now have an explicit open-front interaction, rather than a walking waypoint
inside the chair. This pass adds a seated attention clip (24 clips total).

## Cast-first refinement

This pass uses the earlier Phaser persona sheet as a reference for warmth and
facial readability, while keeping original articulated 3D meshes and the current
level. It does not reuse rendered sprites or introduce a different art pipeline.

- Implementer: a wider porcelain head with coral headset details, a rounded dark
  display, large warm eyes, raised curved brows and a small smile. Broad shoulders,
  antenna and utility belt keep the builder silhouette.
- Reviewer: a wider upper head tapering into a porcelain chin, asymmetric eyelids,
  independent brows, a scanner and the existing review tablet. The analytical pose
  retains its slower head tilt and annotation gestures.
- Human: swept hair, larger almond-shaped eyes with iris/catchlight, curved brows,
  cheek accents, a smile and a plum jacket over a cream shirt. Cream trousers and
  plum shoes separate her human silhouette from the two hard-shell agents.

Each rig now includes independent brow and mouth joints alongside the existing
blink joint. Gaze, eyelid openness and brow motion are authored in the same clips
as body motion; there is no inference about model emotion or hidden reasoning.
The Human's seated idle includes a restrained glance toward the crew. Completed
poses add a small head acknowledgement. Existing state/ambient priority, routes,
chair interactions, protocol messages and activity data remain unchanged.

The camera is closer and slightly lower, with aspect-aware pullback for narrow
views. Cast-only satin shell materials contrast with the rougher environment.
A low-intensity portrait fill lifts faces, modestly stronger during real active
states; the directional key and all cast/received shadow geometry are retained.
The café sign is clearer, and the foreground plant canopy is lower so it does
not cross the waiting Implementer’s face. Furniture positions and solid navigation
footprints are unchanged.

The standalone cast/silhouette captures and integrated live frames are rendered
from production GLBs, not concept renders. The scene should be judged at normal
room scale as well as close up: the faces must remain readable without labels.

### Human as creative orchestrator

The Human's final direction is an original adult female creative coordinator:
a lively asymmetric mass of sculpted curls, plum overshirt and cream underlayer,
apricot/berry/teal accents, a small listening earpiece and more articulated hands.
The reference is the warmth and eclectic, attentive energy of contemporary
multi-instrumentalists; no celebrity face, hairstyle or identifiable costume is
reproduced. The cast remains maker / critic / orchestrator.

Her seated loop nods and glances between the crew, with an occasional open-hand
cue. Attention includes a slightly larger inviting hand gesture while remaining
seated with the device. The laptop/phone is her visual score. Human can now also
visit the existing shared-board destination during ambient waiting; timing,
shared-aisle reservation and semantic preemption use the unchanged ambient policy.
There are no invented Human messages, decisions or progress bubbles. The actual
Human decision UI remains enabled immediately, independently of the gesture.

The normal-motion regression caught an overly still opening to the new seated
head loop. Continuous low-amplitude nod/tilt was restored beneath the larger
occasional glances. The rig test checks elapsed-time motion, not only clip names.

[Production cast study](babylon-cast.png) and [silhouette check](babylon-cast-silhouettes.png)
show the original GLB models without the café.

### Playful orchestrator refinement

Human now has a more unruly, asymmetric sweep of soft sculpted locks, a restrained
orchid strand, an off-centre smile and one more inquisitive brow. The plum outfit
has a berry woven neck-wrap, cream layers, rolled trouser cuffs and rounded shoes.
Removing the shared robot-style knee caps and dark hip shell makes the adult human
clothing clearer. No head/body scale change, pointed ears, red cartoon hair,
celebrity face or copied costume is used.

The references inform warmth, musical attentiveness and a little impish energy.
Standing idles add a listening tilt and quiet hand cue; seated idles add a brief
nod and asymmetric eyebrow lift. These remain calm authored performances, without
changing semantic states, ambient scheduling or the actual Human decision path.
The first hair silhouette was too pointed; interpolated swept profiles softened
it before acceptance. Environment and robot GLBs remain byte-for-byte unchanged.


## Current Human: young creative orchestrator (2026-10-06)

This supersedes the earlier female-presenting designs recorded above. Human is
now a youthful male-presenting original persona: a longer subtly angular face,
smaller eyes, uneven strong brows, crooked grin and a shaggy umber mop with a
falling forelock. The tidy bob/curl chain, lashes, blush, earrings, neck-wrap and
orchid strand have been removed. The brief is expressive creative energy and a
playful spark, without any celebrity portrait or recreation of a known character.

A loose open plum overshirt, teal tee, dark trousers, ochre pocket/hem and rolled
sleeves replace the previous neat outfit. The ear device remains a quiet listening
motif. Face/eye proportions are less doll-like; the existing articulated body
and chair contact transforms remain compatible with the shared game world.

Standing/seated idles have a slight shoulder asymmetry, listening tilt and small
open-hand cue. Attention looks toward the crew before checking the score/device.
These are authored performance curves only. No semantic states, Human decisions,
ambient scheduling, protocol events, room layout or robot models are changed.

The current [cast](babylon-cast.png), [directing pose](babylon-cast-poses.png) and
[silhouettes](babylon-cast-silhouettes.png) are actual Babylon captures. The [spatial room view](babylon-polish-preview.png) shows him seated at his table.
Older integrated workflow captures retain the earlier Human as art-history evidence.
