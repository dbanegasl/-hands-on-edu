import base64
import json
import time

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.hand_tracker import HandTracker

app = FastAPI(
    title="HandsOnEdu",
    description="Plataforma Educativa con Control Gestual — UNAE",
    version="0.5.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.mount("/static", StaticFiles(directory="app/static"), name="static")

_tracker = HandTracker(num_hands=2)
_start_time = time.time()


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
    return {"status": "ok", "version": "0.1.0"}


@app.websocket("/ws/analyze")
async def websocket_analyze(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_text()
            payload = json.loads(raw)

            frame_bytes = base64.b64decode(payload["frame"])
            arr = np.frombuffer(frame_bytes, np.uint8)
            frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)

            if frame is None:
                await websocket.send_text(json.dumps({"error": "invalid_frame", "hands_detected": 0, "hands": []}))
                continue

            timestamp_ms = int((time.time() - _start_time) * 1000)
            result = _tracker.detect(frame, timestamp_ms)

            await websocket.send_text(json.dumps(_build_response(result)))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_text(json.dumps({"error": str(e), "hands_detected": 0, "hands": []}))
        except Exception:
            pass


def _build_response(result) -> dict:
    hands = []
    for i, landmarks in enumerate(result.hand_landmarks):
        handedness = "Unknown"
        if result.handedness and i < len(result.handedness):
            handedness = result.handedness[i][0].display_name

        points = [{"x": float(lm.x), "y": float(lm.y), "z": float(lm.z)} for lm in landmarks]
        finger_count = _tracker.count_raised_fingers(landmarks)
        gesture = _tracker.detect_gesture(landmarks)

        hands.append({
            "handedness": handedness,
            "landmarks": points,
            "finger_count": finger_count,
            "gesture": gesture,
        })

    return {
        "hands_detected": len(result.hand_landmarks),
        "hands": hands,
    }
