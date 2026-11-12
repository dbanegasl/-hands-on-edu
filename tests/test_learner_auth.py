"""Who may read and write a learner's data (TD-013)."""
import dataclasses

import pytest

from app import config
from app.api.deps import hash_learner_secret
from app.db import SessionLocal
from app.integrations.lti import keys
from app.models import Learner


def _hdr(token):
    return {"X-Learner-Token": token}


@pytest.fixture
def ana(client):
    """A local profile created by `client` (the device that keeps its token)."""
    r = client.post("/api/learners", json={"display_name": "Ana"})
    assert r.status_code == 201
    return r.json()


def _learner_paths(learner_id):
    return [f"/api/learners/{learner_id}",
            f"/api/learners/{learner_id}/sessions",
            f"/api/learners/{learner_id}/progress?language=lsec"]


def _make_learner(**fields):
    with SessionLocal() as db:
        learner = Learner(display_name=fields.pop("display_name", "X"), **fields)
        db.add(learner)
        db.commit()
        return learner.id


class TestLocalProfiles:
    def test_token_is_returned_once_and_stored_hashed(self, client, ana):
        assert len(ana["token"]) >= 40
        got = client.get(f"/api/learners/{ana['id']}").json()
        assert "token" not in got
        with SessionLocal() as db:
            stored = db.get(Learner, ana["id"]).secret_hash
        assert stored == hash_learner_secret(ana["token"]) and ana["token"] not in stored

    def test_owner_device_reads_and_writes(self, stranger, ana):
        for path in _learner_paths(ana["id"]):
            assert stranger.get(path, headers=_hdr(ana["token"])).status_code == 200
        s = stranger.post("/api/sessions", headers=_hdr(ana["token"]),
                          json={"learner_id": ana["id"], "module": "aula_senas", "language": "lsec"})
        assert s.status_code == 201

    def test_without_token_nothing_is_readable(self, stranger, ana):
        for path in _learner_paths(ana["id"]):
            r = stranger.get(path)
            assert r.status_code == 401 and "credencial" in r.json()["detail"]

    def test_wrong_or_other_learners_token_is_forbidden(self, client, stranger, ana):
        luis = client.post("/api/learners", json={"display_name": "Luis"}).json()
        for token in ("nope", luis["token"]):
            for path in _learner_paths(ana["id"]):
                assert stranger.get(path, headers=_hdr(token)).status_code == 403

    def test_stranger_cannot_write_into_someone_elses_sessions(self, client, stranger, ana):
        r = stranger.post("/api/sessions", json={"learner_id": ana["id"], "module": "aula_senas", "language": "lsec"})
        assert r.status_code == 401

        sess = client.post("/api/sessions", json={"learner_id": ana["id"], "module": "aula_senas",
                                                  "language": "lsec", "activity": "quiz:u1"}).json()
        attempts = {"attempts": [{"sign_id": "a", "correct": True}]}
        assert stranger.post(f"/api/sessions/{sess['id']}/attempts", json=attempts).status_code == 401
        assert stranger.post(f"/api/sessions/{sess['id']}/finish",
                             json={"score": 5, "max_score": 5}, headers=_hdr("nope")).status_code == 403
        # The owner's session is untouched and can still be completed.
        assert client.get(f"/api/learners/{ana['id']}/progress?language=lsec").json()["total_attempts"] == 0
        assert client.post(f"/api/sessions/{sess['id']}/finish", json={"score": 1, "max_score": 5}).status_code == 200

    def test_unknown_learner_or_session_is_404(self, stranger):
        assert stranger.get("/api/learners/nope").status_code == 404
        assert stranger.post("/api/sessions/nope/finish", json={"score": 0, "max_score": 1}).status_code == 404


class TestAdminToken:
    def test_admin_token_opens_any_profile_when_configured(self, stranger, ana, monkeypatch):
        monkeypatch.setattr(config, "settings", dataclasses.replace(config.settings, admin_token="s3cret"))
        for path in _learner_paths(ana["id"]):
            assert stranger.get(path, headers={"X-Admin-Token": "s3cret"}).status_code == 200
        assert stranger.get(_learner_paths(ana["id"])[0], headers={"X-Admin-Token": "bad"}).status_code == 401

    def test_admin_header_is_not_a_bypass_when_admin_token_is_unset(self, stranger, ana):
        assert config.settings.admin_token == ""
        assert stranger.get(_learner_paths(ana["id"])[0], headers={"X-Admin-Token": ""}).status_code == 401
        assert stranger.get(_learner_paths(ana["id"])[0], headers={"X-Admin-Token": "x"}).status_code == 401


class TestLtiLearners:
    def _token(self, learner_id):
        with SessionLocal() as db:
            return keys.issue_app_token(db, learner_id=learner_id, launch_id="launch-x", instructor=False)

    def test_launch_token_of_that_learner_only(self, stranger, ana):
        lti_id = _make_learner(display_name="Eva", external_id="https://lms|eva")
        own = {"Authorization": "Bearer " + self._token(lti_id)}
        for path in _learner_paths(lti_id):
            assert stranger.get(path, headers=own).status_code == 200
        # Someone else's launch token, or a local profile token, does not open it.
        other = {"Authorization": "Bearer " + self._token(ana["id"])}
        assert stranger.get(_learner_paths(lti_id)[0], headers=other).status_code == 403
        assert stranger.get(_learner_paths(lti_id)[0], headers=_hdr(ana["token"])).status_code == 403
        assert stranger.get(_learner_paths(lti_id)[0]).status_code == 401

    def test_launch_token_cannot_reach_a_local_profile(self, stranger, ana):
        lti_id = _make_learner(display_name="Eva", external_id="https://lms|eva2")
        hdrs = {"Authorization": "Bearer " + self._token(lti_id), "X-Learner-Token": ana["token"]}
        assert stranger.get(_learner_paths(ana["id"])[0], headers=hdrs).status_code == 403


class TestClaimLegacyProfiles:
    def test_profile_from_before_v017_is_claimed_once(self, client, stranger):
        legacy = _make_learner(display_name="Antigua")
        assert stranger.get(_learner_paths(legacy)[0]).status_code == 401

        r = client.post(f"/api/learners/{legacy}/claim")
        assert r.status_code == 200 and r.json()["id"] == legacy
        token = r.json()["token"]
        assert stranger.get(_learner_paths(legacy)[0], headers=_hdr(token)).status_code == 200
        # Once claimed, nobody else can claim it.
        assert stranger.post(f"/api/learners/{legacy}/claim").status_code == 409

    def test_new_and_lti_profiles_cannot_be_claimed(self, stranger, ana):
        lti_id = _make_learner(display_name="Eva", external_id="https://lms|eva3")
        assert stranger.post(f"/api/learners/{ana['id']}/claim").status_code == 409
        assert stranger.post(f"/api/learners/{lti_id}/claim").status_code == 409
        assert stranger.post("/api/learners/nope/claim").status_code == 404
