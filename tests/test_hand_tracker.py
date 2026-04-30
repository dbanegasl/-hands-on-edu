"""
Unit tests for app/core/hand_tracker.py

These tests exercise the pure-logic methods (count_raised_fingers,
detect_gesture, get_finger_tip) using synthetic landmarks — no camera,
no MediaPipe model, no network required.
"""
import pytest

from tests.conftest import (
    _lms,
    fist_landmarks,
    open_hand_landmarks,
    peace_landmarks,
    pointing_landmarks,
    shaka_landmarks,
    thumbs_up_landmarks,
)


# ── count_raised_fingers ──────────────────────────────────────────────────────

class TestCountRaisedFingers:
    def test_fist_returns_0(self, tracker):
        assert tracker.count_raised_fingers(fist_landmarks()) == 0

    def test_open_hand_returns_4(self, tracker):
        # open_hand_landmarks has all 4 non-thumb fingers up, thumb close
        assert tracker.count_raised_fingers(open_hand_landmarks()) == 4

    def test_thumb_extension_adds_1(self, tracker):
        lms = open_hand_landmarks()
        lms[2].x = 0.30  # THUMB_MCP
        lms[4].x = 0.60  # THUMB_TIP  → diff 0.30 > 0.08
        assert tracker.count_raised_fingers(lms) == 5

    def test_pointing_returns_1(self, tracker):
        assert tracker.count_raised_fingers(pointing_landmarks()) == 1

    def test_peace_returns_2(self, tracker):
        assert tracker.count_raised_fingers(peace_landmarks()) == 2

    def test_three_fingers_returns_3(self, tracker):
        lms = _lms({
            2: (0.50, 0.70, 0), 4: (0.52, 0.80, 0),
            6: (0.5, 0.60, 0),  8: (0.5, 0.20, 0),   # index  UP
            10: (0.5, 0.60, 0), 12: (0.5, 0.20, 0),  # middle UP
            14: (0.5, 0.60, 0), 16: (0.5, 0.20, 0),  # ring   UP
            18: (0.5, 0.40, 0), 20: (0.5, 0.60, 0),  # pinky  DOWN
        })
        assert tracker.count_raised_fingers(lms) == 3


# ── detect_gesture ────────────────────────────────────────────────────────────

class TestDetectGesture:
    def test_fist(self, tracker):
        assert tracker.detect_gesture(fist_landmarks()) == "fist"

    def test_thumbs_up(self, tracker):
        assert tracker.detect_gesture(thumbs_up_landmarks()) == "thumbs_up"

    def test_pointing(self, tracker):
        assert tracker.detect_gesture(pointing_landmarks()) == "pointing"

    def test_peace(self, tracker):
        assert tracker.detect_gesture(peace_landmarks()) == "peace"

    def test_shaka(self, tracker):
        assert tracker.detect_gesture(shaka_landmarks()) == "shaka"

    def test_open_hand(self, tracker):
        assert tracker.detect_gesture(open_hand_landmarks()) == "open_hand"

    def test_3_fingers_fallthrough(self, tracker):
        """3 fingers (index+middle+ring) with no special condition → '3_fingers'."""
        lms = _lms({
            2: (0.50, 0.70, 0), 4: (0.52, 0.80, 0),
            6: (0.5, 0.60, 0),  8: (0.5, 0.20, 0),   # index  UP
            10: (0.5, 0.60, 0), 12: (0.5, 0.20, 0),  # middle UP
            14: (0.5, 0.60, 0), 16: (0.5, 0.20, 0),  # ring   UP
            18: (0.5, 0.40, 0), 20: (0.5, 0.60, 0),  # pinky  DOWN
        })
        assert tracker.detect_gesture(lms) == "3_fingers"

    def test_2_fingers_fallthrough(self, tracker):
        """2 fingers that are NOT index+middle → '2_fingers' (not peace)."""
        lms = _lms({
            2: (0.50, 0.70, 0), 4: (0.52, 0.80, 0),
            6: (0.5, 0.40, 0),  8: (0.5, 0.60, 0),   # index  DOWN
            10: (0.5, 0.60, 0), 12: (0.5, 0.20, 0),  # middle UP
            14: (0.5, 0.40, 0), 16: (0.5, 0.60, 0),  # ring   DOWN
            18: (0.5, 0.60, 0), 20: (0.5, 0.20, 0),  # pinky  UP
        })
        assert tracker.detect_gesture(lms) == "2_fingers"

    def test_1_finger_fallthrough(self, tracker):
        """1 finger (ring only) with no thumb → '1_fingers' (not pointing/shaka)."""
        lms = _lms({
            2: (0.50, 0.70, 0), 4: (0.52, 0.80, 0),
            6: (0.5, 0.40, 0),  8: (0.5, 0.60, 0),   # index  DOWN
            10: (0.5, 0.40, 0), 12: (0.5, 0.60, 0),  # middle DOWN
            14: (0.5, 0.60, 0), 16: (0.5, 0.20, 0),  # ring   UP
            18: (0.5, 0.40, 0), 20: (0.5, 0.60, 0),  # pinky  DOWN
        })
        assert tracker.detect_gesture(lms) == "1_fingers"


# ── get_finger_tip ────────────────────────────────────────────────────────────

class TestGetFingerTip:
    def test_center_640x480(self, tracker):
        lms = _lms({8: (0.5, 0.5, 0)})  # INDEX_TIP at center
        x, y = tracker.get_finger_tip(lms, finger=8, width=640, height=480)
        assert x == 320
        assert y == 240

    def test_top_left_corner(self, tracker):
        lms = _lms({8: (0.0, 0.0, 0)})
        x, y = tracker.get_finger_tip(lms, finger=8, width=640, height=480)
        assert x == 0
        assert y == 0

    def test_bottom_right_corner(self, tracker):
        lms = _lms({4: (1.0, 1.0, 0)})  # THUMB_TIP
        x, y = tracker.get_finger_tip(lms, finger=4, width=640, height=480)
        assert x == 640
        assert y == 480

    def test_custom_resolution_1280x720(self, tracker):
        lms = _lms({4: (0.5, 0.5, 0)})
        x, y = tracker.get_finger_tip(lms, finger=4, width=1280, height=720)
        assert x == 640
        assert y == 360

    def test_default_finger_is_index_tip(self, tracker):
        """Default finger parameter should be INDEX_TIP (index 8)."""
        from app.core.hand_tracker import INDEX_TIP
        lms = _lms({INDEX_TIP: (0.25, 0.75, 0)})
        x, y = tracker.get_finger_tip(lms, width=640, height=480)
        assert x == 160
        assert y == 360
