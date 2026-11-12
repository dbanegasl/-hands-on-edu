"""
Server-side landmark service: `WS /ws/analyze`.

Since v0.9.0 the browser runs MediaPipe itself (see `ho-hands.js`); this
endpoint remains as the fallback for devices where the in-browser engine
cannot load (no WASM/WebGL) and for `?engine=server`.
"""
import base64
import binascii
import json
import logging
import time

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.hand_tracker import GestureSmoother, HandTracker, finger_states

logger = logging.getLogger("handsonedu.ws")

router = APIRouter()

# Minimum interval between processed frames. Clients use a ping-pong loop so this
# never throttles normal use; it only caps a misbehaving client that floods the
# socket (>40 fps), in which case we resend the last result instead of recomputing.
MIN_FRAME_INTERVAL = 0.025  # seconds
# Reject absurd payloads before base64-decoding them (a 1280×720 q0.6 JPEG is ~100 KB).
MAX_FRAME_B64_CHARS = 2_000_000


def _new_tracker() -> HandTracker:
    """Factory for a per-connection tracker (patched in tests)."""
    return HandTracker(num_hands=2)


def _error(code: str) -> str:
    return json.dumps({"error": code, "hands_detected": 0, "hands": []})


@router.websocket("/ws/analyze")
async def websocket_analyze(websocket: WebSocket):
    await websocket.accept()
    logger.info("ws connect: %s", websocket.client)

    tracker = _new_tracker()
    smoother = GestureSmoother()
    start_time = time.monotonic()
    last_process = 0.0
    last_response = None

    try:
        while True:
            raw = await websocket.receive_text()

            now = time.monotonic()
            if last_response is not None and (now - last_process) < MIN_FRAME_INTERVAL:
                # Too fast — resend the previous result rather than recomputing.
                await websocket.send_text(json.dumps(last_response))
                continue

            try:
                payload = json.loads(raw)
                b64 = payload["frame"]
                if not isinstance(b64, str) or len(b64) > MAX_FRAME_B64_CHARS:
                    raise ValueError("frame too large or not a string")
                frame_bytes = base64.b64decode(b64, validate=False)
            except (ValueError, KeyError, TypeError, binascii.Error):
                await websocket.send_text(_error("invalid_payload"))
                continue

            frame = cv2.imdecode(np.frombuffer(frame_bytes, np.uint8), cv2.IMREAD_COLOR)
            if frame is None:
                await websocket.send_text(_error("invalid_frame"))
                continue

            timestamp_ms = int((now - start_time) * 1000)
            result = tracker.detect(frame, timestamp_ms)
            last_response = build_response(result, smoother, aspect=frame.shape[1] / frame.shape[0])
            last_process = now

            await websocket.send_text(json.dumps(last_response))

    except WebSocketDisconnect:
        logger.info("ws disconnect: %s", websocket.client)
    except Exception as e:
        logger.exception("ws error: %s", e)
        try:
            await websocket.send_text(_error("internal_error"))
        except Exception:
            pass
    finally:
        tracker.close()


def build_response(result, smoother: GestureSmoother, aspect: float | None = None) -> dict:
    """Serialize a HandLandmarkerResult into the shared JSON hand-result shape."""
    world = getattr(result, "hand_world_landmarks", None)
    hands = []
    for i, landmarks in enumerate(result.hand_landmarks):
        handedness = "Unknown"
        confidence = 1.0
        if result.handedness and i < len(result.handedness):
            category = result.handedness[i][0]
            handedness = category.display_name
            try:
                confidence = float(category.score)
            except (TypeError, ValueError):
                confidence = 1.0

        points = [{"x": float(lm.x), "y": float(lm.y), "z": float(lm.z)} for lm in landmarks]
        states = finger_states(landmarks)
        finger_count = sum(states.values())
        gesture_raw = HandTracker.detect_gesture(landmarks)

        # Smooth per hand. Fall back to the loop index when handedness is unknown
        # so two simultaneous unknown hands keep separate slots.
        key = handedness if handedness != "Unknown" else f"_{i}"
        gesture, finger_count = smoother.smooth(key, gesture_raw, finger_count)

        hand = {
            "handedness": handedness,
            "confidence": confidence,
            "landmarks": points,
            "fingers_up": states,
            "finger_count": finger_count,
            "gesture": gesture,
            "gesture_raw": gesture_raw,
        }
        if aspect:
            hand["aspect"] = round(aspect, 4)
        if isinstance(world, list) and i < len(world):
            hand["world_landmarks"] = [
                {"x": float(p.x), "y": float(p.y), "z": float(p.z)} for p in world[i]
            ]
        hands.append(hand)

    return {
        "hands_detected": len(result.hand_landmarks),
        "hands": hands,
        "engine": "server",
    }
