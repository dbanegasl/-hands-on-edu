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
        """Count how many fingers are raised using PIP/TIP y-axis comparison."""
        tips =       [INDEX_TIP,  MIDDLE_TIP,  RING_TIP,  PINKY_TIP]
        pip_joints = [INDEX_PIP,  MIDDLE_PIP,  RING_PIP,  PINKY_PIP]
        count = sum(
            1 for tip, pip in zip(tips, pip_joints)
            if landmarks[tip].y < landmarks[pip].y
        )
        # Thumb: extended when tip is far from MCP in x axis
        if abs(landmarks[THUMB_TIP].x - landmarks[THUMB_MCP].x) > 0.08:
            count += 1
        return count

    def detect_gesture(self, landmarks) -> str:
        """Classify hand into a named gesture based on which fingers are raised."""
        index_up  = landmarks[INDEX_TIP].y  < landmarks[INDEX_PIP].y
        middle_up = landmarks[MIDDLE_TIP].y < landmarks[MIDDLE_PIP].y
        ring_up   = landmarks[RING_TIP].y   < landmarks[RING_PIP].y
        pinky_up  = landmarks[PINKY_TIP].y  < landmarks[PINKY_PIP].y
        thumb_out = abs(landmarks[THUMB_TIP].x - landmarks[THUMB_MCP].x) > 0.08

        fingers = [index_up, middle_up, ring_up, pinky_up]
        count = sum(fingers)

        if count == 0 and not thumb_out:
            return "fist"
        if count == 0 and thumb_out:
            return "thumbs_up"
        if count == 1 and index_up and not thumb_out:
            return "pointing"
        if count == 2 and index_up and middle_up and not ring_up and not pinky_up:
            return "peace"
        if count == 1 and pinky_up and thumb_out:
            return "shaka"
        if count == 4 or (count == 4 and thumb_out):
            return "open_hand"
        if thumb_out and count == 4:
            return "open_hand"
        if count == 5 or (count == 4 and thumb_out):
            return "open_hand"
        return f"{count}_fingers"

    def close(self):
        self._landmarker.close()
