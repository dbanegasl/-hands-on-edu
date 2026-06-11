import base64
import json
import logging
import time

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.hand_tracker import GestureSmoother, HandTracker, finger_states

APP_VERSION = "0.8.0"

# Minimum interval between processed frames. Clients use a ping-pong loop so this
# never throttles normal use; it only caps a misbehaving client that floods the
# socket (>40 fps), in which case we resend the last result instead of recomputing.
MIN_FRAME_INTERVAL = 0.025  # seconds

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("handsonedu")

app = FastAPI(
    title="HandsOnEdu",
    description="Plataforma Educativa con Control Gestual — HandsOnEdu",
    version=APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.mount("/static", StaticFiles(directory="app/static"), name="static")


def _new_tracker() -> HandTracker:
    """Factory for a per-connection tracker (patched in tests)."""
    return HandTracker(num_hands=2)


@app.get("/")
async def landing():
    return FileResponse("app/static/index.html")


@app.get("/gestiedu")
async def gestiedu():
    return FileResponse("app/static/gestiedu.html")


@app.get("/motivasign")
async def motivasign():
    return FileResponse("app/static/motivasign.html")


@app.get("/attendeye")
async def attendeye():
    return FileResponse("app/static/attendeye.html")


@app.get("/virtualpainter")
async def virtualpainter():
    return FileResponse("app/static/virtualpainter.html")


@app.get("/airpiano")
async def airpiano():
    return FileResponse("app/static/airpiano.html")


@app.get("/testing")
async def testing():
    return FileResponse("app/static/testing.html")


@app.get("/health")
async def health():
    return {"status": "ok", "version": APP_VERSION}


@app.websocket("/ws/analyze")
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

            payload = json.loads(raw)
            frame_bytes = base64.b64decode(payload["frame"])
            arr = np.frombuffer(frame_bytes, np.uint8)
            frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)

            if frame is None:
                await websocket.send_text(json.dumps({"error": "invalid_frame", "hands_detected": 0, "hands": []}))
                continue

            timestamp_ms = int((now - start_time) * 1000)
            result = tracker.detect(frame, timestamp_ms)
            last_response = _build_response(result, smoother)
            last_process = now

            await websocket.send_text(json.dumps(last_response))

    except WebSocketDisconnect:
        logger.info("ws disconnect: %s", websocket.client)
    except Exception as e:
        logger.exception("ws error: %s", e)
        try:
            await websocket.send_text(json.dumps({"error": str(e), "hands_detected": 0, "hands": []}))
        except Exception:
            pass
    finally:
        tracker.close()


def _build_response(result, smoother: GestureSmoother) -> dict:
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

        hands.append({
            "handedness": handedness,
            "confidence": confidence,
            "landmarks": points,
            "fingers_up": states,
            "finger_count": finger_count,
            "gesture": gesture,
            "gesture_raw": gesture_raw,
        })

    return {
        "hands_detected": len(result.hand_landmarks),
        "hands": hands,
    }
