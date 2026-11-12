"""Tests for learners, sessions, attempts and mastery (app/api/learning.py)."""
import pytest

from app.api.learning import MASTERED_THRESHOLD, compute_mastery


def _learner(client, name="Ana"):
    r = client.post("/api/learners", json={"display_name": name})
    assert r.status_code == 201
    return r.json()


def _session(client, learner_id, language="lsec", module="aula_senas"):
    r = client.post("/api/sessions", json={"learner_id": learner_id, "module": module, "language": language})
    assert r.status_code == 201
    return r.json()


class TestMastery:
    def test_empty_is_zero(self):
        assert compute_mastery([]) == 0.0

    def test_monotonic_in_successes(self):
        assert compute_mastery([True] * 3) < compute_mastery([True] * 6) < 1.0

    def test_recent_attempts_weigh_more(self):
        assert compute_mastery([False, False, True, True]) > compute_mastery([True, True, False, False])

    def test_reaches_mastered_after_streak(self):
        assert compute_mastery([True] * 4) >= MASTERED_THRESHOLD


class TestLearners:
    def test_create_and_get(self, client):
        learner = _learner(client, "  Luis  ")
        assert learner["display_name"] == "Luis"
        assert client.get(f"/api/learners/{learner['id']}").json()["id"] == learner["id"]

    def test_get_unknown_404(self, client):
        assert client.get("/api/learners/nope").status_code == 404

    @pytest.mark.parametrize("name", ["", "x" * 121])
    def test_invalid_name(self, client, name):
        assert client.post("/api/learners", json={"display_name": name}).status_code == 422


class TestSessions:
    def test_full_flow(self, client):
        learner = _learner(client)
        sess = _session(client, learner["id"])
        assert sess["ended_at"] is None

        r = client.post(f"/api/sessions/{sess['id']}/attempts", json={"attempts": [
            {"sign_id": "a", "correct": True, "confidence": 0.9, "response_ms": 1800},
            {"sign_id": "e", "correct": False},
        ]})
        assert r.status_code == 201 and r.json() == {"recorded": 2}

        done = client.post(f"/api/sessions/{sess['id']}/finish", json={"score": 1, "max_score": 2, "details": {"unit": "u1"}})
        assert done.status_code == 200
        assert done.json()["ended_at"] is not None and done.json()["score"] == 1

        # A finished session is closed for writes.
        assert client.post(f"/api/sessions/{sess['id']}/finish", json={}).status_code == 409
        late = client.post(f"/api/sessions/{sess['id']}/attempts", json={"attempts": [{"sign_id": "a", "correct": True}]})
        assert late.status_code == 409

    def test_session_needs_existing_learner(self, client):
        r = client.post("/api/sessions", json={"learner_id": "ghost", "module": "x"})
        assert r.status_code == 404

    def test_attempts_need_language(self, client):
        learner = _learner(client)
        r = client.post("/api/sessions", json={"learner_id": learner["id"], "module": "gestiedu"})
        sid = r.json()["id"]
        res = client.post(f"/api/sessions/{sid}/attempts", json={"attempts": [{"sign_id": "a", "correct": True}]})
        assert res.status_code == 422

    @pytest.mark.parametrize("attempt", [
        {"sign_id": "a", "correct": True, "confidence": 1.5},
        {"sign_id": "a", "correct": True, "response_ms": -1},
        {"sign_id": "", "correct": True},
    ])
    def test_attempt_validation(self, client, attempt):
        sess = _session(client, _learner(client)["id"])
        r = client.post(f"/api/sessions/{sess['id']}/attempts", json={"attempts": [attempt]})
        assert r.status_code == 422

    def test_empty_batch_rejected(self, client):
        sess = _session(client, _learner(client)["id"])
        assert client.post(f"/api/sessions/{sess['id']}/attempts", json={"attempts": []}).status_code == 422

    def test_unknown_session_404(self, client):
        assert client.post("/api/sessions/nope/finish", json={}).status_code == 404


class TestProgress:
    def test_progress_aggregates_per_sign(self, client):
        learner = _learner(client)
        sess = _session(client, learner["id"])
        attempts = [{"sign_id": "a", "correct": ok} for ok in (False, True, True, True, True)]
        attempts += [{"sign_id": "b", "correct": False}]
        client.post(f"/api/sessions/{sess['id']}/attempts", json={"attempts": attempts})

        p = client.get(f"/api/learners/{learner['id']}/progress", params={"language": "lsec"}).json()
        assert p["total_attempts"] == 6
        assert p["signs_practiced"] == 2
        by_id = {s["sign_id"]: s for s in p["signs"]}
        assert by_id["a"]["attempts"] == 5 and by_id["a"]["correct"] == 4
        assert by_id["a"]["accuracy"] == pytest.approx(0.8)
        assert by_id["a"]["mastery"] == pytest.approx(compute_mastery([False, True, True, True, True]), abs=1e-4)
        assert by_id["b"]["mastery"] == 0.0
        assert p["signs_mastered"] == (1 if by_id["a"]["mastery"] >= MASTERED_THRESHOLD else 0)

    def test_progress_is_per_language_and_learner(self, client):
        ana, luis = _learner(client, "Ana"), _learner(client, "Luis")
        s1 = _session(client, ana["id"], language="lsec")
        client.post(f"/api/sessions/{s1['id']}/attempts", json={"attempts": [{"sign_id": "a", "correct": True}]})
        assert client.get(f"/api/learners/{luis['id']}/progress", params={"language": "lsec"}).json()["total_attempts"] == 0
        assert client.get(f"/api/learners/{ana['id']}/progress", params={"language": "lsm"}).json()["total_attempts"] == 0

    def test_progress_requires_language(self, client):
        learner = _learner(client)
        assert client.get(f"/api/learners/{learner['id']}/progress").status_code == 422


class TestSessionHistory:
    def test_lists_newest_first_with_filters(self, client):
        learner = _learner(client)
        s1 = _session(client, learner["id"], module="aula_senas")
        client.post(f"/api/sessions/{s1['id']}/finish", json={"score": 4, "max_score": 5, "details": {"unit": "u1"}})
        s2 = _session(client, learner["id"], module="aula_senas")
        _session(client, learner["id"], module="gestiedu")

        rows = client.get(f"/api/learners/{learner['id']}/sessions", params={"module": "aula_senas"}).json()
        assert [r["id"] for r in rows] == [s2["id"], s1["id"]]
        assert rows[1]["details"] == {"unit": "u1"}

        done = client.get(f"/api/learners/{learner['id']}/sessions", params={"finished": True}).json()
        assert [r["id"] for r in done] == [s1["id"]]
        open_ = client.get(f"/api/learners/{learner['id']}/sessions", params={"finished": False}).json()
        assert len(open_) == 2
        assert len(client.get(f"/api/learners/{learner['id']}/sessions", params={"limit": 1}).json()) == 1

    def test_unknown_learner_404(self, client):
        assert client.get("/api/learners/nope/sessions").status_code == 404


def test_deleting_learner_cascades(client):
    """ORM delete of a learner removes its sessions and attempts (no orphan updates)."""
    from sqlalchemy import func, select

    from app.db import SessionLocal
    from app.models import ActivitySession, Learner, SignAttempt

    learner = _learner(client)
    sess = _session(client, learner["id"])
    client.post(f"/api/sessions/{sess['id']}/attempts", json={"attempts": [{"sign_id": "a", "correct": True}]})
    with SessionLocal() as db:
        db.delete(db.get(Learner, learner["id"]))
        db.commit()
        assert db.scalar(select(func.count()).select_from(ActivitySession)) == 0
        assert db.scalar(select(func.count()).select_from(SignAttempt)) == 0
