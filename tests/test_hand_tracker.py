"""
Unit tests for app/core/hand_tracker.py

Exercises the pure-logic methods (finger_states, count_raised_fingers,
detect_gesture, get_finger_tip) and the GestureSmoother using synthetic
landmarks — no camera, no MediaPipe model, no network required.

The gesture heuristic is orientation-invariant, so every gesture test is
parametrized across rotations: a thumbs-up tilted 90° must still read as
thumbs_up (the exact bug seen in the GestiEdu screenshot).
"""
import pytest

from app.core.hand_tracker import GestureSmoother
from tests.conftest import (
    four_fingers_landmarks,
    fist_landmarks,
    i_love_you_landmarks,
    ok_landmarks,
    open_hand_landmarks,
    peace_landmarks,
    pointing_landmarks,
    shaka_landmarks,
    three_fingers_landmarks,
    thumbs_up_landmarks,
)

ROTATIONS = [0, 45, 90, 180, 270]


# ── count_raised_fingers ──────────────────────────────────────────────────────

class TestCountRaisedFingers:
    @pytest.mark.parametrize("rot", ROTATIONS)
    def test_fist_returns_0(self, tracker, rot):
        assert tracker.count_raised_fingers(fist_landmarks(rot)) == 0

    @pytest.mark.parametrize("rot", ROTATIONS)
    def test_open_hand_returns_5(self, tracker, rot):
        assert tracker.count_raised_fingers(open_hand_landmarks(rot)) == 5

    @pytest.mark.parametrize("rot", ROTATIONS)
    def test_four_fingers_returns_4(self, tracker, rot):
        assert tracker.count_raised_fingers(four_fingers_landmarks(rot)) == 4

    @pytest.mark.parametrize("rot", ROTATIONS)
    def test_pointing_returns_1(self, tracker, rot):
        assert tracker.count_raised_fingers(pointing_landmarks(rot)) == 1

    @pytest.mark.parametrize("rot", ROTATIONS)
    def test_peace_returns_2(self, tracker, rot):
        assert tracker.count_raised_fingers(peace_landmarks(rot)) == 2

    @pytest.mark.parametrize("rot", ROTATIONS)
    def test_three_fingers_returns_3(self, tracker, rot):
        assert tracker.count_raised_fingers(three_fingers_landmarks(rot)) == 3


# ── detect_gesture (orientation-invariant) ────────────────────────────────────

class TestDetectGesture:
    @pytest.mark.parametrize("rot", ROTATIONS)
    def test_fist(self, tracker, rot):
        assert tracker.detect_gesture(fist_landmarks(rot)) == "fist"

    @pytest.mark.parametrize("rot", ROTATIONS)
    def test_thumbs_up(self, tracker, rot):
        # Regression for the GestiEdu screenshot: rotated thumbs-up was read as "2 fingers".
        assert tracker.detect_gesture(thumbs_up_landmarks(rot)) == "thumbs_up"

    @pytest.mark.parametrize("rot", ROTATIONS)
    def test_pointing(self, tracker, rot):
        assert tracker.detect_gesture(pointing_landmarks(rot)) == "pointing"

    @pytest.mark.parametrize("rot", ROTATIONS)
    def test_peace(self, tracker, rot):
        assert tracker.detect_gesture(peace_landmarks(rot)) == "peace"

    @pytest.mark.parametrize("rot", ROTATIONS)
    def test_shaka(self, tracker, rot):
        assert tracker.detect_gesture(shaka_landmarks(rot)) == "shaka"

    @pytest.mark.parametrize("rot", ROTATIONS)
    def test_open_hand(self, tracker, rot):
        assert tracker.detect_gesture(open_hand_landmarks(rot)) == "open_hand"

    @pytest.mark.parametrize("rot", ROTATIONS)
    def test_four_fingers(self, tracker, rot):
        assert tracker.detect_gesture(four_fingers_landmarks(rot)) == "4_fingers"

    @pytest.mark.parametrize("rot", ROTATIONS)
    def test_three_fingers(self, tracker, rot):
        assert tracker.detect_gesture(three_fingers_landmarks(rot)) == "3_fingers"

    @pytest.mark.parametrize("rot", ROTATIONS)
    def test_i_love_you(self, tracker, rot):
        assert tracker.detect_gesture(i_love_you_landmarks(rot)) == "i_love_you"

    @pytest.mark.parametrize("rot", ROTATIONS)
    def test_ok(self, tracker, rot):
        assert tracker.detect_gesture(ok_landmarks(rot)) == "ok"


# ── GestureSmoother ───────────────────────────────────────────────────────────

class TestGestureSmoother:
    def test_single_noisy_frame_is_absorbed(self):
        """[A,A,B,A,A] → B is a minority, smoother keeps emitting A."""
        s = GestureSmoother(window=5, min_votes=3)
        seq = ["pointing", "pointing", "peace", "pointing", "pointing"]
        out = [s.smooth("Right", g, 1)[0] for g in seq]
        assert out == ["pointing"] * 5

    def test_sustained_change_flips_on_third_vote(self):
        """A sustained new gesture takes over once it reaches min_votes."""
        s = GestureSmoother(window=5, min_votes=3)
        s.smooth("Right", "fist", 0)
        s.smooth("Right", "peace", 2)
        s.smooth("Right", "peace", 2)
        g, _ = s.smooth("Right", "peace", 2)  # third 'peace' → majority
        assert g == "peace"

    def test_hands_are_smoothed_independently(self):
        s = GestureSmoother(window=5, min_votes=3)
        for _ in range(3):
            s.smooth("Left", "fist", 0)
            s.smooth("Right", "open_hand", 5)
        assert s.smooth("Left", "fist", 0)[0] == "fist"
        assert s.smooth("Right", "open_hand", 5)[0] == "open_hand"

    def test_finger_count_uses_median(self):
        s = GestureSmoother(window=5, min_votes=3)
        counts = [5, 5, 0, 5, 5]  # one dropout frame
        out = [s.smooth("Right", "open_hand", c)[1] for c in counts]
        assert out[-1] == 5


# ── get_finger_tip ────────────────────────────────────────────────────────────

class TestGetFingerTip:
    def test_center_640x480(self, tracker):
        from tests.conftest import _lms
        lms = _lms({8: (0.5, 0.5, 0)})
        x, y = tracker.get_finger_tip(lms, finger=8, width=640, height=480)
        assert (x, y) == (320, 240)

    def test_bottom_right_corner(self, tracker):
        from tests.conftest import _lms
        lms = _lms({4: (1.0, 1.0, 0)})
        x, y = tracker.get_finger_tip(lms, finger=4, width=640, height=480)
        assert (x, y) == (640, 480)

    def test_custom_resolution_1280x720(self, tracker):
        from tests.conftest import _lms
        lms = _lms({4: (0.5, 0.5, 0)})
        x, y = tracker.get_finger_tip(lms, finger=4, width=1280, height=720)
        assert (x, y) == (640, 360)

    def test_default_finger_is_index_tip(self, tracker):
        from app.core.hand_tracker import INDEX_TIP
        from tests.conftest import _lms
        lms = _lms({INDEX_TIP: (0.25, 0.75, 0)})
        x, y = tracker.get_finger_tip(lms, width=640, height=480)
        assert (x, y) == (160, 360)
