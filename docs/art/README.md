# Corner Café assets

Original assets generated for ZipperCrew on 2026-10-04 with the built-in image
generation tool. No stock art, third-party character art, logos or externally
supplied visual references were used. The user brief supplied design principles
for strong silhouettes and expressive poses; the resulting crew is original.

Files live under `src/zippercrew/static/assets/`:

| File | Content | Layout |
| --- | --- | --- |
| `corner-cafe/background.png` | Café, windows, coffee bar, board, floor, lighting | 1536 × 1024 opaque background |
| `corner-cafe/furniture.png` | Three desks and three chairs | 1536 × 1024 alpha atlas; explicit regions in renderer |
| `characters/implementer.png` | Coral headphones, swept hair, maker's jacket | 1254 × 1254 alpha atlas, 3 × 3 cells |
| `characters/reviewer.png` | Silver bob, glasses, teal cardigan, tablet | Same character layout |
| `characters/human.png` | Indigo curls, plum sweater, phone | Same character layout |

Character frame order: idle, work, coffee, walk-a, walk-b, think, receive,
success, stopped. These are compact pose sheets, not full skeletal animation.
Small Phaser movements and pose changes provide the loops and transitions.

The final assets are shipped unchanged. Runtime trimming only calculates atlas
frame bounds and aligns feet. Artwork and UI text remain separate; the shared
brief is real editable application text over the board.

[Exact generation prompts](prompts.md) are retained for iteration. A first
background study was replaced by the closer, softer final scene before
integration. Furniture and character designs were visually checked together
in the standalone art fixture, then against live application states.
