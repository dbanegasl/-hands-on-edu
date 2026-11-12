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
import math
import os
from io import BytesIO
from unittest.mock import MagicMock, patch

# Isolated in-memory database and open admin endpoints for the whole test run.
# Must be set before anything imports app.config.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["ADMIN_TOKEN"] = ""
os.environ["PUBLIC_BASE_URL"] = "http://localhost:9876"

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
from app.db import Base, engine  # noqa: E402
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


# ── Geometric hand generator (rotation-invariant fixtures) ────────────────────
#
# Builds a canonical hand in a local frame (x right, y up, hand pointing +y),
# then rotates/scales/translates all 21 points. Because the production gesture
# heuristic uses only distance ratios, the same gesture must be detected at any
# rotation_deg — which is exactly what the rotation-parametrized tests assert.

# Static landmarks shared by every hand: wrist, thumb CMC, and the four MCPs.
_BASE_POINTS = {
    0: (0.0, 0.0),      # WRIST
    1: (-0.6, 0.25),    # THUMB_CMC
    5: (-0.45, 1.0),    # INDEX_MCP
    9: (-0.15, 1.0),    # MIDDLE_MCP
    13: (0.15, 1.0),    # RING_MCP
    17: (0.45, 1.0),    # PINKY_MCP
}
# (column x, MCP, PIP, DIP, TIP) per finger.
_FINGER_COLUMNS = {
    "index": (-0.45, 5, 6, 7, 8),
    "middle": (-0.15, 9, 10, 11, 12),
    "ring": (0.15, 13, 14, 15, 16),
    "pinky": (0.45, 17, 18, 19, 20),
}
_THUMB_EXTENDED = {2: (-0.95, 0.5), 3: (-1.3, 0.7), 4: (-1.65, 0.95)}
_THUMB_FOLDED = {2: (-0.6, 0.7), 3: (-0.25, 0.95), 4: (0.1, 1.05)}


def _finger_local(cx: float, extended: bool) -> dict:
    if extended:
        return {"pip": (cx, 1.55), "dip": (cx, 2.0), "tip": (cx, 2.35)}
    return {"pip": (cx, 1.45), "dip": (cx, 1.2), "tip": (cx, 0.95)}


def make_hand(extended=(), thumb: bool = False, ok: bool = False,
              rotation_deg: float = 0.0, center=(0.5, 0.55), scale: float = 0.16) -> list:
    """
    Build a 21-landmark hand. `extended` is the set of finger names raised
    ("index"/"middle"/"ring"/"pinky"); `thumb` raises the thumb; `ok` overrides
    thumb+index into the OK pinch shape. `rotation_deg` rotates the whole hand.
    """
    extended = set(extended)
    pts = dict(_BASE_POINTS)
    for name, (cx, _mcp, pip, dip, tip) in _FINGER_COLUMNS.items():
        fp = _finger_local(cx, name in extended)
        pts[pip], pts[dip], pts[tip] = fp["pip"], fp["dip"], fp["tip"]
    pts.update(_THUMB_EXTENDED if thumb else _THUMB_FOLDED)
    if ok:
        # Thumb tip and index tip meet in a circle; middle/ring/pinky stay up.
        pts[8] = (-0.55, 1.25); pts[7] = (-0.5, 1.35)
        pts[4] = (-0.6, 1.2); pts[3] = (-0.75, 0.95); pts[2] = (-0.9, 0.6)

    rad = math.radians(rotation_deg)
    cos_a, sin_a = math.cos(rad), math.sin(rad)
    out = []
    for i in range(21):
        x, y = pts[i]
        rx = x * cos_a - y * sin_a
        ry = x * sin_a + y * cos_a
        out.append(Lm(center[0] + rx * scale, center[1] + ry * scale, 0.0))
    return out


# ── Named presets (importable by test files) ──────────────────────────────────

def fist_landmarks(rotation_deg: float = 0.0) -> list:
    return make_hand(rotation_deg=rotation_deg)


def thumbs_up_landmarks(rotation_deg: float = 0.0) -> list:
    return make_hand(thumb=True, rotation_deg=rotation_deg)


def pointing_landmarks(rotation_deg: float = 0.0) -> list:
    return make_hand(extended=["index"], rotation_deg=rotation_deg)


def peace_landmarks(rotation_deg: float = 0.0) -> list:
    return make_hand(extended=["index", "middle"], rotation_deg=rotation_deg)


def shaka_landmarks(rotation_deg: float = 0.0) -> list:
    return make_hand(extended=["pinky"], thumb=True, rotation_deg=rotation_deg)


def open_hand_landmarks(rotation_deg: float = 0.0) -> list:
    """All five digits extended → 'open_hand', finger_count 5."""
    return make_hand(extended=["index", "middle", "ring", "pinky"], thumb=True, rotation_deg=rotation_deg)


def four_fingers_landmarks(rotation_deg: float = 0.0) -> list:
    """Four fingers up, thumb tucked → '4_fingers', finger_count 4."""
    return make_hand(extended=["index", "middle", "ring", "pinky"], rotation_deg=rotation_deg)


def three_fingers_landmarks(rotation_deg: float = 0.0) -> list:
    return make_hand(extended=["index", "middle", "ring"], rotation_deg=rotation_deg)


def i_love_you_landmarks(rotation_deg: float = 0.0) -> list:
    return make_hand(extended=["index", "pinky"], thumb=True, rotation_deg=rotation_deg)


def ok_landmarks(rotation_deg: float = 0.0) -> list:
    return make_hand(extended=["middle", "ring", "pinky"], ok=True, rotation_deg=rotation_deg)


# ── pytest fixtures ───────────────────────────────────────────────────────────

@pytest.fixture
def tracker():
    """HandTracker with mocked landmarker — no model file required."""
    return HandTracker(num_hands=2)


@pytest.fixture
def client():
    """Synchronous Starlette TestClient (supports HTTP + WebSocket) on a fresh DB."""
    from app import models  # noqa: F401 — register tables

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def black_frame_b64() -> str:
    """640×480 all-black JPEG encoded as base64 string."""
    img = Image.new("RGB", (640, 480), color=(0, 0, 0))
    buf = BytesIO()
    img.save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode()
