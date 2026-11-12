"""Learners' data rights (REQ-021): export, deletion, purge and the privacy notice data."""
import dataclasses
import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app import config, privacy
from app.db import SessionLocal
from app.integrations.lti import keys
from app.models import (
    ActivitySession,
    AttendanceRecord,
    AttendanceSession,
    Learner,
    LtiLaunch,
    LtiPlatform,
    LtiScoreSubmission,
    LtiSessionLink,
    SignAttempt,
)


def _with_activity(client, name="Ana"):
    learner = client.post("/api/learners", json={"display_name": name}).json()
    sess = client.post("/api/sessions", json={"learner_id": learner["id"], "module": "aula_senas",
                                              "language": "lsec", "activity": "quiz:u1"}).json()
    client.post(f"/api/sessions/{sess['id']}/attempts",
                json={"attempts": [{"sign_id": "a", "correct": True, "confidence": 0.9},
                                   {"sign_id": "b", "correct": False}]})
    client.post(f"/api/sessions/{sess['id']}/finish", json={"score": 1, "max_score": 2})
    return learner, sess


def _count(model, **where):
    with SessionLocal() as db:
        stmt = select(func.count()).select_from(model)
        for k, v in where.items():
            stmt = stmt.where(getattr(model, k) == v)
        return db.scalar(stmt)


def _lti_learner_with_grade():
    """An LMS learner with a launch, a linked session and a grade submission."""
    with SessionLocal() as db:
        platform = LtiPlatform(name="Moodle del colegio", issuer="https://lms.test", client_id="c",
                               auth_login_url="x", auth_token_url="x", jwks_url="x")
        learner = Learner(display_name="Eva", external_id="https://lms.test|eva")
        db.add_all([platform, learner])
        db.flush()
        launch = LtiLaunch(platform_id=platform.id, learner_id=learner.id, user_sub="eva", deployment_id="1",
                           message_type="LtiResourceLinkRequest", roles=["Learner"], context_title="LSEC 1",
                           resource_link_title="Unidad 1")
        sess = ActivitySession(learner_id=learner.id, module="aula_senas", language="lsec", activity="quiz:u1",
                               score=4, max_score=5)
        db.add_all([launch, sess])
        db.flush()
        db.add_all([LtiSessionLink(session_id=sess.id, launch_id=launch.id),
                    LtiScoreSubmission(session_id=sess.id, launch_id=launch.id, score_given=4, score_maximum=5,
                                       status="sent")])
        db.commit()
        token = keys.issue_app_token(db, learner_id=learner.id, launch_id=launch.id, instructor=False)
        return learner.id, platform.id, token


class TestPrivacyInfo:
    def test_defaults_are_empty(self, client):
        body = client.get("/api/privacy").json()
        assert body["controller"] is None and body["contact"] is None and body["retention_days"] is None
        assert "video" in body["not_stored"]

    def test_configured_values(self, client, monkeypatch):
        monkeypatch.setattr(config, "settings", dataclasses.replace(
            config.settings, privacy_controller="UE Ejemplo", privacy_contact="datos@ue.edu.ec",
            data_retention_days=365))
        assert client.get("/api/privacy").json() | {"not_stored": None} == {
            "controller": "UE Ejemplo", "contact": "datos@ue.edu.ec", "retention_days": 365, "not_stored": None}

    def test_page_is_served(self, client):
        r = client.get("/privacidad")
        assert r.status_code == 200 and "privacidad.js" in r.text

    @pytest.mark.parametrize("raw, ok", [("", 0), ("30", 30), ("x", None), ("-1", None)])
    def test_retention_env_is_validated(self, monkeypatch, raw, ok):
        monkeypatch.setenv("DATA_RETENTION_DAYS", raw)
        if ok is None:
            with pytest.raises(ValueError, match="DATA_RETENTION_DAYS"):
                config.load_settings()
        else:
            assert config.load_settings().data_retention_days == ok


class TestExport:
    def test_owner_downloads_everything_without_secrets(self, client):
        learner, sess = _with_activity(client)
        r = client.get(f"/api/learners/{learner['id']}/export")
        assert r.status_code == 200
        assert r.headers["content-disposition"].startswith("attachment;") and r.headers["cache-control"] == "no-store"
        data = r.json()
        assert data["learner"] == {"id": learner["id"], "display_name": "Ana", "origin": "local",
                                   "lms_identity": None, "created_at": data["learner"]["created_at"]}
        (s,) = data["sessions"]
        assert s["id"] == sess["id"] and s["score"] == 1 and [a["sign_id"] for a in s["attempts"]] == ["a", "b"]
        assert data["lms_launches"] == [] and data["grades_sent_to_lms"] == []
        assert learner["token"] not in r.text and "secret" not in r.text

    def test_needs_the_learners_credential(self, client, stranger):
        learner, _ = _with_activity(client)
        other = client.post("/api/learners", json={"display_name": "Luis"}).json()
        assert stranger.get(f"/api/learners/{learner['id']}/export").status_code == 401
        assert stranger.get(f"/api/learners/{learner['id']}/export",
                            headers={"X-Learner-Token": other["token"]}).status_code == 403

    def test_lms_learner_with_own_launch_token(self, client, stranger):
        learner_id, _, token = _lti_learner_with_grade()
        data = stranger.get(f"/api/learners/{learner_id}/export",
                            headers={"Authorization": "Bearer " + token}).json()
        assert data["learner"]["origin"] == "lms"
        assert data["lms_launches"][0] | {"created_at": None} == {
            "platform": "Moodle del colegio", "course": "LSEC 1", "activity": "Unidad 1", "roles": ["Learner"],
            "is_instructor": False, "created_at": None}
        assert data["grades_sent_to_lms"][0]["score_given"] == 4


class TestDelete:
    def test_owner_deletes_everything(self, client):
        learner, sess = _with_activity(client)
        keep, _ = _with_activity(client, "Luis")
        assert client.delete(f"/api/learners/{learner['id']}").status_code == 204
        assert _count(Learner, id=learner["id"]) == 0
        assert _count(ActivitySession, learner_id=learner["id"]) == 0
        assert _count(SignAttempt, learner_id=learner["id"]) == 0
        assert client.get(f"/api/learners/{learner['id']}").status_code == 404
        # Other learners are untouched.
        assert _count(SignAttempt, learner_id=keep["id"]) == 2

    def test_stranger_cannot_delete(self, client, stranger):
        learner, _ = _with_activity(client)
        assert stranger.delete(f"/api/learners/{learner['id']}").status_code == 401
        assert stranger.delete(f"/api/learners/{learner['id']}", headers={"X-Learner-Token": "x"}).status_code == 403
        assert _count(Learner, id=learner["id"]) == 1

    def test_admin_token_deletes_when_configured(self, client, stranger, monkeypatch):
        learner, _ = _with_activity(client)
        monkeypatch.setattr(config, "settings", dataclasses.replace(config.settings, admin_token="s3cret"))
        assert stranger.delete(f"/api/learners/{learner['id']}", headers={"X-Admin-Token": "s3cret"}).status_code == 204

    def test_lms_learner_deletes_own_data_and_launch_token_stops_working(self, client, stranger):
        learner_id, platform_id, token = _lti_learner_with_grade()
        hdr = {"Authorization": "Bearer " + token}
        assert stranger.delete(f"/api/learners/{learner_id}", headers=hdr).status_code == 204
        for model, where in ((LtiLaunch, {"learner_id": learner_id}), (LtiSessionLink, {}),
                             (LtiScoreSubmission, {}), (ActivitySession, {"learner_id": learner_id})):
            assert _count(model, **where) == 0, model
        assert _count(LtiPlatform, id=platform_id) == 1      # the LMS registration stays
        assert stranger.get("/api/lti/me", headers=hdr).status_code in (401, 404)


class TestPurge:
    def _age(self, learner_id, days):
        then = datetime.now(timezone.utc) - timedelta(days=days)
        with SessionLocal() as db:
            db.get(Learner, learner_id).created_at = then
            for s in db.scalars(select(ActivitySession).where(ActivitySession.learner_id == learner_id)):
                s.started_at = then
            db.commit()

    def test_inactive_learners_and_old_attendance(self, client, capsys):
        old, _ = _with_activity(client, "Antigua")
        recent, _ = _with_activity(client, "Reciente")
        self._age(old["id"], 400)
        # Created long ago but practised yesterday: kept.
        self._age(recent["id"], 400)
        client.post("/api/sessions", json={"learner_id": recent["id"], "module": "aula_senas", "language": "lsec"})
        with SessionLocal() as db:
            roll = AttendanceSession(mode="rollcall", class_name="3A",
                                     created_at=datetime.now(timezone.utc) - timedelta(days=200))
            roll.records.append(AttendanceRecord(student_name="Ana", status="present"))
            db.add_all([roll, AttendanceSession(mode="rollcall", class_name="3B")])
            db.commit()

        # Without --yes (and no terminal) nothing is deleted.
        assert privacy.main(["purge", "--days", "365", "--attendance-days", "180"]) == 1
        out = capsys.readouterr().out
        assert "Estudiantes sin actividad en 365 días: 1" in out and "Antigua" in out and "Reciente" not in out
        assert "asistencia de hace más de 180 días: 1" in out
        assert _count(Learner) == 2

        assert privacy.main(["purge", "--days", "365", "--attendance-days", "180", "--yes"]) == 0
        assert _count(Learner, id=old["id"]) == 0 and _count(Learner, id=recent["id"]) == 1
        assert _count(SignAttempt, learner_id=old["id"]) == 0
        assert _count(AttendanceSession) == 1 and _count(AttendanceRecord) == 0

    def test_purge_uses_retention_setting_or_asks_for_days(self, client, monkeypatch):
        with pytest.raises(SystemExit, match="--days"):
            privacy.main(["purge"])
        monkeypatch.setattr(config, "settings", dataclasses.replace(config.settings, data_retention_days=30))
        assert privacy.main(["purge"]) == 0          # nothing inactive yet


class TestCli:
    def test_find_export_delete(self, client, capsys, tmp_path):
        learner, _ = _with_activity(client, "Ana Pérez")
        assert privacy.main(["find", "pérez"]) == 0
        assert learner["id"] in capsys.readouterr().out
        assert privacy.main(["find", "nadie"]) == 1

        out = tmp_path / "ana.json"
        assert privacy.main(["export", learner["id"], "-o", str(out)]) == 0
        assert json.loads(out.read_text())["learner"]["display_name"] == "Ana Pérez"

        assert privacy.main(["delete", learner["id"]]) == 1        # no terminal, no --yes: kept
        assert _count(Learner, id=learner["id"]) == 1
        assert privacy.main(["delete", learner["id"], "--yes"]) == 0
        assert "1 sesiones, 2 intentos" in capsys.readouterr().out
        with pytest.raises(SystemExit, match="No existe"):
            privacy.main(["delete", learner["id"], "--yes"])


def test_every_table_with_learner_data_cascades_on_delete():
    """Deleting a learner must not leave rows behind: new tables need ondelete=CASCADE."""
    from app.db import Base
    owners = {"learners", "activity_sessions", "lti_launches"}
    for table in Base.metadata.tables.values():
        for fk in table.foreign_keys:
            if fk.column.table.name in owners:
                assert fk.ondelete == "CASCADE", f"{table.name}.{fk.parent.name} → {fk.column.table.name}"
