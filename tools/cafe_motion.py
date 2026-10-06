"""Authored role-specific performance curves; cosmetic clips, never workflow state.

Each loop has deliberate holds and glances rather than identical sine-wave limbs.
All clips export identical channels so the renderer can blend them safely.
"""

import math

CLIPS = {
    "idle": 11.0,
    "idle-seated": 12.0,
    "walk": 1.1,
    "turn": 2.8,
    "sit": 0.6,
    "stand": 0.5,
    "working": 8.0,
    "reviewing": 10.0,
    "coffee": 9.0,
    "pour": 4.0,
    "look-around": 8.0,
    "receive": 0.8,
    "send": 0.8,
    "notification": 7.0,
    "attention-seated": 7.0,
    "completed": 12.0,
    "stopped": 6.0,
    "stretch": 7.0,
    "tablet": 9.0,
    "phone": 8.0,
    "thinking": 7.0,
    "skeptical": 7.0,
    "observing": 13.0,
    "decision": 1.0,
}


def bell(t, start, end):
    if not start < t < end:
        return 0.0
    return 0.5 - 0.5 * math.cos(2 * math.pi * (t - start) / (end - start))


def expression(role, clip, u):
    """Readable eyes; authored acting only, never a claim about agent thoughts."""
    if clip in {"reviewing", "tablet", "skeptical"}:
        return 0.86 - 0.16 * bell(u, 0.50, 0.85)
    if clip in {"notification", "attention-seated", "receive"}:
        return 1.12
    if clip == "completed":
        return 0.85 + 0.1 * bell(u, 0.15, 0.5)
    if clip == "working":
        return 0.93 + 0.14 * bell(u, 0.55, 0.86)
    return 1.0


def sample(role, clip, joint, base, u):
    attention_seated = clip == "attention-seated"
    if attention_seated:
        clip = "notification"
    phase = u * math.tau
    wave = math.sin(phase)
    # Deliberately different rhythms per persona, while loops remain seamless.
    energy = {"implementer": 1.0, "reviewer": 0.65, "human": 0.75}[role]
    glance = bell(u, 0.2, 0.48) - 0.7 * bell(u, 0.63, 0.94)
    breath = math.sin(phase * 2)
    rx = ry = rz = 0.0
    p = list(base)
    seated = 1.0 if clip in {"working", "reviewing", "idle-seated", "thinking"} else 0.0
    if attention_seated:
        seated = 1.0
    if clip == "sit":
        seated = u * u * (3 - 2 * u)
    if clip == "stand":
        seated = 1 - u * u * (3 - 2 * u)
    if joint == 0:
        p[1] += 0.018 * breath * energy
        p[0] += 0.028 * wave * energy if not seated else 0
        p[1] -= 0.01 * seated
        if clip == "walk":
            p[1] += 0.045 * (1 - math.cos(phase * 2))
            rz = 0.035 * wave
    if joint == 1:
        rz = 0.022 * wave * energy
        rx = 0.016 * breath
        if role == "human" and clip in {"idle", "idle-seated", "observing"}:
            ry = -0.06 + 0.09 * glance
            rx += -0.035 + 0.065 * bell(u, 0.2, 0.48)
            rz += 0.035
        if clip == "working":
            pause = bell(u, 0.55, 0.86)
            rx = 0.17 - 0.15 * pause + 0.035 * breath
            ry = 0.055 * pause
        elif clip in {"reviewing", "tablet", "skeptical"}:
            ry = 0.08 * glance
            rx = 0.045 + 0.05 * bell(u, 0.12, 0.42)
        elif clip == "stretch":
            rx = -0.16 * bell(u, 0.15, 0.8)
            rz = 0.20 * glance
        elif clip in {"coffee", "phone"}:
            rx = 0.045 * bell(u, 0.2, 0.65)
        elif clip in {"sit", "stand"}:
            rx = 0.18 * math.sin(math.pi * u)
    if joint == 2:
        ry = (0.28 if role == "implementer" else 0.21) * glance
        rx = 0.025 * breath
        rz = 0.035 * wave
        if clip == "working":
            rx = 0.12 - 0.18 * bell(u, 0.55, 0.86)
            ry = 0.12 * bell(u, 0.55, 0.86)
        elif clip in {"reviewing", "tablet", "skeptical"}:
            rx = 0.15 + 0.07 * bell(u, 0.1, 0.4)
            rz = -0.04 - 0.16 * bell(u, 0.50, 0.85)
            ry = -0.10 * bell(u, 0.5, 0.85)
        elif clip in {"look-around", "observing", "turn"}:
            ry = 0.52 * glance
        elif clip in {"notification", "phone", "decision"}:
            rx = 0.22 + 0.045 * breath
            ry = -0.14 + 0.10 * glance
            if role == "human" and clip != "phone":
                # Listen to the two sides, then focus on the score/device.
                ry = 0.30 * glance
                rx = -0.045 + 0.20 * bell(u, 0.40, 0.80) + 0.035 * breath
                rz = -0.07 * glance
        elif clip == "coffee":
            rx = -0.14 * bell(u, 0.25, 0.64)
        elif clip == "stopped":
            rx = 0.22
            ry = 0.035 * wave
        elif clip == "completed":
            rx = -0.05 + 0.08 * bell(u, 0.12, 0.42)
            rz = 0.075 * glance
        elif clip == "idle-seated" and role == "human":
            # Acknowledging the crew, then returning to his score/laptop.
            ry = 0.35 * glance
            rx = 0.08 + 0.035 * breath - 0.13 * bell(u, 0.20, 0.48)
            rz = 0.025 * wave - 0.10 * bell(u, 0.20, 0.48)
            rx += 0.045 * bell(u, 0.52, 0.65) - 0.035 * bell(u, 0.65, 0.78)
        elif clip == "idle" and role == "human":
            # A curious listening tilt with a quiet acknowledgement, not bouncing.
            rz += -0.09 * bell(u, 0.2, 0.48)
            rx += 0.06 * bell(u, 0.55, 0.72)
    if joint == 11:
        # Gaze moves within the display/eye whites by only a few millimetres.
        p[0] += 0.014 * glance
    if joint in (12, 13):
        sign = 1 if joint == 12 else -1
        rz = sign * 0.08
        if clip in {"reviewing", "tablet", "skeptical"}:
            rz += (0.12 if joint == 12 else -0.26) * bell(u, 0.48, 0.86)
            p[1] += (0.035 if joint == 13 else -0.012) * bell(u, 0.48, 0.86)
        elif clip in {"notification", "receive", "completed"}:
            p[1] += 0.025 + 0.015 * bell(u, 0.12, 0.5)
        elif clip == "working":
            rz -= sign * 0.15 * (1 - bell(u, 0.55, 0.86))
        else:
            p[1] += 0.012 * glance
        if role == "human" and clip in {"idle", "idle-seated", "observing", "completed"}:
            p[1] += (0.035 if joint == 13 else -0.006) * bell(u, 0.2, 0.48)
            rz += (0.10 if joint == 13 else 0) * bell(u, 0.2, 0.48)
    if joint == 14:
        rz = 0.035 * glance
        if role == "human":
            rz += 0.05 * bell(u, 0.2, 0.48)
        if clip == "completed":
            p[1] += 0.012 * bell(u, 0.12, 0.42)
    if joint in (7, 9):
        rx = -1.35 * seated
        if clip == "walk":
            rx = 0.54 * wave * (1 if joint == 7 else -1)
        elif not seated:
            rz = 0.016 * wave
    if joint in (8, 10):
        rx = 1.35 * seated
        if clip == "walk":
            rx = 0.15 * max(0, wave * (1 if joint == 8 else -1))
    if joint in (3, 5):
        left = joint == 3
        sign = 1 if left else -1
        rx = -0.06 + 0.035 * breath * energy
        rz = sign * 0.08 + 0.025 * wave
        if clip == "walk":
            rx = 0.42 * wave * (-1 if left else 1)
        elif clip in {"working", "thinking"}:
            pause = bell(u, 0.55, 0.86)
            typing = math.sin(phase * 16 + (0 if left else math.pi)) * (1 - pause)
            rx = -1.10 + 0.09 * typing + (0.30 if left else -0.24) * pause
            rz = sign * 0.20
        elif clip in {"reviewing", "tablet", "skeptical"}:
            rx = -0.86 if left else -0.64 - 0.32 * bell(u, 0.13, 0.35)
            rz = 0.28 if left else -0.37
            if not left:
                rx -= 0.44 * bell(u, 0.55, 0.83)
        elif clip in {"phone", "notification", "decision"}:
            if not left:
                rx = -1.10 - 0.18 * bell(u, 0.3, 0.7)
                rz = -0.35
            else:
                rx = -0.10 - 0.65 * bell(u, 0.30, 0.50)
                if role == "human" and clip != "phone":
                    # One inviting hand cue. Attention remains immediate; this
                    # authored gesture never gates the actual Human decision UI.
                    cue = bell(u, 0.08, 0.43)
                    rx = -0.45 - 0.60 * cue
                    rz = 0.18 + 0.40 * cue
        elif clip == "pour" and not left:
            rx = -1.28 - 0.18 * bell(u, 0.2, 0.75)
            ry = -0.15
            rz = -0.10
        elif clip == "coffee" and not left:
            rx = -1.05 - 0.9 * bell(u, 0.22, 0.67)
            rz = -0.22
        elif clip in {"send", "receive"} and not left:
            rx = -0.2 - 0.95 * math.sin(math.pi * u)
            rz = -0.25
        elif clip == "completed":
            rx = -0.17 - (0.24 * bell(u, 0.12, 0.42) if not left else 0)
            rz = sign * 0.12
        elif clip == "stretch":
            rz = sign * (0.10 + 1.6 * bell(u, 0.08, 0.80))
            rx = -0.12 * bell(u, 0.08, 0.80)
        elif clip == "idle-seated":
            rx = -0.75 + 0.05 * breath
            rz = sign * 0.15
            if role == "human" and left:
                rx -= 0.17 * bell(u, 0.20, 0.48)
                rz += 0.27 * bell(u, 0.20, 0.48)
        elif clip in {"idle", "observing"} and role == "human" and left:
            rx = -0.35 - 0.38 * bell(u, 0.2, 0.48)
            rz = 0.18 + 0.26 * bell(u, 0.2, 0.48)
        if role == "human" and not left and clip in {"idle", "observing", "completed"}:
            rx = -0.90 + 0.04 * breath
            rz = -0.24
    if joint in (4, 6):
        if clip == "working":
            rx = (
                0.10
                * math.sin(phase * 16 + (0 if joint == 4 else math.pi))
                * (1 - bell(u, 0.55, 0.86))
            )
        elif clip in {"reviewing", "tablet"} and joint == 6:
            rz = 0.16 * bell(u, 0.12, 0.37)
        elif clip in {"phone", "notification", "decision"} and joint == 6:
            ry = 0.12 * bell(u, 0.3, 0.5)
        if role == "human" and joint == 4:
            if clip in {"notification", "decision"}:
                rz = -0.45 * bell(u, 0.08, 0.43)
                ry = -0.65 * bell(u, 0.08, 0.43)
            elif clip == "idle-seated":
                ry = -0.42 * bell(u, 0.20, 0.48)
                rz = -0.18 * bell(u, 0.20, 0.48)
    return (rx, ry, rz), p
