"""
Shared fixtures and landmark helpers for HandsOnEdu tests.

Strategy:
1. Import mediapipe + app.core.hand_tracker first (this binds HandLandmarker
   as a module-level name in hand_tracker.py via mp.tasks.vision.HandLandmarker)
2. Patch app.core.hand_tracker.HandLandmarker BEFORE importing app.main
3. app.main creates _tracker = HandTracker(num_hands=2) → uses patched class

This avoids the model file entirely and lets tests run without a camera.
"""
import base64
from io import BytesIO
from unittest.mock import MagicMock, patch

import mediapipe as mp  # noqa: F401 — touch mp to ensure tasks.vision is accessible
import pytest
from PIL import Image

# ── Step 1: import hand_tracker (binds HandLandmarker module-level name) ──────
import app.core.hand_tracker  # noqa: F401

# ── Step 2: build mock and patch the name BEFORE app.main loads ───────────────
_mock_lm_class = MagicMock()
_mock_lm_instance = MagicMock()
_mock_lm_instance.detect_for_video.return_value = MagicMock(
    hand_landmarks=[], handedness=[]
)
_mock_lm_class.create_from_options.return_value = _mock_lm_instance

_hl_patch = patch("app.core.hand_tracker.HandLandmarker", _mock_lm_class)
_hl_patch.start()

# ── Step 3: now safe to import app.main (HandTracker() won't open the model) ──
from app.main import app  # noqa: E402
from app.core.hand_tracker import HandTracker  # noqa: E402
from starlette.testclient import TestClient  # noqa: E402


# ── Minimal landmark mock ─────────────────────────────────────────────────────
class Lm:
    """Lightweight stand-in for a MediaPipe NormalizedLandmark."""

    def __init__(self, x: float = 0.5, y: float = 0.5, z: float = 0.0):
        self.x = x
        self.y = y
        self.z = z


def _lms(overrides: dict = None) -> list:
    """
    Build a 21-landmark list (all at (0.5, 0.5, 0.0) by default).
    overrides: {landmark_index: (x, y, z)}
    """
    base = [Lm() for _ in range(21)]
    if overrides:
        for idx, (x, y, z) in overrides.items():
            base[idx].x, base[idx].y, base[idx].z = x, y, z
    return base


# ── Landmark presets (module-level helpers, importable by test files) ─────────
#
# MediaPipe indices:
#   THUMB_MCP=2  THUMB_TIP=4
#   INDEX_PIP=6  INDEX_TIP=8
#   MIDDLE_PIP=10 MIDDLE_TIP=12
#   RING_PIP=14  RING_TIP=16
#   PINKY_PIP=18 PINKY_TIP=20
#
# "finger up"  → TIP.y < PIP.y  (y=0 is top of image)
# "thumb out"  → abs(TIP.x − MCP.x) > 0.08

def fist_landmarks() -> list:
    """All fingers bent down; thumb NOT extended → detect_gesture returns 'fist'."""
    return _lms({
        2: (0.50, 0.70, 0), 4: (0.52, 0.80, 0),  # thumb close (diff 0.02)
        6: (0.5, 0.40, 0),  8: (0.5, 0.60, 0),   # index  DOWN (TIP.y > PIP.y)
        10: (0.5, 0.40, 0), 12: (0.5, 0.60, 0),  # middle DOWN
        14: (0.5, 0.40, 0), 16: (0.5, 0.60, 0),  # ring   DOWN
        18: (0.5, 0.40, 0), 20: (0.5, 0.60, 0),  # pinky  DOWN
    })


def thumbs_up_landmarks() -> list:
    """All fingers bent down; thumb IS extended → detect_gesture returns 'thumbs_up'."""
    return _lms({
        2: (0.30, 0.70, 0), 4: (0.60, 0.60, 0),  # thumb out (diff 0.30 > 0.08)
        6: (0.5, 0.40, 0),  8: (0.5, 0.60, 0),
        10: (0.5, 0.40, 0), 12: (0.5, 0.60, 0),
        14: (0.5, 0.40, 0), 16: (0.5, 0.60, 0),
        18: (0.5, 0.40, 0), 20: (0.5, 0.60, 0),
    })


def pointing_landmarks() -> list:
    """Only index up; thumb NOT extended → detect_gesture returns 'pointing'."""
    return _lms({
        2: (0.50, 0.70, 0), 4: (0.52, 0.80, 0),  # thumb close
        6: (0.5, 0.60, 0),  8: (0.5, 0.20, 0),   # index  UP (TIP.y < PIP.y)
        10: (0.5, 0.40, 0), 12: (0.5, 0.60, 0),  # middle DOWN
        14: (0.5, 0.40, 0), 16: (0.5, 0.60, 0),  # ring   DOWN
        18: (0.5, 0.40, 0), 20: (0.5, 0.60, 0),  # pinky  DOWN
    })


def peace_landmarks() -> list:
    """Index + middle up; ring + pinky down; no thumb → detect_gesture returns 'peace'."""
    return _lms({
        2: (0.50, 0.70, 0), 4: (0.52, 0.80, 0),
        6: (0.5, 0.60, 0),  8: (0.5, 0.20, 0),   # index  UP
        10: (0.5, 0.60, 0), 12: (0.5, 0.20, 0),  # middle UP
        14: (0.5, 0.40, 0), 16: (0.5, 0.60, 0),  # ring   DOWN
        18: (0.5, 0.40, 0), 20: (0.5, 0.60, 0),  # pinky  DOWN
    })


def shaka_landmarks() -> list:
    """Only pinky up + thumb extended → detect_gesture returns 'shaka'."""
    return _lms({
        2: (0.30, 0.70, 0), 4: (0.60, 0.60, 0),  # thumb out (diff 0.30)
        6: (0.5, 0.40, 0),  8: (0.5, 0.60, 0),   # index  DOWN
        10: (0.5, 0.40, 0), 12: (0.5, 0.60, 0),  # middle DOWN
        14: (0.5, 0.40, 0), 16: (0.5, 0.60, 0),  # ring   DOWN
        18: (0.5, 0.60, 0), 20: (0.5, 0.20, 0),  # pinky  UP
    })


def open_hand_landmarks() -> list:
    """All 4 fingers up; thumb close → detect_gesture returns 'open_hand' (count==4)."""
    return _lms({
        2: (0.50, 0.70, 0), 4: (0.52, 0.80, 0),  # thumb close
        6: (0.5, 0.60, 0),  8: (0.5, 0.20, 0),   # index  UP
        10: (0.5, 0.60, 0), 12: (0.5, 0.20, 0),  # middle UP
        14: (0.5, 0.60, 0), 16: (0.5, 0.20, 0),  # ring   UP
        18: (0.5, 0.60, 0), 20: (0.5, 0.20, 0),  # pinky  UP
    })


# ── pytest fixtures ───────────────────────────────────────────────────────────

@pytest.fixture
def tracker():
    """HandTracker with mocked landmarker — no model file required."""
    return HandTracker(num_hands=2)


@pytest.fixture
def client():
    """Synchronous Starlette TestClient (supports HTTP + WebSocket)."""
    with TestClient(app) as c:
        yield c


@pytest.fixture
def black_frame_b64() -> str:
    """640×480 all-black JPEG encoded as base64 string."""
    img = Image.new("RGB", (640, 480), color=(0, 0, 0))
    buf = BytesIO()
    img.save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode()
