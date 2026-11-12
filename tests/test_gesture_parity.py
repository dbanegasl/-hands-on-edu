"""
The browser engine (app/static/js/ho-hands.js) is a port of the Python gesture
logic. Both sides are checked against tests/fixtures/gesture_parity.json; this
file guards the Python side. If you change the heuristic on purpose, regenerate
the fixture (see tests/fixtures/gen_gesture_parity.py) and port the change to JS.
"""
import json
from pathlib import Path

import pytest

from app.core.hand_tracker import GestureSmoother, HandTracker, finger_states

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "gesture_parity.json").read_text())


class P:
    def __init__(self, x, y, z):
        self.x, self.y, self.z = x, y, z


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=lambda c: c["name"])
def test_python_matches_fixture(case):
    lms = [P(*xyz) for xyz in case["landmarks"]]
    assert finger_states(lms) == case["fingers"]
    assert HandTracker.detect_gesture(lms) == case["gesture"]


def test_smoother_matches_fixture():
    sm = GestureSmoother()
    data = FIXTURE["smoother"]
    out = [list(sm.smooth("Right", g, n)) for g, n in zip(data["gestures"], data["counts"])]
    assert out == data["expected"]


def test_fixture_covers_every_gesture():
    gestures = {c["gesture"] for c in FIXTURE["cases"]}
    assert {"fist", "thumbs_up", "pointing", "peace", "shaka", "open_hand",
            "4_fingers", "i_love_you", "ok"} <= gestures
