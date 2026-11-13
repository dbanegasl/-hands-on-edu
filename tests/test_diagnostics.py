"""Equipment test (/diagnostico): reports and the teacher panel summary."""
import dataclasses
from datetime import datetime, timedelta, timezone

from app import config, privacy
from app.db import SessionLocal
from app.models import DeviceCheck


def _check(**over):
    body = {"room": "Lab 2", "station": "PC-01", "verdict": "ok", "browser": "Chrome 130", "os": "Windows",
            "camera": "ok", "camera_res": "640x480", "engine": "browser", "device": "GPU", "load_ms": 3200,
            "fps": 27.5, "hand_seen": True, "issues": []}
    return {**body, **over}


def _admin(monkeypatch):
    monkeypatch.setattr(config, "settings", dataclasses.replace(config.settings, admin_token="s3cret"))
    return {"X-Admin-Token": "s3cret"}


class TestReport:
    def test_page_is_served(self, client):
        r = client.get("/diagnostico")
        assert r.status_code == 200 and "diagnostico.js" in r.text and "ho-hands.js" in r.text

    def test_report_is_stored_cleaned(self, stranger):
        r = stranger.post("/api/diagnostics", json=_check(room="  Lab 2 ", station="", issues=["slow", "slow", " "]))
        assert r.status_code == 201
        with SessionLocal() as db:
            row = db.get(DeviceCheck, r.json()["id"])
        assert (row.room, row.station, row.issues, row.fps) == ("Lab 2", None, ["slow"], 27.5)

    def test_invalid_reports_are_rejected(self, stranger):
        for bad in (_check(verdict="great"), _check(camera="?"), _check(fps=-1), _check(room="x" * 61),
                    _check(issues=["a"] * 21), _check(device="TPU")):
            assert stranger.post("/api/diagnostics", json=bad).status_code == 422


class TestPanelSummary:
    def test_needs_teacher_access(self, client, stranger, monkeypatch):
        _admin(monkeypatch)
        assert stranger.get("/api/panel/devices").status_code == 401

    def test_latest_result_per_station(self, client, monkeypatch):
        hdr = _admin(monkeypatch)
        # PC-01: camera busy first, fixed on the second try.
        client.post("/api/diagnostics", json=_check(verdict="fail", camera="busy", engine=None, device=None,
                                                    fps=None, hand_seen=None, issues=["camera_busy"]))
        client.post("/api/diagnostics", json=_check())
        client.post("/api/diagnostics", json=_check(station="PC-02", verdict="warn", fps=10, issues=["slow"]))
        client.post("/api/diagnostics", json=_check(station="PC-03", verdict="fail", fps=5, device="CPU",
                                                    issues=["too_slow"]))
        client.post("/api/diagnostics", json=_check(room="Lab 5", station="PC-01"))
        client.post("/api/diagnostics", json=_check(room=None, station=None))   # unnamed: its own row

        d = client.get("/api/panel/devices", headers=hdr).json()
        assert (d["total"], d["checks"], d["ok"], d["warn"], d["fail"]) == (5, 6, 3, 1, 1)
        assert d["rooms"] == ["Lab 2", "Lab 5"]
        assert d["camera_first_try"] == 4          # PC-01 of Lab 2 needed a second try
        assert d["median_fps"] == 27.5
        assert d["issues"] == {"slow": 1, "too_slow": 1}
        first = d["stations"][0]
        assert (first["station"], first["verdict"]) == ("PC-03", "fail")      # problems first
        pc1 = next(s for s in d["stations"] if s["room"] == "Lab 2" and s["station"] == "PC-01")
        assert (pc1["verdict"], pc1["attempts"], pc1["camera_first_try"]) == ("ok", 2, False)

        lab5 = client.get("/api/panel/devices?room=Lab 5", headers=hdr).json()
        assert lab5["total"] == 1 and lab5["rooms"] == ["Lab 2", "Lab 5"]

    def test_window_in_days(self, client, monkeypatch):
        hdr = _admin(monkeypatch)
        client.post("/api/diagnostics", json=_check())
        with SessionLocal() as db:
            db.add(DeviceCheck(**_check(station="PC-OLD"), created_at=datetime.now(timezone.utc) - timedelta(days=10)))
            db.commit()
        assert client.get("/api/panel/devices", headers=hdr).json()["total"] == 1
        assert client.get("/api/panel/devices?days=30", headers=hdr).json()["total"] == 2
        assert client.get("/api/panel/devices?days=0", headers=hdr).status_code == 422

    def test_empty(self, client):
        d = client.get("/api/panel/devices").json()      # ADMIN_TOKEN unset: open (dev)
        assert d["total"] == 0 and d["median_fps"] is None and d["stations"] == []


def test_purge_old_device_checks(client):
    client.post("/api/diagnostics", json=_check())
    with SessionLocal() as db:
        db.add(DeviceCheck(**_check(station="PC-OLD"), created_at=datetime.now(timezone.utc) - timedelta(days=60)))
        db.commit()
    assert privacy.main(["purge", "--diagnostics-days", "30", "--yes"]) == 0
    with SessionLocal() as db:
        assert [c.station for c in db.query(DeviceCheck)] == ["PC-01"]


def test_purge_zero_days_deletes_all_device_checks(client):
    """«0 = todos»: the pilot report closes with --diagnostics-days 0."""
    client.post("/api/diagnostics", json=_check())
    assert privacy.main(["purge", "--diagnostics-days", "0", "--yes"]) == 0
    with SessionLocal() as db:
        assert db.query(DeviceCheck).count() == 0


def test_purge_rejects_negative_days(client):
    import pytest
    with pytest.raises(SystemExit):
        privacy.main(["purge", "--diagnostics-days", "-1", "--yes"])
