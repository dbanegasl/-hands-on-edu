"""
Integration tests for app/main.py

Tests HTTP endpoints and the WebSocket /ws/analyze endpoint using
Starlette's synchronous TestClient (no real camera or MediaPipe model needed).
_tracker.detect() is patched per-test to return controlled results.
"""
import json
from unittest.mock import MagicMock, patch

import pytest

from tests.conftest import open_hand_landmarks


# ── Helpers ───────────────────────────────────────────────────────────────────

def _mock_result(hand_landmarks=None, handedness=None):
    """Build a fake HandLandmarkerResult."""
    r = MagicMock()
    r.hand_landmarks = hand_landmarks or []
    r.handedness = handedness or []
    return r


# ── /health ───────────────────────────────────────────────────────────────────

class TestHealthEndpoint:
    def test_status_200(self, client):
        assert client.get("/health").status_code == 200

    def test_body_status_ok(self, client):
        assert client.get("/health").json()["status"] == "ok"

    def test_body_has_version(self, client):
        assert "version" in client.get("/health").json()


# ── HTML routes ───────────────────────────────────────────────────────────────

class TestHtmlRoutes:
    @pytest.mark.parametrize("path", [
        "/", "/gestiedu", "/motivasign", "/attendeye", "/virtualpainter", "/testing",
    ])
    def test_returns_200(self, client, path):
        assert client.get(path).status_code == 200

    @pytest.mark.parametrize("path", [
        "/", "/gestiedu", "/motivasign", "/attendeye", "/virtualpainter", "/testing",
    ])
    def test_content_type_html(self, client, path):
        r = client.get(path)
        assert "text/html" in r.headers.get("content-type", "")


# ── WebSocket /ws/analyze ─────────────────────────────────────────────────────

class TestWebSocketAnalyze:
    def test_no_hands_response_structure(self, client, black_frame_b64):
        """Valid frame with no hands detected → correct JSON keys."""
        with patch("app.main._tracker.detect", return_value=_mock_result()):
            with client.websocket_connect("/ws/analyze") as ws:
                ws.send_text(json.dumps({"frame": black_frame_b64}))
                data = json.loads(ws.receive_text())

        assert "hands_detected" in data
        assert "hands" in data
        assert isinstance(data["hands"], list)

    def test_no_hands_count_is_zero(self, client, black_frame_b64):
        with patch("app.main._tracker.detect", return_value=_mock_result()):
            with client.websocket_connect("/ws/analyze") as ws:
                ws.send_text(json.dumps({"frame": black_frame_b64}))
                data = json.loads(ws.receive_text())

        assert data["hands_detected"] == 0
        assert data["hands"] == []

    def test_one_hand_response_structure(self, client, black_frame_b64):
        """One open_hand → verify all expected keys and gesture value."""
        mock_handedness = [[MagicMock(display_name="Right")]]
        result = _mock_result(
            hand_landmarks=[open_hand_landmarks()],
            handedness=mock_handedness,
        )

        with patch("app.main._tracker.detect", return_value=result):
            with client.websocket_connect("/ws/analyze") as ws:
                ws.send_text(json.dumps({"frame": black_frame_b64}))
                data = json.loads(ws.receive_text())

        assert data["hands_detected"] == 1
        hand = data["hands"][0]
        assert hand["handedness"] == "Right"
        assert hand["gesture"] == "open_hand"
        assert hand["finger_count"] == 4
        assert len(hand["landmarks"]) == 21
        # Every landmark must be a dict with x, y, z floats
        lm = hand["landmarks"][0]
        assert all(k in lm for k in ("x", "y", "z"))
        assert all(isinstance(lm[k], float) for k in ("x", "y", "z"))

    def test_two_hands_count(self, client, black_frame_b64):
        """Two hands → hands_detected == 2."""
        mock_handedness = [
            [MagicMock(display_name="Left")],
            [MagicMock(display_name="Right")],
        ]
        result = _mock_result(
            hand_landmarks=[open_hand_landmarks(), open_hand_landmarks()],
            handedness=mock_handedness,
        )

        with patch("app.main._tracker.detect", return_value=result):
            with client.websocket_connect("/ws/analyze") as ws:
                ws.send_text(json.dumps({"frame": black_frame_b64}))
                data = json.loads(ws.receive_text())

        assert data["hands_detected"] == 2
        assert len(data["hands"]) == 2

    def test_invalid_frame_returns_error_response(self, client):
        """Garbage base64 data → error key in response, no server crash."""
        with client.websocket_connect("/ws/analyze") as ws:
            ws.send_text(json.dumps({"frame": "AAAA"}))  # valid b64, invalid JPEG
            data = json.loads(ws.receive_text())

        # Either an "error" key or hands_detected=0 — server must not crash
        assert "error" in data or "hands_detected" in data

    def test_multiple_frames_same_connection(self, client, black_frame_b64):
        """Server must handle multiple frames on one WebSocket connection."""
        with patch("app.main._tracker.detect", return_value=_mock_result()):
            with client.websocket_connect("/ws/analyze") as ws:
                for _ in range(3):
                    ws.send_text(json.dumps({"frame": black_frame_b64}))
                    data = json.loads(ws.receive_text())
                    assert "hands_detected" in data
