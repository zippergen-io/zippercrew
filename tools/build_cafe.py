"""Original ZipperCrew low-poly asset kit. Rebuild with Python's standard library.

Authored bevel profiles, lathed surfaces and skinned articulated meshes exported as
GLB 2.0. All coordinates are right-handed, Y-up, front +Z. No runtime primitives,
third-party model sources or external texture dependencies. Dimensions in metres.
"""

import json
import math
import struct
from pathlib import Path

from cafe_motion import CLIPS, bell, expression, sample

OUT = Path(__file__).resolve().parents[1] / "src/zippercrew/static/assets/3d"
pi = math.pi
LAYOUT = json.loads((Path(__file__).parent / "cafe_layout.json").read_text())


def station_point(role, x=0, z=0):
    spec = LAYOUT["stations"][role]
    c, s = math.cos(spec["yaw"]), math.sin(spec["yaw"])
    return (spec["seat"][0] + x * c + z * s, 0, spec["seat"][1] - x * s + z * c)


def quat(x=0, y=0, z=0):
    cx, sx, cy, sy, cz, sz = (
        math.cos(x / 2),
        math.sin(x / 2),
        math.cos(y / 2),
        math.sin(y / 2),
        math.cos(z / 2),
        math.sin(z / 2),
    )
    return [
        sx * cy * cz - cx * sy * sz,
        cx * sy * cz + sx * cy * sz,
        cx * cy * sz - sx * sy * cz,
        cx * cy * cz + sx * sy * sz,
    ]


class Asset:
    def __init__(self):
        self.doc = dict(
            asset={"version": "2.0", "generator": "ZipperCrew original café kit"},
            scenes=[{"nodes": []}],
            scene=0,
            nodes=[],
            meshes=[],
            materials=[],
            accessors=[],
            bufferViews=[],
        )
        self.data = bytearray()
        self.materials = {}

    def mat(self, name, color, metal=0, rough=0.72, glow=False):
        if name in self.materials:
            return self.materials[name]
        c = [((int(color[i : i + 2], 16) / 255 + 0.055) / 1.055) ** 2.4 for i in (0, 2, 4)]
        item = {
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorFactor": c + [1],
                "metallicFactor": metal,
                "roughnessFactor": rough,
            },
        }
        if glow:
            item["emissiveFactor"] = [v * 0.7 for v in c]
        self.doc["materials"].append(item)
        self.materials[name] = len(self.doc["materials"]) - 1
        return self.materials[name]

    def array(self, rows, typ, component=5126):
        n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[typ]
        vals = [x for row in rows for x in row] if n > 1 else rows
        while len(self.data) % 4:
            self.data.append(0)
        offset = len(self.data)
        self.data.extend(
            struct.pack("<" + {5126: "f", 5125: "I", 5123: "H"}[component] * len(vals), *vals)
        )
        self.doc["bufferViews"].append(
            {"buffer": 0, "byteOffset": offset, "byteLength": len(self.data) - offset}
        )
        a = {
            "bufferView": len(self.doc["bufferViews"]) - 1,
            "componentType": component,
            "count": len(rows),
            "type": typ,
        }
        if typ == "VEC3":
            a.update(
                min=[min(r[i] for r in rows) for i in range(3)],
                max=[max(r[i] for r in rows) for i in range(3)],
            )
        if typ == "SCALAR":
            a.update(min=[min(rows)], max=[max(rows)])
        self.doc["accessors"].append(a)
        return len(self.doc["accessors"]) - 1

    def node(self, name, pos=(0, 0, 0), parent=None, rotation=None):
        node = {"name": name, "translation": list(pos)}
        if rotation:
            node["rotation"] = rotation
        idx = len(self.doc["nodes"])
        self.doc["nodes"].append(node)
        if parent is None:
            self.doc["scenes"][0]["nodes"].append(idx)
        else:
            self.doc["nodes"][parent].setdefault("children", []).append(idx)
        return idx

    def mesh(self, name, verts, faces, mat, parent=None, bone=None, smooth=False):
        # Flat/smooth authored surfaces share the same compact triangle representation.
        p, normals, uv = [], [], []
        averaged = [[0.0, 0.0, 0.0] for _ in verts]
        if smooth:
            for ia, ib, ic in faces:
                u = [verts[ib][k] - verts[ia][k] for k in range(3)]
                v = [verts[ic][k] - verts[ia][k] for k in range(3)]
                n = [
                    u[1] * v[2] - u[2] * v[1],
                    u[2] * v[0] - u[0] * v[2],
                    u[0] * v[1] - u[1] * v[0],
                ]
                for idx in (ia, ib, ic):
                    for k in range(3):
                        averaged[idx][k] += n[k]
            averaged = [[v / (math.sqrt(sum(x * x for x in n)) or 1) for v in n] for n in averaged]
        for face in faces:
            a, b, c = [verts[i] for i in face]
            u = [b[i] - a[i] for i in range(3)]
            v = [c[i] - a[i] for i in range(3)]
            normal = [
                u[1] * v[2] - u[2] * v[1],
                u[2] * v[0] - u[0] * v[2],
                u[0] * v[1] - u[1] * v[0],
            ]
            length = math.sqrt(sum(x * x for x in normal)) or 1
            for idx, point in zip(face, (a, b, c), strict=True):
                p.append(point)
                normals.append(averaged[idx] if smooth else [x / length for x in normal])
                uv.append([point[0], point[1]])
        attrs = {
            "POSITION": self.array(p, "VEC3"),
            "NORMAL": self.array(normals, "VEC3"),
            "TEXCOORD_0": self.array(uv, "VEC2"),
        }
        if bone is not None:
            attrs.update(
                JOINTS_0=self.array([[bone, 0, 0, 0]] * len(p), "VEC4", 5123),
                WEIGHTS_0=self.array([[1, 0, 0, 0]] * len(p), "VEC4"),
            )
        self.doc["meshes"].append(
            {
                "name": name,
                "primitives": [
                    {
                        "attributes": attrs,
                        "material": mat,
                        "indices": self.array(list(range(len(p))), "SCALAR", 5123),
                    }
                ],
            }
        )
        idx = self.node(name, parent=parent)
        self.doc["nodes"][idx]["mesh"] = len(self.doc["meshes"]) - 1
        if bone is not None:
            self.doc["nodes"][idx]["skin"] = 0
        return idx

    def loft(self, name, rings, mat, parent=None, bone=None, smooth=False):
        n = len(rings[0])
        v = [p for ring in rings for p in ring]
        f = []
        for j in range(len(rings) - 1):
            for i in range(n):
                a = j * n + i
                b = j * n + (i + 1) % n
                c = b + n
                d = a + n
                f.extend([(a, c, b), (a, d, c)])
        for i in range(1, n - 1):
            f.extend(
                [
                    (0, i, i + 1),
                    ((len(rings) - 1) * n, (len(rings) - 1) * n + i + 1, (len(rings) - 1) * n + i),
                ]
            )
        return self.mesh(name, v, f, mat, parent, bone, smooth)

    def box(self, name, p, s, mat, bevel=0.07, parent=None, bone=None):
        x, y, z = p
        w, h, d = s
        r = min(bevel, w * 0.2, h * 0.2, d * 0.2)
        rings = []
        for yy, inset in [(-h / 2, r), (-h / 2 + r, 0), (h / 2 - r, 0), (h / 2, r)]:
            ring = []
            for cx, cz, start in [(1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)]:
                for j in range(4):
                    t = (start + j * 30) * pi / 180
                    ring.append(
                        (
                            x + cx * (w / 2 - r) + max(0.001, r - inset) * math.cos(t),
                            y + yy,
                            z + cz * (d / 2 - r) + max(0.001, r - inset) * math.sin(t),
                        )
                    )
            rings.append(ring)
        return self.loft(name, rings, mat, parent, bone)

    def ellipsoid(self, name, p, s, mat, parent=None, bone=None):
        rings = []
        for j in range(1, 12):
            v = -pi / 2 + j * pi / 12
            rings.append(
                [
                    (
                        p[0] + s[0] / 2 * math.cos(v) * math.cos(i * pi / 10),
                        p[1] + s[1] / 2 * math.sin(v),
                        p[2] + s[2] / 2 * math.cos(v) * math.sin(i * pi / 10),
                    )
                    for i in range(20)
                ]
            )
        return self.loft(name, rings, mat, parent, bone, smooth=True)

    def lathe(self, name, p, profile, mat, parent=None, bone=None, n=24):
        return self.loft(
            name,
            [
                [
                    (
                        p[0] + r * math.cos(i * 2 * pi / n),
                        p[1] + y,
                        p[2] + r * math.sin(i * 2 * pi / n),
                    )
                    for i in range(n)
                ]
                for y, r in profile
            ],
            mat,
            parent,
            bone,
            smooth=True,
        )

    def sculpt(self, name, p, sections, mat, parent=None, bone=None):
        """An elliptical shell with an authored silhouette (height, width, depth)."""
        rings = [
            [
                (p[0] + w * math.cos(i * pi / 16), p[1] + y, p[2] + d * math.sin(i * pi / 16))
                for i in range(32)
            ]
            for y, w, d in sections
        ]
        return self.loft(name, rings, mat, parent, bone, smooth=True)

    def save(self, name):
        while len(self.data) % 4:
            self.data.append(0)
        self.doc["buffers"] = [{"byteLength": len(self.data)}]
        raw = json.dumps(self.doc, separators=(",", ":")).encode()
        while len(raw) % 4:
            raw += b" "
        result = (
            struct.pack("<III", 0x46546C67, 2, 28 + len(raw) + len(self.data))
            + struct.pack("<II", len(raw), 0x4E4F534A)
            + raw
            + struct.pack("<II", len(self.data), 0x004E4942)
            + self.data
        )
        (OUT / name).write_bytes(result)
        print(name, len(result))


def palette(a):
    return {
        k: a.mat(
            k,
            v,
            0.3 if k == "metal" else 0,
            0.42 if k == "metal" else 0.78,
            k in ("screen", "eyes"),
        )
        for k, v in dict(
            floor="bd9472",
            floorlight="caa580",
            rug="344e63",
            gold="eeb76c",
            mint="9ec8b7",
            light="ffe1a3",
            edge="344b60",
            wall="3f6674",
            cream="f4e5c9",
            wood="9e6142",
            metal="263d50",
            coral="f77d4f",
            teal="2dada7",
            plum="9670c1",
            screen="75bec3",
            eyes="b2f7e2",
            face="17313e",
            skin="c28d6d",
            hair="342d45",
            leaf="509769",
            coffee="54352c",
        ).items()
    }


def environment():
    from cafe_environment import build

    a = Asset()
    build(a, palette(a), LAYOUT, station_point, quat)


def character(role):
    a = Asset()
    m = palette(a)
    col = m[{"implementer": "coral", "reviewer": "teal", "human": "plum"}[role]]
    # Cast-only material hierarchy: satin shells, matte cloth, warm porcelain
    # faces. Environment materials deliberately stay quieter and rougher.
    for key in ("coral", "teal", "cream"):
        a.doc["materials"][m[key]]["pbrMetallicRoughness"]["roughnessFactor"] = 0.43
    m["eyes"] = a.mat("warm-display", "fff1cf", rough=0.4, glow=True)
    m["skin"] = a.mat("warm-skin", "d9a079", rough=0.83)
    m["white"] = a.mat("eye-white", "fff5df", rough=0.55)
    m["iris"] = a.mat("iris", "694735", rough=0.55)
    m["blush"] = a.mat("cheek", "cb806b", rough=0.85)
    if role == "human":
        col = a.mat("plum-overshirt", "704589", rough=0.88)
        m["hair"] = a.mat("copper-hair", "8e4232", rough=0.94)
        m["trousers"] = a.mat("ink-trousers", "353b50", rough=0.95)
    root = a.node("rig")
    # Humanoid articulated rig, rigid skinning suits hard-surface personas.
    specs = [
        ("hips", None, (0, 0.9, 0)),
        ("body", 0, (0, 0.28, 0)),
        ("head", 1, (0, 0.75, 0)),
        ("armL", 1, (-0.5, 0.37, 0)),
        ("handL", 3, (0, -0.43, 0)),
        ("armR", 1, (0.5, 0.37, 0)),
        ("handR", 5, (0, -0.43, 0)),
        ("legL", 0, (-0.24, -0.08, 0)),
        ("footL", 7, (0, -0.42, 0)),
        ("legR", 0, (0.24, -0.08, 0)),
        ("footR", 9, (0, -0.42, 0)),
    ]
    if role == "reviewer":
        specs[2] = ("head", 1, (0, 0.92, 0))
    eye_offset = {"implementer": 0.08, "reviewer": 0.09, "human": 0.12}[role]
    specs.append(("expression", 2, (0, eye_offset, 0.42)))
    face_y = {"human": 2.05, "implementer": 2.04, "reviewer": 2.25}[role]
    head_y = 2.1 if role == "reviewer" else 1.93
    specs.extend(
        [
            ("browL", 2, (-0.23, face_y + 0.19 - head_y, 0.49)),
            ("browR", 2, (0.23, face_y + 0.19 - head_y, 0.49)),
            ("mouth", 2, (0, face_y - 0.19 - head_y, 0.48)),
        ]
    )
    joints = []
    world = []
    for name, parent, p in specs:
        joints.append(a.node(name, p, root if parent is None else joints[parent]))
        world.append(list(p) if parent is None else [world[parent][i] + p[i] for i in range(3)])
    inverse = []
    for p in world:
        inverse.append([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -p[0], -p[1], -p[2], 1])
    a.doc["skins"] = [
        {
            "name": role + "-rig",
            "joints": joints,
            "skeleton": joints[0],
            "inverseBindMatrices": a.array(inverse, "MAT4"),
        }
    ]

    def box(name, p, s, mat, bone, bevel=0.1):
        if name in {"eye", "level-eye", "raised-eye", "eye-catchlight"}:
            bone = 11
        return a.box(name, p, s, mat, bevel, bone=bone)

    def ell(name, p, s, mat, bone):
        if name in {"eye", "iris", "pupil", "eye-catchlight", "eye-lid"}:
            bone = 11
        return a.ellipsoid(name, p, s, mat, bone=bone)

    def stroke(name, points, width, mat, bone):
        # Rounded, continuous expression strokes rather than tiny straight bars.
        rings = []
        for x, y, z in points:
            rings.append(
                [
                    (x, y + width * math.cos(i * pi / 4), z + width * math.sin(i * pi / 4))
                    for i in range(8)
                ]
            )
        return a.loft(name, [list(reversed(r)) for r in rings], mat, bone=bone, smooth=True)

    def display(name, p, w, h, mat):
        # Face-plane corner radius is independent of the thin panel depth.
        rings = []
        r = 0.14
        for z, inset in [(p[2] - 0.025, 0.012), (p[2] + 0.025, 0)]:
            ring = []
            for cx, cy, start in [(1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)]:
                for i in range(7):
                    angle = (start + i * 15) * pi / 180
                    ring.append(
                        (
                            p[0] + cx * (w / 2 - r) + (r - inset) * math.cos(angle),
                            p[1] + cy * (h / 2 - r) + (r - inset) * math.sin(angle),
                            z,
                        )
                    )
            rings.append(ring)
        return a.loft(name, [list(reversed(r)) for r in rings], mat, bone=2, smooth=True)

    box(
        "hip-shell",
        (0, 0.91, 0),
        (0.73, 0.34, 0.51),
        m["trousers"] if role == "human" else m["metal"],
        0,
    )
    for side, leg, foot in [(-1, 7, 8), (1, 9, 10)]:
        box(
            "trouser" if role == "human" else "leg-shell",
            (side * 0.24, 0.63, 0),
            (0.31, 0.49, 0.35),
            m["trousers"] if role == "human" else m["metal"],
            leg,
        )
        if role == "human":
            box(
                "rolled-trouser-cuff",
                (side * 0.24, 0.43, 0.015),
                (0.35, 0.14, 0.39),
                m["trousers"],
                foot,
                0.035,
            )
            ell("soft-shoe", (side * 0.24, 0.20, 0.15), (0.43, 0.32, 0.64), m["cream"], foot)
            box("high-top", (side * 0.24, 0.31, 0.02), (0.38, 0.31, 0.38), col, foot, 0.06)
            box("shoe-panel", (side * 0.24, 0.22, 0.40), (0.32, 0.19, 0.12), col, foot, 0.04)
            for y, z in [(0.31, 0.21), (0.29, 0.29)]:
                box("shoe-lace", (side * 0.24, y, z), (0.20, 0.025, 0.026), m["cream"], foot, 0.005)
        else:
            ell("knee", (side * 0.24, 0.4, 0.12), (0.28, 0.23, 0.19), col, foot)
            box("boot", (side * 0.24, 0.19, 0.15), (0.40, 0.30, 0.62), m["cream"], foot)
        box(
            "sole",
            (side * 0.24, 0.09, 0.16),
            (0.41, 0.09, 0.64),
            m["cream"] if role == "human" else col,
            foot,
            0.025,
        )
    if role == "human":
        # Young male-presenting creative lead, not the previous tidy doll-like
        # silhouette: roomy open overshirt, visible tee, loose sleeves and neck.
        ochre = a.mat("ochre-trim", "efb94f", rough=0.85)
        teal = a.mat("mustard-tee", "e5b553", rough=0.92)
        sleeve_teal = a.mat("spark-teal-sleeve", "489d9a", rough=0.92)
        sleeve_lilac = a.mat("spark-lilac-sleeve", "a597c9", rough=0.92)
        berry = a.mat("coral-patch", "cb8071", rough=0.9)
        a.sculpt(
            "loose-overshirt",
            (0, 0, 0),
            [(0.73, 0.43, 0.28), (1.01, 0.45, 0.31), (1.47, 0.48, 0.32), (1.66, 0.36, 0.24)],
            col,
            bone=1,
        )
        a.sculpt(
            "tee-front",
            (0, 0, 0.28),
            [(0.84, 0.23, 0.075), (1.39, 0.26, 0.075), (1.59, 0.20, 0.055)],
            teal,
            bone=1,
        )
        a.sculpt("neck", (0, 0, 0), [(1.55, 0.17, 0.16), (1.82, 0.17, 0.17)], m["skin"], bone=1)
        # Off-centre placket/pocket and a single broad stitched panel: readable
        # color blocking rather than decorative dots or a copied stage outfit.
        box("loose-placket", (-0.28, 1.23, 0.325), (0.09, 0.86, 0.065), col, 1, 0.015)
        box("stitched-pocket", (0.31, 1.07, 0.317), (0.25, 0.28, 0.055), berry, 1, 0.025)
        box("pocket-seam", (0.31, 1.17, 0.350), (0.17, 0.025, 0.015), col, 1, 0.005)
        box("tee-hem", (0, 0.86, 0.33), (0.44, 0.065, 0.04), ochre, 1, 0.01)
        for side in [-1, 1]:
            a.mesh(
                "open-collar",
                [(side * 0.17, 1.67, 0.25), (side * 0.36, 1.52, 0.32), (side * 0.24, 1.39, 0.356)],
                [(0, 1, 2)] if side < 0 else [(0, 2, 1)],
                col,
                bone=1,
            )
        a.sculpt(
            "uneven-shirt-tail",
            (0.32, 0, -0.04),
            [(0.59, 0.14, 0.22), (0.94, 0.17, 0.26)],
            col,
            bone=1,
        )
        for y in (1.02, 1.20, 1.38):
            ell("shirt-button", (-0.27, y, 0.365), (0.042, 0.042, 0.018), ochre, 1)
        # A longer, subtly angular face, less oversized eyes and no cosmetic
        # lashes/blush/earrings. The lopsided expression carries the spark.
        a.sculpt(
            "human-head",
            (0, 0, 0),
            [
                (1.66, 0.20, 0.20),
                (1.76, 0.32, 0.28),
                (2.01, 0.425, 0.36),
                (2.27, 0.44, 0.355),
                (2.44, 0.32, 0.27),
                (2.49, 0.19, 0.17),
            ],
            m["skin"],
            bone=2,
        )
        for x in [-0.44, 0.44]:
            ell("ear", (x, 2.055, -0.005), (0.19, 0.28, 0.17), m["skin"], 2)
        # A shaggy, uneven mop with curls, flyaways and a falling forelock.
        # Not a bob, three-point crown, red sprite haircut or celebrity hairstyle.
        ell("shag-back", (0, 2.22, -0.22), (0.94, 0.66, 0.65), m["hair"], 2)
        ell("shag-cap", (-0.03, 2.43, -0.08), (0.99, 0.40, 0.75), m["hair"], 2)
        for x, y, z, w in [
            (-0.42, 2.36, 0.11, 0.34),
            (-0.46, 2.22, -0.09, 0.26),
            (0.45, 2.37, 0.02, 0.32),
            (0.49, 2.26, -0.10, 0.24),
            (-0.29, 2.53, -0.22, 0.38),
            (0.29, 2.49, -0.25, 0.35),
        ]:
            ell("ruffled-curl", (x, y, z), (w, w * 0.85, w * 1.1), m["hair"], 2)
        locks = [
            [(-0.30, 2.38, 0.10, 0.19), (-0.46, 2.57, 0.07, 0.18), (-0.62, 2.60, 0.06, 0.025)],
            [(-0.12, 2.42, -0.05, 0.22), (-0.22, 2.71, -0.06, 0.15), (-0.36, 2.70, -0.10, 0.025)],
            [(0.09, 2.44, -0.02, 0.22), (0.15, 2.78, -0.01, 0.13), (0.29, 2.73, -0.04, 0.025)],
            [(0.30, 2.40, 0.05, 0.20), (0.44, 2.58, 0.06, 0.13), (0.58, 2.55, 0.04, 0.025)],
            [(-0.22, 2.40, 0.26, 0.17), (-0.20, 2.25, 0.36, 0.12), (-0.06, 2.22, 0.37, 0.02)],
            [(0.11, 2.45, 0.26, 0.18), (0.25, 2.38, 0.34, 0.13), (0.32, 2.27, 0.33, 0.025)],
        ]
        locks.extend(
            [
                [(-0.41, 2.29, -0.02, 0.19), (-0.70, 2.33, 0.02, 0.15), (-0.82, 2.46, 0.01, 0.012)],
                [(0.39, 2.28, -0.08, 0.18), (0.73, 2.21, 0.01, 0.11), (0.78, 2.37, 0.04, 0.012)],
                [
                    (0.04, 2.52, -0.14, 0.15),
                    (-0.08, 2.90, -0.12, 0.10),
                    (-0.29, 2.92, -0.08, 0.012),
                ],
            ]
        )
        for sections in locks:
            # Quadratic curved locks use a local frame perpendicular to the
            # centreline, so a falling fringe stays a curl instead of a flat fan.
            rings = []
            for step in range(13):
                t = step / 12
                q = [
                    (1 - t) ** 2 * sections[0][k]
                    + 2 * t * (1 - t) * sections[1][k]
                    + t * t * sections[2][k]
                    for k in range(4)
                ]
                tangent = [
                    2 * (1 - t) * (sections[1][k] - sections[0][k])
                    + 2 * t * (sections[2][k] - sections[1][k])
                    for k in range(3)
                ]
                length = math.sqrt(sum(v * v for v in tangent)) or 1
                tangent = [v / length for v in tangent]
                # Side vector in XY; the other side completes the local frame.
                side = [tangent[1], -tangent[0], 0]
                length = math.sqrt(sum(v * v for v in side)) or 1
                side = [v / length for v in side]
                up = [
                    tangent[1] * side[2] - tangent[2] * side[1],
                    tangent[2] * side[0] - tangent[0] * side[2],
                    tangent[0] * side[1] - tangent[1] * side[0],
                ]
                rings.append(
                    [
                        tuple(
                            q[k]
                            + q[3]
                            * (
                                side[k] * math.cos(i * pi / 10)
                                - up[k] * 0.8 * math.sin(i * pi / 10)
                            )
                            for k in range(3)
                        )
                        for i in range(20)
                    ]
                )
            a.loft("tousled-lock", rings, m["hair"], bone=2, smooth=True)
        rings = []
        for i in range(29):
            theta = -0.7 + i / 28 * 5.0
            radius = 0.13 * (1 - 0.45 * i / 28)
            x, y = -0.53 + radius * math.cos(theta), 2.72 + radius * math.sin(theta)
            width = 0.045 * (1 - 0.8 * i / 28)
            rings.append(
                [
                    (
                        x + width * math.cos(k * pi / 6) * math.cos(theta),
                        y + width * math.cos(k * pi / 6) * math.sin(theta),
                        0.03 + width * math.sin(k * pi / 6),
                    )
                    for k in range(12)
                ]
            )
        a.loft("listening-curl", rings, m["hair"], bone=2, smooth=True)
        ell("listening-earpiece", (-0.485, 2.065, 0.025), (0.075, 0.17, 0.115), m["teal"], 2)
        for x, bone in [(-0.20, 12), (0.20, 13)]:
            ell("eye", (x, 2.09, 0.329), (0.21, 0.14, 0.05), m["white"], 11)
            ell("iris", (x + 0.014, 2.081, 0.36), (0.105, 0.12, 0.023), m["iris"], 11)
            ell("pupil", (x + 0.014, 2.085, 0.375), (0.06, 0.082, 0.016), m["hair"], 11)
            ell("eye-catchlight", (x - 0.005, 2.109, 0.385), (0.03, 0.03, 0.01), m["white"], 11)
            stroke(
                "expressive-brow",
                [
                    (x - 0.12, 2.22, 0.331),
                    (x - 0.015, 2.28 if x > 0 else 2.245, 0.356),
                    (x + 0.10, 2.265 if x > 0 else 2.23, 0.335),
                ],
                0.027,
                m["hair"],
                bone,
            )
        ell("nose", (0.008, 1.995, 0.351), (0.15, 0.19, 0.17), m["skin"], 2)
        mouth = a.mat("smile-line", "824d3f", rough=0.9)
        stroke(
            "crooked-smile",
            [
                (-0.14, 1.877, 0.305),
                (-0.06, 1.851, 0.323),
                (0.05, 1.872, 0.33),
                (0.16, 1.929, 0.309),
            ],
            0.015,
            mouth,
            14,
        )
        for x, y in [(-0.28, 1.99), (-0.23, 1.977), (0.26, 1.99)]:
            ell("freckle", (x, y, 0.308), (0.022, 0.017, 0.012), mouth, 2)
    else:
        if role == "implementer":
            a.sculpt(
                "builder-shell",
                (0, 0, 0),
                [(0.89, 0.35, 0.25), (1.0, 0.45, 0.34), (1.43, 0.55, 0.37), (1.63, 0.43, 0.30)],
                col,
                bone=1,
            )
            box("utility-belt", (0, 0.96, 0.20), (0.79, 0.13, 0.35), m["wood"], 0, 0.04)
            for x in [-0.31, 0.31]:
                box("belt-pocket", (x, 0.98, 0.40), (0.22, 0.21, 0.12), m["gold"], 0, 0.04)
            box("chest-badge", (0.32, 1.46, 0.35), (0.17, 0.16, 0.07), m["gold"], 1, 0.04)
            for z in [-0.16, 0, 0.16]:
                box("back-vent", (0, 1.25 + z, -0.37), (0.52, 0.042, 0.03), m["metal"], 1, 0.01)
            box("chest-inset", (0, 1.3, 0.354), (0.51, 0.29, 0.05), m["cream"], 1)
            headY = 1.99
            a.sculpt(
                "wide-head",
                (0, 0, 0),
                [(1.56, 0.40, 0.30), (1.65, 0.64, 0.40), (2.27, 0.70, 0.45), (2.48, 0.48, 0.32)],
                m["cream"],
                bone=2,
            )
            display("face-display", (0, headY + 0.025, 0.468), 1.12, 0.69, m["face"])
            for x, bone in [(-0.26, 12), (0.26, 13)]:
                ell("eye", (x, 2.035, 0.502), (0.245, 0.28, 0.035), m["eyes"], 11)
                stroke(
                    "builder-brow",
                    [(x - 0.10, 2.255, 0.504), (x, 2.295, 0.506), (x + 0.10, 2.255, 0.504)],
                    0.025,
                    m["eyes"],
                    bone,
                )
            stroke(
                "builder-smile",
                [
                    (-0.14, 1.863, 0.50),
                    (-0.07, 1.815, 0.51),
                    (0, 1.806, 0.512),
                    (0.07, 1.815, 0.51),
                    (0.14, 1.863, 0.50),
                ],
                0.021,
                m["eyes"],
                14,
            )
            box("forehead-stripe", (0.19, 2.438, 0.06), (0.22, 0.072, 0.53), col, 2, 0.025)
            for x in [-0.66, 0.66]:
                ell("headphone", (x, 2.00, -0.02), (0.26, 0.55, 0.52), m["metal"], 2)
                ell("ear-accent", (x * 1.1, 2, -0.01), (0.16, 0.38, 0.37), col, 2)
            box("headband", (0, 2.44, -0.07), (1.30, 0.13, 0.27), m["metal"], 2)
            a.lathe(
                "antenna", (0.35, 2.45, -0.06), [(0, 0.025), (0.27, 0.025)], m["metal"], bone=2, n=8
            )
            ell("antenna-tip", (0.35, 2.74, -0.06), (0.13, 0.13, 0.13), col, 2)
        else:
            # Narrow waist, broad high collar, asymmetric scanner: distinct silhouette.
            a.loft(
                "reviewer-shell",
                [
                    [(x * w, y, z * d) for x, z in [(-1, -1), (-1, 1), (1, 1), (1, -1)]]
                    for y, w, d in [(1, 0.29, 0.26), (1.5, 0.42, 0.31), (1.64, 0.35, 0.28)]
                ],
                col,
                bone=1,
            )
            box("high-collar", (0, 1.65, 0), (0.9, 0.16, 0.65), m["cream"], 1)
            a.sculpt(
                "tall-head",
                (0, 0, 0),
                [(1.71, 0.18, 0.21), (1.9, 0.34, 0.31), (2.44, 0.57, 0.38), (2.64, 0.48, 0.30)],
                col,
                bone=2,
            )
            a.sculpt(
                "porcelain-chin",
                (0, 0, 0.24),
                [(1.72, 0.09, 0.06), (1.91, 0.25, 0.12), (2.12, 0.39, 0.12)],
                m["cream"],
                bone=2,
            )
            for x in [-0.2, 0, 0.2]:
                box("back-panel", (x, 2.20, -0.365), (0.045, 0.33, 0.026), m["metal"], 2, 0.01)
            box("analyst-insignia", (0, 1.36, 0.32), (0.26, 0.30, 0.035), m["gold"], 1, 0.04)
            display("visor", (0, 2.29, 0.406), 1.02, 0.46, m["face"])
            for x, bone, lift in [(-0.23, 12, 0), (0.23, 13, 0.04)]:
                ell("eye", (x, 2.25 + lift, 0.433), (0.245, 0.19, 0.028), m["eyes"], 11)
                ell(
                    "eye-lid",
                    (x, 2.37 + lift, 0.453),
                    (0.26, 0.13 if bone == 12 else 0.07, 0.025),
                    m["face"],
                    11,
                )
                stroke(
                    "analyst-brow",
                    [
                        (x - 0.12, 2.435 + lift, 0.436),
                        (x, 2.45 + lift, 0.445),
                        (x + 0.1, 2.43 + lift, 0.436),
                    ],
                    0.023,
                    m["cream"],
                    bone,
                )
            box("scanner", (0.58, 2.28, -0.05), (0.14, 0.40, 0.32), m["metal"], 2)
            a.sculpt(
                "crest",
                (-0.18, 0, -0.17),
                [(2.52, 0.10, 0.18), (2.70, 0.10, 0.14), (2.83, 0.035, 0.06)],
                m["cream"],
                bone=2,
            )
            stroke(
                "analyst-smile",
                [(-0.07, 2.106, 0.397), (0, 2.097, 0.40), (0.12, 2.125, 0.397)],
                0.014,
                m["face"],
                14,
            )
    for side, arm, hand in [(-1, 3, 4), (1, 5, 6)]:
        ell(
            "shoulder",
            (side * 0.51, 1.50, 0),
            (0.34, 0.31, 0.34) if role == "human" else (0.40, 0.39, 0.42),
            col,
            arm,
        )
        if role == "human":
            a.sculpt(
                "loose-sleeve",
                (side * 0.53, 0, 0.01),
                [(0.98, 0.16, 0.17), (1.14, 0.18, 0.19), (1.45, 0.15, 0.16)],
                sleeve_teal if side < 0 else sleeve_lilac,
                bone=arm,
            )
        else:
            box("forearm", (side * 0.53, 1.14, 0.01), (0.28, 0.49, 0.30), col, arm)
        box(
            "cuff",
            (side * 0.53, 0.99, 0.01),
            (0.31, 0.12, 0.33),
            (sleeve_teal if side < 0 else sleeve_lilac) if role == "human" else m["cream"],
            arm,
            0.03,
        )
        ell(
            "hand",
            (side * 0.53, 0.87, 0.06),
            (0.29, 0.31, 0.22) if role == "human" else (0.35, 0.33, 0.37),
            m["skin"] if role == "human" else m["cream"],
            hand,
        )
        ell(
            "thumb",
            (side * 0.70, 0.91, 0.16),
            (0.15, 0.20, 0.19),
            m["skin"] if role == "human" else m["cream"],
            hand,
        )
        if role == "human":
            for offset, length in [(-0.075, 0.16), (0, 0.20), (0.075, 0.17)]:
                ell(
                    "gesture-finger",
                    (side * 0.53 + offset, 0.735, 0.075),
                    (0.082, length, 0.125),
                    m["skin"],
                    hand,
                )
    if role == "reviewer":
        box("review-pad", (-0.49, 1.0, 0.29), (0.57, 0.75, 0.065), m["metal"], 4, 0.04)
        box("review-pad-screen", (-0.49, 1.0, 0.331), (0.47, 0.62, 0.012), m["screen"], 4, 0.01)
    if role == "human":
        paper = a.mat("score-paper", "f4dda0", rough=0.98)
        cover = a.mat("score-cover", "dda936", rough=0.88)
        for x, z in [(0.36, 0.25), (0.70, 0.27)]:
            box("score-cover", (x, 1.0, z), (0.34, 0.51, 0.055), cover, 6, 0.025)
            box("score-pages", (x, 1.0, z + 0.035), (0.30, 0.46, 0.012), paper, 6, 0.01)
        for x, y in [(0.3, 1.10), (0.72, 1.10), (0.6, 0.90)]:
            box("score-crew-tile", (x, y, 0.318), (0.09, 0.07, 0.008), col, 6, 0.008)
        box("score-pencil", (0.87, 1.02, 0.28), (0.035, 0.55, 0.035), sleeve_teal, 6, 0.008)
    # Clips have identical channel sets, enabling clean weighted blending.
    a.doc["animations"] = []
    for clip, duration in CLIPS.items():
        duration *= {"implementer": 0.92, "reviewer": 1.12, "human": 1.04}[role]
        frames = max(24, round(duration * 24))
        times = [duration * i / frames for i in range(frames + 1)]
        sampler, channels = [], []
        time = a.array(times, "SCALAR")
        for j, (_, _parent, base) in enumerate(specs):
            rotations, translations, scales = [], [], []
            for i in range(frames + 1):
                angles, position = sample(role, clip, j, base, i / frames)
                rotations.append(quat(*angles))
                translations.append(position)
                blink = 1 - 0.93 * max(bell(i / frames, 0.43, 0.46), bell(i / frames, 0.86, 0.89))
                facial_scale = expression(role, clip, i / frames)
                scales.append([1, blink * facial_scale if j == 11 else 1, 1])
            for path, values, typ in [
                ("rotation", rotations, "VEC4"),
                ("translation", translations, "VEC3"),
                ("scale", scales, "VEC3"),
            ]:
                sampler.append(
                    {"input": time, "output": a.array(values, typ), "interpolation": "LINEAR"}
                )
                channels.append(
                    {"sampler": len(sampler) - 1, "target": {"node": joints[j], "path": path}}
                )
        a.doc["animations"].append({"name": clip, "samplers": sampler, "channels": channels})
    a.save(role + ".glb")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "layout.js").write_text(
        "// Generated from tools/cafe_layout.json by build_cafe.py.\nexport const LAYOUT = "
        + json.dumps(LAYOUT)
        + ";\n"
    )
    environment()
    for role in ("implementer", "reviewer", "human"):
        character(role)
