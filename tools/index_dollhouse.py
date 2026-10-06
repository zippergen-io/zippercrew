"""Index authored PNGs without modifying their pixels (requires Pillow).

Explicit cells are part of the art contract. Alpha bounds remove transparent
gutters from Phaser frames; the original generated sources remain untouched.
"""

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "src/zippercrew/static/assets/dollhouse"
POSES = ["idle", "walk-a", "walk-b", "work-a", "work-b", "coffee", "receive", "completed"]


def index(name, cells):
    im = Image.open(ROOT / f"{name}.png")
    alpha = im.getchannel("A")
    frames = {}
    for label, box in cells:
        bounds = alpha.crop(box).point(lambda a: 255 if a > 40 else 0).getbbox()
        assert bounds, (name, label)
        x, y, right, bottom = bounds
        frames[label] = {
            "frame": {"x": box[0] + x, "y": box[1] + y, "w": right - x, "h": bottom - y},
            "rotated": False,
            "trimmed": False,
        }
    (ROOT / f"{name}.json").write_text(json.dumps({"frames": frames}, indent=2) + "\n")


if __name__ == "__main__":
    for name in ("human", "implementer", "reviewer"):
        index(
            name,
            [
                (pose, (i % 4 * 384, i // 4 * 512, (i % 4 + 1) * 384, (i // 4 + 1) * 512))
                for i, pose in enumerate(POSES)
            ],
        )
    index(
        "props",
        list(
            zip(
                ["desk", "chair", "laptop", "coffee", "board", "table", "perch", "shadow"],
                [
                    (0, 0, 485, 510),
                    (490, 0, 790, 510),
                    (795, 0, 1150, 510),
                    (1155, 0, 1536, 510),
                    (0, 515, 490, 1024),
                    (500, 515, 795, 1024),
                    (805, 515, 1140, 1024),
                    (1145, 515, 1536, 1024),
                ],
                strict=True,
            )
        ),
    )
    index(
        "messages",
        [
            (label, (i % 3 * 512, i // 3 * 512, (i % 3 + 1) * 512, (i // 3 + 1) * 512))
            for i, label in enumerate(
                ["task", "proposal", "review", "guidance", "control", "inbox"]
            )
        ],
    )
