# Historical art studies

These studies document earlier versions of ZipperCrew. The current pixel office
is shown in the [main README](../../README.md). The descriptions below refer to
the versions at the time, not the current production interface.

Generation records retain their design and attribution context. Machine-specific
paths have been replaced with repository-relative paths or `local-references/`
placeholders. Local reference images are not included.

## Archived inhabited miniature studio

This version of the Room used **Phaser, the refined Patchwork Cue cast, and Linked
Studio**. The approved red rabbit Implementer and pale green paper Reviewer are
unchanged. Human keeps the structured auburn fringe, understated face, and
constructed plum/mint/ochre clothing.

- [Archived app, recording and screenshots](linked-studio-production-2026-10-06/index.html)
- [Approved art and implementation handoff](linked-studio-human-integration-2026-10-06/index.html)
- [Runtime behavior and layering](../room-experience.md)

The runtime copies the approved cast and room PNGs unchanged. The galleries below
are retained as design history, not additional approved production directions.

## Earlier dollhouse studies

[Cast, room and 3/5/8-participant studies](flat-dollhouse-lookdev-2026-10-06/index.html)
preceded Patchwork Cue and Linked Studio. Their recommendations are superseded by
the current production direction above. The original prompts remain with each gallery.

# Earlier art history

Latest direction studies:

- [Human concepts](human-lookdev-2026-10-06/index.html): **B · The Spark** is the
  selected Human basis, with a little softer curl language from C. The orange
  Implementer and teal Reviewer retain their current identities.
- [Minimal café layouts](minimal-cafe-lookdev-2026-10-06/index.html): four cleaner,
  rug-free environment concepts with the selected cast. **02 Window Studio +
  01 Open Triangle** guided the archived Babylon GLBs; see the
  [production capture](window-studio-production/completed-real-run.png).

The archived Babylon room used an original stylized 3D asset kit. See
[Babylon art direction and asset source](babylon-cafe.md). The raster assets and
pose sheets below are retained as historical references, not loaded by the Room.

The previous Phaser room used the approved **grounded café + stylized agent cast**
direction. Original assets were derived with the built-in image-generation tool on
2026-10-05 from the approved [environment and persona studies](lookdev-2026-10-05/README.md).
The Human remains human; Implementer and Reviewer are distinct robot personas.
No external character art, stock assets, franchise imagery or logos were supplied.

[Production screenshot](production-v2-preview.png) shows the configured crew in
the running application, not a composited concept image.

Files live under `src/zippercrew/static/assets/`:

| File | Content | Layout |
| --- | --- | --- |
| `corner-cafe/background-v2.png` | Grounded café, window, coffee counter, blank board and floor; no portable furniture or cast | 1536 × 1024 opaque plate |
| `corner-cafe/furniture-v2.png` | Oak/steel workstations, café table, two task chairs and stool | 1536 × 1024 alpha atlas, three columns × two rows |
| `characters/implementer-v2.png` | Compact coral/ivory robot, swept wedge head, antenna and side hubs | 1254 × 1254 alpha atlas, three columns × three rows |
| `characters/reviewer-v2.png` | Tall teal robot, shield head, long neck, tablet and stylus | Same pose layout |
| `characters/human-v2.png` | Indigo curls, plum overshirt, ivory trousers, phone | Same pose layout |

Character frame order: **idle, work, coffee, walk-a, walk-b, think, receive,
success, stopped**. Implementer work is typing; Reviewer work is tablet reading
and annotation; Human work is observing via phone. Completion is a relaxed pose.
These are authored pose sheets with the existing small Phaser movements and pose
transitions, not skeletal or frame-by-frame character animation.

`ART` in `room-engine.js` holds the asset revision, background, board location,
and measured atlas gutters. The renderer trims alpha bounds inside those regions
and anchors each pose at its feet. Explicit regions prevent the extended hand in
Implementer's receive pose, or a neighbouring row's head, being clipped by a
uniform grid. Furniture and characters remain separate depth-sorted entities.
Desk and chair scales are role metadata. UI labels and the shared brief are live
text, never baked into the imagery.

The assets are copied unchanged from generation output; no chroma-keying, painted
alpha replacement, or destructive bitmap cleanup is applied. Corner transparency,
frame occupancy and atlas gutters are checked in the browser. New versioned URLs
avoid reusing an older cached production texture. Previous art remains in Git
history and the look-development comparison page.

The existing semantic states, ambient scheduler, bubble cadence, protocol message
objects, permissions, and ZipperGen integration are unchanged. Production frames
are checked during the actual Pair Programming workflow with scripted assistants:
setup, implementation, review, Human attention, another round and completion.
This is deterministic execution of the real workflow, without paid CLI/model calls.

[Exact production prompts](production-v2-prompts.md) include the furniture cleanup
pass. The [original prompts](prompts.md) document the retired all-human production art.


## Workstation orientation refinement

`corner-cafe/workstations-v3.png` is a transparent two-column desk atlas created
with the built-in imagegen tool using the existing furniture and Implementer pose
sheet as references. It preserves oak/charcoal materials and lighting, but rotates
the physical monitor arrangement so the screen faces the seated agent and its
back faces the camera. `furniture-v2.png` still supplies chairs and the Human table.
Room/persona designs and all character sheets remain unchanged in this refinement.
See [exact workstation prompt](workstations-v3-prompt.md).

`brand/zippergen.svg` is copied **unchanged** from the canonical sibling asset
`zippergen/assets/zippergen-favicon.svg`, also used as the ZipperGen website favicon.
It is not generated or recreated, and is used only for powered-by attribution.
