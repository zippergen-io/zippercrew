# Workstation and lighting refinement

Generated using the built-in imagegen tool. Original v2/v3 assets remain available;
the environment and character identities are unchanged. Selected production files:

- `src/zippercrew/static/assets/corner-cafe/workstations-v4.png`
- `src/zippercrew/static/assets/characters/reviewer-v3.png`

## Desk edit prompt

Use case: precise-object-edit. Production transparent furniture atlas, two desks
side by side, same size and lighting. Preserve original light oak wood, black metal
legs, dark modern monitor, small teal notebook only on right desk. Correct the
ENTIRE workstation orientation: rotate the wooden desk surface AND leg geometry a
quarter turn in its floor plane relative to the reference, not just the screens.
The long width axis of each tabletop must slope from lower LEFT to upper RIGHT in
the image (NE-SW), rather than the current upper left to lower right axis. Camera
remains elevated three-quarter front. The sitter will be just beyond the upper-left
long edge, facing diagonally down-right toward the monitor on the opposite
lower-right long edge. Leave that upper-left edge free of objects for their hands.
Monitor stands on the lower-right far edge and faces diagonally upper-left toward
that sitter. Viewer sees the dark monitor back. Ensure desk is visibly wider along
NE-SW than along NW-SE: long edges rise sharply toward the right; short edges fall
toward the right. Both desks identical orientation, separated with generous
transparent gutter, completely isolated transparent background; no characters, no
chair, no floor, no baked floor shadow, no labels. This is a geometry correction,
not a redesign. Crisp grounded game prop rendering, window light from upper left.

## Reviewer pose prompt

Use case: identity-preserve. Generate exactly ONE isolated full-body working pose
of the teal Reviewer robot shown in this atlas. Preserve EXACT character identity:
tall teal shield-shaped head with ivory angular face, black narrow eye visor and
skeptical eyes, slender teal torso and ivory chest, teal flared boots, black
articulated hands. Same elevated three-quarter camera, same crisp rendering and
light from upper left. The new pose is SEATED at a desk that will be composited
separately: hips bent, thighs forward, knees bent, boots down below knees, leaning
forward slightly, torso upright, facing diagonally down-right in the image; a thin
tablet held low and forward with left hand, annotating with stylus in right hand.
Tablet at working-desk hand height, not held against chest. Do NOT include desk,
chair, floor, shadow or any other object. Keep full silhouette and feet within
generous transparent margins. Not a redesign, not a sheet: one coherent seated
reading/annotation pose of this exact Reviewer, expressive composed concentration.

## Final atlas edit prompt

Use case: compositing. Image 1 is the edit target: existing three-by-three Reviewer
animation atlas. Image 2 is the replacement seated working pose. Change ONLY the
top-middle cell in image 1: replace standing tablet Reviewer with seated Reviewer
from image 2, scaled so its head and torso are the same physical size as the
surrounding atlas characters. Seated silhouette is shorter overall than standing
poses; do NOT enlarge its head to fill the cell. Feet anchored to same cell baseline,
silhouette centrally aligned. Preserve all eight other poses, exact character
identity, shading, positions and equal three-by-three grid. Keep all characters
fully isolated with genuinely transparent alpha, no colored ambient glow outside
silhouettes, no floor or shadow or text, no new props. Final is square atlas,
3 columns and 3 rows, generous transparent padding between cells.

## Runtime integration

Chair facing, feet anchor, seated frame, work surface and approach route are authored
together in `ROLES`. `surfaces.js` holds the fixed environment receiving masks,
matching furniture floor shadows and counter occluder. These are deliberately
approximate 2.5D surfaces, not a physical lighting engine. Contact shadows and
character cast shadows stay separate from received illumination. Masks follow
scene coordinates, not sprite coordinates, and are clipped to the current pose's
alpha; walking, leaning and turning therefore cross the same lighting boundaries.

The brief uses a deterministic chalk-grain texture projected with a homography
onto the board's four corners. It is rendered in the Phaser Canvas scene; the DOM
retains only the keyboard-accessible edit target and the conventional editor.
