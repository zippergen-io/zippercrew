# Inhabited studio — production Phaser art

This is the new production Room, not the previous pseudo-realistic Phaser café.
A calm repeated window bay supports large ink-outlined cast sprites, shallow
furniture layers, an informal Human perch, and a small coffee point. No carpet,
procedural office illustration, SVG cast, 3D model renders or external art pack.
The Spark concept supplies Human's hair/clothing/personality; the two robot roles
retain coral/teal identity with distinct silhouettes and readable expressions.

The six original PNG assets were authored with the built-in image-generation tool
for this migration. Exact prompts and source filenames are in [prompts.json](prompts.json).
No franchise or celebrity reference asset was used. Production copies live in
`src/zippercrew/static/assets/dollhouse/`. Transparent source sheets are preserved
unchanged; `tools/index_dollhouse.py` reads their alpha to write atlas metadata.
Pillow is needed only if regenerating metadata (`uv run --with pillow python
tools/index_dollhouse.py`), not to run ZipperCrew.

Each character sheet supplies eight poses: idle, two walk poses, two seated
work/read poses, coffee, receive/attention and completed. Phaser adds gentle
transforms and state-based frame changes. This first atlas is deliberately small;
longer walk cycles and additional facial in-betweens can improve animation later
without changing semantic state or the asset contract.

Furniture is split into individual sprites. Chair, character and front desk are
separate depth layers. The message atlas is reserved for actual protocol sends;
local activity remains a short anchored DOM bubble.

## Actual application captures

- [Ready](ready.png)
- [Implementing](working.png)
- [Reviewing](reviewing.png)
- [Human decision](human-decision.png)
- [Completed real Codex/Claude run](completed-real-run.png)

These captures are from the production page and a real two-round Pair Programming
run in an isolated source repository. They are not generated target mockups.

## Preservation

The complete pre-migration Babylon product is preserved by commit `078f566` and
tag `archive/babylon-window-studio-2026-10-06`. Its development assets are not
loaded by the production page or included in the application wheel.
