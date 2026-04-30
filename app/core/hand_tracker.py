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
THUMB_TIP = 4
INDEX_TIP = 8
MIDDLE_TIP = 12
RING_TIP = 16
PINKY_TIP = 20


class HandTracker:
    """
    Wrapper around MediaPipe Hand Landmarker (Tasks API).
    Shared by all HandsOnEdu modules.
    """

    def __init__(self, num_hands: int = 2, mode: str = "video"):
        running_mode = VisionRunningMode.VIDEO if mode == "video" else VisionRunningMode.IMAGE
        options = HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=MODEL_PATH),
            running_mode=running_mode,
            num_hands=num_hands,
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

    def get_finger_tip(self, landmarks, finger: int = INDEX_TIP, width: int = 640, height: int = 480):
        """Return pixel coordinates (x, y) of a given landmark."""
        tip = landmarks[finger]
        return int(tip.x * width), int(tip.y * height)

    def count_raised_fingers(self, landmarks) -> int:
        """Count how many fingers are raised (simple heuristic based on y position)."""
        tips = [INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP]
        pip_joints = [6, 10, 14, 18]  # PIP joints (one below each tip)
        count = sum(
            1 for tip, pip in zip(tips, pip_joints)
            if landmarks[tip].y < landmarks[pip].y
        )
        # Thumb: compare x axis
        if landmarks[THUMB_TIP].x > landmarks[2].x:
            count += 1
        return count

    def close(self):
        self._landmarker.close()
