"""Window Studio: restrained geometry, shared with the navigation layout."""


def build(a, m, layout, station_point, quat):
    # Keep cast materials untouched; the room has its own quiet palette.
    oak = a.mat("studio-ash", "d8b58b", rough=0.86)
    ivory = a.mat("studio-plaster", "ebe7df", rough=0.96)
    floor = a.mat("studio-floor", "c5c1b7", rough=0.94)
    cloth = a.mat("studio-upholstery", "dcd7cb", rough=0.98)
    metal = a.mat("studio-graphite", "525a60", rough=0.65)
    # A quiet sky beyond the window keeps attention on the crew.
    # It is outside the navigable level and never casts onto the interior.
    exterior = a.node("window-exterior")
    sky = a.mat("window-sky", "c9dfe5", rough=1, glow=True)
    a.box("sky-distance", (-3, 3, -16), (28, 24, 0.12), sky, 0.02, exterior)
    a.box("level-foundation", (0, -0.2, 0.8), (15.4, 0.4, 12), floor, 0.1)
    a.box("warm-floor", (0, 0.005, 0.8), (15, 0.1, 11.6), floor, 0.02)
    # A genuine opening: window frame and sill cast light boundaries on the cast.
    a.box("window-sill-wall", (-3.4, 0.6, -5), (7.2, 1.2, 0.25), ivory)
    a.box("window-top", (-3.4, 4.65, -5), (7.2, 0.30, 0.26), ivory)
    for x in (-7, -3.5, 0.2):
        a.box("window-upright", (x, 2.95, -5), (0.13, 3.5, 0.24), metal, 0.02)
    a.box("window-sill", (-3.4, 1.24, -4.87), (7.25, 0.13, 0.45), oak, 0.035)
    a.box("back-wall", (3.65, 2.4, -5), (6.8, 4.8, 0.25), ivory)
    a.box("left-return", (-7.25, 2.4, -3.8), (0.20, 4.8, 2.4), ivory)
    a.box("back-skirting", (0, 0.15, -4.83), (14.4, 0.22, 0.11), oak, 0.01)

    counter_spec = next(o for o in layout["fixed"] if o["id"] == "counter")
    x, z = counter_spec["center"]
    counter = a.node("coffee-counter", (x, 0, z))
    a.box("counter-body", (0, 0.70, 0), (3.1, 1.4, 1.2), ivory, 0.055, counter)
    a.box("counter-top", (0, 1.45, 0), (3.3, 0.14, 1.36), oak, 0.04, counter)
    for x in (-0.77, 0.77):
        a.box("cabinet-door", (x, 0.74, 0.61), (1.48, 1.22, 0.035), ivory, 0.02, counter)
        a.box("cabinet-pull", (x, 1.23, 0.65), (0.40, 0.03, 0.035), metal, 0.008, counter)
    # Architectural recess rather than a colorful decorative café bay.
    a.box("coffee-niche-back", (0, 2.6, -0.73), (3.5, 2.45, 0.09), oak, 0.02, counter)
    for x in (-1.7, 1.7):
        a.box("coffee-niche-side", (x, 2.55, -0.13), (0.12, 2.4, 1.25), oak, 0.02, counter)
    a.box("coffee-niche-top", (0, 3.8, -0.13), (3.5, 0.12, 1.25), oak, 0.02, counter)
    a.box("machine", (-0.32, 1.98, -0.03), (1.12, 0.93, 0.72), metal, 0.09, counter)
    a.box("machine-front", (-0.32, 2.16, 0.36), (1.0, 0.35, 0.06), ivory, 0.035, counter)
    a.box("machine-tray", (-0.32, 1.57, 0.36), (1.12, 0.08, 0.52), metal, 0.025, counter)
    for x in (-0.6, -0.1):
        a.ellipsoid("machine-control", (x, 2.16, 0.42), (0.11, 0.11, 0.06), metal, counter)
        a.box("coffee-spout", (x, 1.94, 0.45), (0.10, 0.17, 0.16), metal, 0.02, counter)
    for x in (0.6, 1.03):
        a.lathe("cup", (x, 1.53, 0.28), [(0, 0.12), (0.24, 0.15), (0.26, 0.14)], ivory, counter)

    bx, by, bz = layout["board"]["position"]
    a.box("brief-frame", (bx, by, bz - 0.07), (2.5, 1.7, 0.10), oak, 0.06)
    a.box("brief-surface", (bx, by, bz), (2.36, 1.56, 0.025), ivory, 0.02)

    for role, prefix in (("Implementer", "coral"), ("Reviewer", "teal")):
        yaw = layout["stations"][role]["yaw"]
        desk = a.node(prefix + "-station", station_point(role, 0, -1.33), rotation=quat(y=yaw))
        a.box("desk-top", (0, 1.24, -0.35), (2.75, 0.16, 1.65), oak, 0.09, desk)
        for x in (-1.18, 1.18):
            for z in (-0.98, 0.28):
                a.box("desk-leg", (x, 0.62, z), (0.10, 1.18, 0.10), metal, 0.02, desk)
            a.box("desk-foot", (x, 0.08, -0.35), (0.11, 0.10, 1.40), metal, 0.02, desk)
        a.box("monitor-foot", (0, 1.37, -0.76), (0.64, 0.08, 0.38), metal, 0.03, desk)
        a.box("monitor-arm", (0, 1.63, -0.87), (0.10, 0.48, 0.12), metal, 0.02, desk)
        a.box("monitor-body", (0, 2.01, -0.90), (1.45, 0.87, 0.12), metal, 0.06, desk)
        a.box("monitor-screen", (0, 2.01, -0.82), (1.30, 0.71, 0.025), m["face"], 0.02, desk)
        for i in range(4):
            a.box(
                "screen-code",
                (-0.12, 2.23 - i * 0.13, -0.801),
                (0.68 + (i % 2) * 0.18, 0.024, 0.012),
                m["screen"],
                0.003,
                desk,
            )
        a.box("keyboard", (0, 1.35, 0.30), (0.93, 0.07, 0.30), metal, 0.025, desk)
        for j in range(3):
            for i in range(8):
                a.box(
                    "key",
                    (-0.35 + i * 0.1, 1.389, 0.20 + j * 0.09),
                    (0.068, 0.01, 0.055),
                    ivory,
                    0.002,
                    desk,
                )
        a.lathe("desk-mug", (1, 1.34, 0.07), [(0, 0.11), (0.23, 0.14)], ivory, desk)
        chair = a.node(prefix + "-chair", station_point(role), rotation=quat(y=yaw))
        a.lathe(
            "chair-base",
            (0, 0, 0),
            [(0.06, 0.48), (0.12, 0.49), (0.17, 0.09), (0.62, 0.09)],
            metal,
            chair,
        )
        a.box("chair-cushion", (0, 0.69, 0), (1.03, 0.21, 0.91), cloth, 0.10, chair)
        a.box("chair-back", (0, 1.1, 0.49), (1.02, 0.91, 0.16), oak, 0.10, chair)
        a.box("chair-footrest", (0, 0.37, -0.54), (0.87, 0.10, 0.48), metal, 0.04, chair)

    # Fixed window bench: front entry, never animated as a rolling office chair.
    human = layout["stations"]["Human"]
    bench = a.node("human-chair", station_point("Human"), rotation=quat(y=human["yaw"]))
    a.box("window-bench-base", (0, 0.34, 0.10), (2.85, 0.58, 1.15), oak, 0.055, bench)
    a.box("window-bench-cushion", (0, 0.69, 0.04), (2.83, 0.20, 1.18), cloth, 0.08, bench)
    a.box("window-bench-back", (0, 1.07, 0.60), (2.85, 0.80, 0.12), oak, 0.06, bench)
    table = a.node(
        "human-table",
        station_point("Human", human["tableX"], -layout["tableOffset"]),
        rotation=quat(y=human["yaw"]),
    )
    a.lathe("table-top", (0, 0, 0), [(1.13, 0.86), (1.18, 0.94), (1.29, 0.94)], oak, table)
    a.lathe(
        "table-pedestal",
        (0, 0, 0),
        [(0.05, 0.48), (0.12, 0.5), (0.16, 0.09), (1.17, 0.09)],
        metal,
        table,
    )
    a.box("human-laptop", (0, 1.54, -0.18), (0.78, 0.46, 0.05), metal, 0.025, table)
    a.box("laptop-display", (0, 1.54, -0.144), (0.67, 0.36, 0.012), m["screen"], 0.015, table)
    a.box("human-keyboard", (0, 1.32, 0.03), (0.78, 0.035, 0.4), metal, 0.02, table)
    a.save("corner-cafe.glb")
