"""
Integration tests for app/main.py

Tests HTTP endpoints and the WebSocket /ws/analyze endpoint using
Starlette's synchronous TestClient (no real camera or MediaPipe model needed).
The per-connection tracker factory (_new_tracker) is patched per-test to return
a mock tracker whose detect() yields controlled results.
"""
import json
from unittest.mock import MagicMock, patch

import pytest

from app.main import APP_VERSION
from tests.conftest import open_hand_landmarks


# ── Helpers ───────────────────────────────────────────────────────────────────

def _category(display_name="Right", score=0.94):
    cat = MagicMock()
    cat.display_name = display_name
    cat.score = score
    return cat


def _mock_result(hand_landmarks=None, handedness=None):
    """Build a fake HandLandmarkerResult."""
    r = MagicMock()
    r.hand_landmarks = hand_landmarks or []
    r.handedness = handedness or []
    return r


def _patch_tracker(result):
    """Patch the tracker factory so every connection's detect() returns `result`."""
    mock_tracker = MagicMock()
    mock_tracker.detect.return_value = result
    return patch("app.main._new_tracker", return_value=mock_tracker)


# ── /health ───────────────────────────────────────────────────────────────────

class TestHealthEndpoint:
    def test_status_200(self, client):
        assert client.get("/health").status_code == 200

    def test_body_status_ok(self, client):
        assert client.get("/health").json()["status"] == "ok"

    def test_version_matches_app(self, client):
        assert client.get("/health").json()["version"] == APP_VERSION


# ── HTML routes ───────────────────────────────────────────────────────────────

class TestHtmlRoutes:
    @pytest.mark.parametrize("path", [
        "/", "/gestiedu", "/motivasign", "/attendeye", "/virtualpainter", "/airpiano", "/testing",
    ])
    def test_returns_200(self, client, path):
        assert client.get(path).status_code == 200

    @pytest.mark.parametrize("path", [
        "/", "/gestiedu", "/motivasign", "/attendeye", "/virtualpainter", "/airpiano", "/testing",
    ])
    def test_content_type_html(self, client, path):
        r = client.get(path)
        assert "text/html" in r.headers.get("content-type", "")


# ── WebSocket /ws/analyze ─────────────────────────────────────────────────────

class TestWebSocketAnalyze:
    def test_no_hands_response_structure(self, client, black_frame_b64):
        with _patch_tracker(_mock_result()):
            with client.websocket_connect("/ws/analyze") as ws:
                ws.send_text(json.dumps({"frame": black_frame_b64}))
                data = json.loads(ws.receive_text())

        assert data["hands_detected"] == 0
        assert data["hands"] == []

    def test_one_hand_response_fields(self, client, black_frame_b64):
        """One open_hand → verify all keys including the new confidence/fingers_up/gesture_raw."""
        result = _mock_result(
            hand_landmarks=[open_hand_landmarks()],
            handedness=[[_category("Right", 0.94)]],
        )
        with _patch_tracker(result):
            with client.websocket_connect("/ws/analyze") as ws:
                ws.send_text(json.dumps({"frame": black_frame_b64}))
                data = json.loads(ws.receive_text())

        assert data["hands_detected"] == 1
        hand = data["hands"][0]
        assert hand["handedness"] == "Right"
        assert hand["gesture"] == "open_hand"
        assert hand["gesture_raw"] == "open_hand"
        assert hand["finger_count"] == 5
        assert hand["confidence"] == pytest.approx(0.94)
        assert hand["fingers_up"] == {
            "thumb": True, "index": True, "middle": True, "ring": True, "pinky": True,
        }
        assert len(hand["landmarks"]) == 21
        lm = hand["landmarks"][0]
        assert all(isinstance(lm[k], float) for k in ("x", "y", "z"))

    def test_two_hands_count(self, client, black_frame_b64):
        result = _mock_result(
            hand_landmarks=[open_hand_landmarks(), open_hand_landmarks()],
            handedness=[[_category("Left", 0.9)], [_category("Right", 0.9)]],
        )
        with _patch_tracker(result):
            with client.websocket_connect("/ws/analyze") as ws:
                ws.send_text(json.dumps({"frame": black_frame_b64}))
                data = json.loads(ws.receive_text())

        assert data["hands_detected"] == 2
        assert len(data["hands"]) == 2

    def test_concurrent_connections_are_independent(self, client, black_frame_b64):
        """Two simultaneous connections each get their own tracker (no shared state)."""
        result = _mock_result(
            hand_landmarks=[open_hand_landmarks()],
            handedness=[[_category("Right", 0.9)]],
        )
        with _patch_tracker(result):
            with client.websocket_connect("/ws/analyze") as ws_a, \
                    client.websocket_connect("/ws/analyze") as ws_b:
                ws_a.send_text(json.dumps({"frame": black_frame_b64}))
                ws_b.send_text(json.dumps({"frame": black_frame_b64}))
                data_a = json.loads(ws_a.receive_text())
                data_b = json.loads(ws_b.receive_text())

        assert data_a["hands_detected"] == 1
        assert data_b["hands_detected"] == 1

    def test_invalid_frame_returns_error_response(self, client):
        with _patch_tracker(_mock_result()):
            with client.websocket_connect("/ws/analyze") as ws:
                ws.send_text(json.dumps({"frame": "AAAA"}))  # valid b64, invalid JPEG
                data = json.loads(ws.receive_text())

        assert "error" in data or "hands_detected" in data

    def test_multiple_frames_same_connection(self, client, black_frame_b64):
        """Server handles a burst of frames on one connection (rate guard may cache)."""
        with _patch_tracker(_mock_result()):
            with client.websocket_connect("/ws/analyze") as ws:
                for _ in range(3):
                    ws.send_text(json.dumps({"frame": black_frame_b64}))
                    data = json.loads(ws.receive_text())
                    assert data["hands_detected"] == 0
