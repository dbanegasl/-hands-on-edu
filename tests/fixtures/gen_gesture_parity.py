"""
Regenerate tests/fixtures/gesture_parity.json (Python is the reference).

    docker compose exec hands-on-edu python -m tests.fixtures.gen_gesture_parity

The JSON is consumed by tests/test_gesture_parity.py (Python must still match)
and tests/js/ho-hands.test.cjs (the browser port must match too).
"""
import json
import random
from pathlib import Path

from tests.conftest import make_hand  # noqa: E402 — also patches MediaPipe

from app.core.hand_tracker import GestureSmoother, HandTracker, finger_states

OUT = Path(__file__).with_name("gesture_parity.json")
SHAPES = {
    "fist": {}, "thumbs_up": {"thumb": True}, "pointing": {"extended": ["index"]},
    "peace": {"extended": ["index", "middle"]}, "shaka": {"extended": ["pinky"], "thumb": True},
    "open_hand": {"extended": ["index", "middle", "ring", "pinky"], "thumb": True},
    "four": {"extended": ["index", "middle", "ring", "pinky"]},
    "three": {"extended": ["index", "middle", "ring"]},
    "i_love_you": {"extended": ["index", "pinky"], "thumb": True},
    "ok": {"extended": ["middle", "ring", "pinky"], "ok": True},
}


def _pts(lms):
    return [[round(p.x, 6), round(p.y, 6), round(p.z, 6)] for p in lms]


def build() -> dict:
    rng = random.Random(42)
    cases = []
    for name, kw in SHAPES.items():
        for rot in (0, 37, 90, 180, 270):
            lms = make_hand(rotation_deg=rot, **kw)
            cases.append({"name": f"{name}@{rot}", "landmarks": _pts(lms)})
    # Jittered hands exercise threshold edges.
    for i in range(40):
        kw = SHAPES[rng.choice(sorted(SHAPES))]
        lms = make_hand(rotation_deg=rng.uniform(0, 360), scale=rng.uniform(0.08, 0.3), **kw)
        for p in lms:
            p.x += rng.gauss(0, 0.006)
            p.y += rng.gauss(0, 0.006)
        cases.append({"name": f"jitter{i}", "landmarks": _pts(lms)})

    class P:  # landmark stand-in rebuilt from the rounded JSON values
        def __init__(self, x, y, z):
            self.x, self.y, self.z = x, y, z

    for c in cases:
        lms = [P(*xyz) for xyz in c["landmarks"]]
        c["fingers"] = finger_states(lms)
        c["gesture"] = HandTracker.detect_gesture(lms)

    seq = [rng.choice(["fist", "peace", "open_hand", "pointing"]) for _ in range(60)]
    counts = [rng.randint(0, 5) for _ in range(60)]
    sm = GestureSmoother()
    smoothed = [list(sm.smooth("Right", g, n)) for g, n in zip(seq, counts)]
    return {"cases": cases, "smoother": {"gestures": seq, "counts": counts, "expected": smoothed}}


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), separators=(",", ":")))
    print(f"wrote {OUT}")
