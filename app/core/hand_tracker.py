import math
from collections import Counter, deque

import cv2
import numpy as np
import mediapipe as mp

BaseOptions = mp.tasks.BaseOptions
HandLandmarker = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

MODEL_PATH = "/app/models/hand_landmarker.task"

# 21 landmark indices reference (MediaPipe Hand)
WRIST = 0
THUMB_CMC, THUMB_MCP, THUMB_IP, THUMB_TIP = 1, 2, 3, 4
INDEX_MCP, INDEX_PIP, INDEX_DIP, INDEX_TIP = 5, 6, 7, 8
MIDDLE_MCP, MIDDLE_PIP, MIDDLE_DIP, MIDDLE_TIP = 9, 10, 11, 12
RING_MCP, RING_PIP, RING_DIP, RING_TIP = 13, 14, 15, 16
PINKY_MCP, PINKY_PIP, PINKY_DIP, PINKY_TIP = 17, 18, 19, 20

# ── Detection confidence thresholds ───────────────────────────────────────────
# Raised above the MediaPipe default of 0.5 so a face/forearm in frame no longer
# registers as a hand (AirPiano false-trigger bug). Presence/tracking stay a bit
# lower to keep continuity once a real hand is locked on.
MIN_DETECTION_CONFIDENCE = 0.7
MIN_PRESENCE_CONFIDENCE = 0.6
MIN_TRACKING_CONFIDENCE = 0.6

# ── Orientation-invariant gesture heuristic constants ─────────────────────────
# A finger is "extended" when its tip sits farther from the wrist than its PIP
# joint by this ratio. Because it compares distances to a shared anchor (wrist),
# it is invariant to hand rotation — unlike the old tip.y < pip.y test, which
# failed the moment the hand was tilted (a thumbs-up read as "2 fingers").
FINGER_EXT_RATIO = 1.15
# The thumb is anchored to the *pinky* MCP: a folded thumb crosses the palm
# toward the pinky (tip closer than IP), an extended thumb points away (tip
# farther). Anatomically fixed, so no left/right-hand branch is needed.
THUMB_EXT_RATIO = 1.10
# OK sign: thumb tip and index tip pinch together within a fraction of palm width.
PINCH_RATIO = 0.6


def _dist2d(a, b) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


def finger_states(landmarks) -> dict:
    """
    Return {thumb, index, middle, ring, pinky}: bool of which fingers are
    extended, using rotation-invariant distance ratios (see constants above).
    """
    wrist = landmarks[WRIST]
    states = {}
    for name, tip, pip in (
        ("index", INDEX_TIP, INDEX_PIP),
        ("middle", MIDDLE_TIP, MIDDLE_PIP),
        ("ring", RING_TIP, RING_PIP),
        ("pinky", PINKY_TIP, PINKY_PIP),
    ):
        states[name] = _dist2d(landmarks[tip], wrist) > FINGER_EXT_RATIO * _dist2d(landmarks[pip], wrist)
    anchor = landmarks[PINKY_MCP]
    states["thumb"] = _dist2d(landmarks[THUMB_TIP], anchor) > THUMB_EXT_RATIO * _dist2d(landmarks[THUMB_IP], anchor)
    return states


def _is_pinch(landmarks) -> bool:
    palm = _dist2d(landmarks[INDEX_MCP], landmarks[PINKY_MCP])
    return _dist2d(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) < PINCH_RATIO * palm


class GestureSmoother:
    """
    Per-connection temporal smoother. Majority-votes the gesture and takes the
    median finger count over a short window so a single noisy frame can't flip
    the UI. State is keyed per hand (by handedness) — never share one instance
    across WebSocket connections.
    """

    def __init__(self, window: int = 5, min_votes: int = 3):
        self._window = window
        self._min_votes = min_votes
        self._gestures: dict[str, deque] = {}
        self._counts: dict[str, deque] = {}
        self._last: dict[str, str] = {}

    def smooth(self, key: str, gesture_raw: str, finger_count: int) -> tuple[str, int]:
        gq = self._gestures.setdefault(key, deque(maxlen=self._window))
        cq = self._counts.setdefault(key, deque(maxlen=self._window))
        gq.append(gesture_raw)
        cq.append(finger_count)

        # A sustained gesture (>= min_votes) latches as the emitted value; until
        # then emit the current plurality, so a single noisy frame never wins and
        # there is no startup lag waiting for the window to fill.
        top, votes = Counter(gq).most_common(1)[0]
        if votes >= self._min_votes:
            self._last[key] = top
        gesture = self._last.get(key, top)

        ordered = sorted(cq)
        count = ordered[len(ordered) // 2]
        return gesture, count


class HandTracker:
    """
    Wrapper around MediaPipe Hand Landmarker (Tasks API).
    Create one instance per WebSocket connection: VIDEO running mode keeps
    inter-frame tracking state and expects monotonic timestamps from a single
    stream, so sharing one instance across clients corrupts tracking for all.
    """

    def __init__(self, num_hands: int = 2, mode: str = "video"):
        running_mode = VisionRunningMode.VIDEO if mode == "video" else VisionRunningMode.IMAGE
        options = HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=MODEL_PATH),
            running_mode=running_mode,
            num_hands=num_hands,
            min_hand_detection_confidence=MIN_DETECTION_CONFIDENCE,
            min_hand_presence_confidence=MIN_PRESENCE_CONFIDENCE,
            min_tracking_confidence=MIN_TRACKING_CONFIDENCE,
        )
        self._landmarker = HandLandmarker.create_from_options(options)

    def detect(self, frame_bgr: np.ndarray, timestamp_ms: int):
        """
        Run hand landmark detection on a BGR frame.
        Returns a HandLandmarkerResult with .hand_landmarks and .handedness.
        """
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
        return self._landmarker.detect_for_video(mp_image, timestamp_ms)

    @staticmethod
    def get_finger_tip(landmarks, finger: int = INDEX_TIP, width: int = 640, height: int = 480):
        """Return pixel coordinates (x, y) of a given landmark."""
        tip = landmarks[finger]
        return int(tip.x * width), int(tip.y * height)

    @staticmethod
    def count_raised_fingers(landmarks) -> int:
        """Count extended fingers (0–5), thumb included, orientation-invariant."""
        return sum(finger_states(landmarks).values())

    @staticmethod
    def detect_gesture(landmarks) -> str:
        """Classify the hand into a named gesture from its extended-finger set."""
        s = finger_states(landmarks)
        index, middle, ring, pinky, thumb = s["index"], s["middle"], s["ring"], s["pinky"], s["thumb"]
        count = index + middle + ring + pinky  # non-thumb fingers (0–4)

        # Most specific shapes first.
        if middle and ring and pinky and _is_pinch(landmarks):
            return "ok"
        if index and pinky and not middle and not ring and thumb:
            return "i_love_you"
        if count == 0:
            return "thumbs_up" if thumb else "fist"
        if count == 1 and index and not thumb:
            return "pointing"
        if count == 1 and pinky and thumb:
            return "shaka"
        if count == 2 and index and middle and not ring and not pinky:
            return "peace"
        if count == 4:
            return "open_hand" if thumb else "4_fingers"
        return f"{count}_fingers"

    def close(self):
        self._landmarker.close()
