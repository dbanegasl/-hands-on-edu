"""
Teacher panel (REQ-007): scope (LTI instructor course vs. admin), roster via
NRPS, per-learner and per-sign aggregates, grade retry and CSV export.
The LMS is the fake platform of test_lti (httpx.MockTransport).
"""
import dataclasses
from datetime import datetime, timedelta, timezone

import pytest

from app import config
from app.api import panel
from app.models import ActivitySession
from tests.test_lti import (  # noqa: F401  (platform is a fixture)
    CLAIM,
    INSTRUCTOR,
    LEARNER,
    _auth,
    _launch,
    _token_from,
    platform,
)

COURSE = {"id": "c-1", "label": "LSEC1", "title": "Lengua de Señas I"}
OTHER_COURSE = {"id": "c-2", "label": "LSEC2", "title": "Lengua de Señas II"}


def _member(sub, name, role=LEARNER, status="Active"):
    return {"user_id": sub, "name": name, "roles": [role], "status": status}


def _lti(client, sub="u-42", name="Ana Quishpe", roles=(LEARNER,), context=COURSE, **kw):
    _, token = _token_from(_launch(client, sub=sub, name=name, roles=roles, **{CLAIM + "context": context}, **kw))
    return token


def _learner_id(client, token):
    return client.get("/api/lti/me", headers=_auth(token)).json()["learner"]["id"]


def _session(client, token=None, learner_id=None, activity="quiz:u1", attempts=(), score=None, max_score=None):
    headers = _auth(token) if token else {}
    learner_id = learner_id or _learner_id(client, token)
    sess = client.post("/api/sessions", headers=headers, json={
        "learner_id": learner_id, "module": "aula_senas", "activity": activity, "language": "lsec"}).json()
    if attempts:
        r = client.post(f"/api/sessions/{sess['id']}/attempts", json={"attempts": [
            {"sign_id": s, "correct": ok, "response_ms": 900} for s, ok in attempts]})
        assert r.status_code == 201
    if score is not None:
        client.post(f"/api/sessions/{sess['id']}/finish", headers=headers, json={"score": score, "max_score": max_score})
    return sess["id"]


def _overview(client, token=None, **headers):
    h = {**(_auth(token) if token else {}), **headers}
    r = client.get("/api/panel/overview", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


# ── Access ───────────────────────────────────────────────────────────────────

class TestAccess:
    def test_page_served(self, client):
        r = client.get("/panel")
        assert r.status_code == 200 and "text/html" in r.headers["content-type"]

    def test_learner_token_is_forbidden(self, client, platform):
        assert client.get("/api/panel/overview", headers=_auth(_lti(client))).status_code == 403

    def test_admin_token_required_when_set(self, client, monkeypatch):
        monkeypatch.setattr(config, "settings", dataclasses.replace(config.settings, admin_token="s3cret"))
        assert client.get("/api/panel/overview").status_code == 401
        assert client.get("/api/panel/overview", headers={"X-Admin-Token": "nope"}).status_code == 401
        assert _overview(client, **{"X-Admin-Token": "s3cret"})["scope"]["kind"] == "all"

    def test_unknown_language(self, client):
        assert client.get("/api/panel/overview", params={"language": "xx"}).status_code == 404

    def test_instructor_may_launch_into_panel(self, client, platform):
        r = _launch(client, roles=(INSTRUCTOR,), **{CLAIM + "target_link_uri": "http://localhost:9876/panel"})
        assert _token_from(r)[0] == "/panel"


# ── Installation-wide view (admin) ───────────────────────────────────────────

class TestAllScope:
    def test_empty(self, client):
        data = _overview(client)
        assert data["learners"] == [] and data["summary"]["learners"] == 0
        assert data["roster"]["status"] == "n/a" and len(data["weekly"]) == panel.WEEKS
        assert [u["id"] for u in data["units"]][:2] == ["u1", "u2"]

    def test_aggregates(self, client):
        ana = client.post("/api/learners", json={"display_name": "Ana"}).json()["id"]
        luis = client.post("/api/learners", json={"display_name": "Luis"}).json()["id"]
        _session(client, learner_id=ana, attempts=[("a", True), ("e", True), ("i", False)], score=4, max_score=5)
        _session(client, learner_id=ana, activity="quiz:u1", score=3, max_score=5)      # worse retry
        _session(client, learner_id=ana, activity="lesson:u2", attempts=[("b", True)] * 5, score=5, max_score=5)
        _session(client, learner_id=luis, attempts=[("a", False), ("i", False)], score=1, max_score=5)
        _session(client, learner_id=luis, activity="quiz:u2")                          # never finished

        data = _overview(client)
        rows = {r["name"]: r for r in data["learners"]}
        assert list(rows) == ["Ana", "Luis"]
        a = rows["Ana"]
        assert a["units"] == {"u1": {"best": 80.0, "passed": True}}   # lessons don't count, best kept
        assert a["units_passed"] == 1 and a["quizzes"] == 2 and a["sessions"] == 3
        assert a["signs_practiced"] == 4 and a["signs_mastered"] == 1   # only B (5 in a row) reaches 0.8
        assert rows["Luis"]["units"] == {"u1": {"best": 20.0, "passed": False}}

        assert data["summary"]["learners"] == 2 and data["summary"]["active_7d"] == 2
        assert data["summary"]["best_avg"] == 50.0
        u1 = next(u for u in data["units"] if u["id"] == "u1")
        assert u1 == {**u1, "attempted": 2, "passed": 1, "best_avg": 50.0}
        assert data["weekly"][-1]["active_learners"] == 2 and data["weekly"][-1]["sessions"] == 5

        signs = {s["sign_id"]: s for s in data["signs"]}
        assert data["signs"][0]["sign_id"] == "i" and signs["i"]["accuracy"] == 0.0 and signs["i"]["learners"] == 2
        assert signs["a"]["accuracy"] == 0.5 and signs["a"]["gloss"] == "A"

    def test_learner_detail(self, client):
        ana = client.post("/api/learners", json={"display_name": "Ana"}).json()["id"]
        _session(client, learner_id=ana, attempts=[("a", True), ("a", True)], score=2, max_score=2)
        r = client.get(f"/api/panel/learners/{ana}")
        assert r.status_code == 200
        d = r.json()
        assert d["learner"]["name"] == "Ana" and d["summary"]["units_passed"] == 1
        u1 = d["units"][0]
        a = next(s for s in u1["signs"] if s["sign_id"] == "a")
        assert a["attempts"] == 2 and a["accuracy"] == 1.0
        assert "attempts" not in next(s for s in u1["signs"] if s["sign_id"] == "e")  # not practised
        (s,) = d["sessions"]
        assert s["label"] == "Evaluación · Vocales" and s["pct"] == 100.0 and s["grade"] is None
        assert client.get("/api/panel/learners/nope").status_code == 404

    def test_csv(self, client):
        ana = client.post("/api/learners", json={"display_name": "Ana, la del fondo"}).json()["id"]
        _session(client, learner_id=ana, score=4, max_score=5)
        r = client.get("/api/panel/export.csv")
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
        assert "attachment" in r.headers["content-disposition"]
        text = r.content.decode("utf-8")
        assert text.startswith("﻿Estudiante,")
        assert '"Ana, la del fondo"' in text and ",80," in text


# ── Course view (LTI instructor + NRPS) ──────────────────────────────────────

class TestCourseScope:
    def test_roster_and_course_isolation(self, client, platform):
        platform.members = [_member("u-42", "Ana Quishpe"), _member("u-50", "Carlos Tenesaca"),
                            _member("t-1", "Luis Andrade", INSTRUCTOR), _member("u-60", "Retirada", status="Inactive")]
        ana = _lti(client)
        _session(client, ana, attempts=[("a", True)], score=5, max_score=5)
        # Same learner in another course, and another learner only in that course.
        _session(client, _lti(client, context=OTHER_COURSE), activity="quiz:u2", score=1, max_score=5)
        _session(client, _lti(client, sub="u-77", name="Otro Curso", context=OTHER_COURSE), score=5, max_score=5)
        # The teacher's own practice doesn't count.
        teacher = _lti(client, sub="t-1", name="Luis Andrade", roles=(INSTRUCTOR,))
        _session(client, teacher, score=0, max_score=5)

        data = _overview(client, teacher)
        assert data["scope"] == {"kind": "course", "title": "Lengua de Señas I", "platform": "Moodle de prueba",
                                 "label": "LSEC1"}
        assert data["roster"] == {"status": "ok", "detail": None, "members": 2}
        rows = {r["name"]: r for r in data["learners"]}
        assert list(rows) == ["Ana Quishpe", "Carlos Tenesaca"]
        assert rows["Ana Quishpe"]["units"] == {"u1": {"best": 100.0, "passed": True}}   # not u2 from course 2
        assert rows["Carlos Tenesaca"] == {**rows["Carlos Tenesaca"], "id": None, "has_activity": False,
                                           "in_roster": True, "user_id": "u-50"}
        assert data["summary"]["learners"] == 2 and data["summary"]["with_activity"] == 1
        assert len(platform.roster_requests()) == 2          # paginated (2 per page)

        _overview(client, teacher)
        assert len(platform.roster_requests()) == 2          # cached

        other = next(r for r in _overview(client)["learners"] if r["name"] == "Otro Curso")  # admin sees all
        assert client.get(f"/api/panel/learners/{other['id']}", headers=_auth(teacher)).status_code == 404
        ana_id = rows["Ana Quishpe"]["id"]
        assert client.get(f"/api/panel/learners/{ana_id}", headers=_auth(teacher)).status_code == 200

    def test_without_nrps_lists_launched_learners(self, client, platform):
        _session(client, _lti(client, nrps=False), score=2, max_score=5)
        teacher = _lti(client, sub="t-1", roles=(INSTRUCTOR,), nrps=False)
        data = _overview(client, teacher)
        assert data["roster"]["status"] == "unavailable" and "Names and Role" in data["roster"]["detail"]
        assert [r["name"] for r in data["learners"]] == ["Ana Quishpe"]

    def test_roster_error_does_not_break_panel(self, client, platform):
        platform.roster_status = 500
        _session(client, _lti(client), score=2, max_score=5)
        data = _overview(client, _lti(client, sub="t-1", roles=(INSTRUCTOR,)))
        assert data["roster"]["status"] == "error"
        assert [r["name"] for r in data["learners"]] == ["Ana Quishpe"]

    def test_unenrolled_learner_without_activity_hidden(self, client, platform):
        platform.members = [_member("u-50", "Carlos Tenesaca")]
        _lti(client)  # Ana launched once, never practised, then left the course
        data = _overview(client, _lti(client, sub="t-1", roles=(INSTRUCTOR,)))
        assert [r["name"] for r in data["learners"]] == ["Carlos Tenesaca"]

    def test_retry_failed_grade(self, client, platform):
        platform.score_status = 500
        ana = _lti(client, custom={"unit": "u1"})
        sid = _session(client, ana, score=4, max_score=5)
        teacher = _lti(client, sub="t-1", roles=(INSTRUCTOR,))
        assert _overview(client, teacher)["summary"]["grades_failed"] == 1

        platform.score_status = 200
        r = client.post(f"/api/panel/sessions/{sid}/grade/retry", headers=_auth(teacher))
        assert r.status_code == 200 and r.json()["status"] == "sent" and r.json()["score_given"] == 80.0
        assert _overview(client, teacher)["summary"]["grades_failed"] == 0
        assert client.post(f"/api/panel/sessions/{sid}/grade/retry", headers=_auth(teacher)).status_code == 409

        other_teacher = _lti(client, sub="t-2", roles=(INSTRUCTOR,), context=OTHER_COURSE)
        assert client.post(f"/api/panel/sessions/{sid}/grade/retry", headers=_auth(other_teacher)).status_code == 404

    def test_launch_without_course(self, client, platform):
        _, token = _token_from(_launch(client, roles=(INSTRUCTOR,), **{CLAIM + "context": None}))
        assert client.get("/api/panel/overview", headers=_auth(token)).status_code == 409


# ── Pure helpers ─────────────────────────────────────────────────────────────

def _s(start, minutes=None, activity="quiz:u1", score=None, max_score=None, learner="l1"):
    return ActivitySession(id=f"s{start.timestamp()}", learner_id=learner, module="aula_senas", activity=activity,
                           language="lsec", started_at=start, score=score, max_score=max_score,
                           ended_at=start + timedelta(minutes=minutes) if minutes is not None else None)


def test_practice_time_is_capped_and_open_sessions_ignored():
    t = datetime(2026, 11, 2, 10, tzinfo=timezone.utc)
    summary = panel._learner_summary([_s(t, 30), _s(t + timedelta(days=1), 600), _s(t + timedelta(days=2))],
                                     [], {}, ["u1"])
    assert summary["practice_minutes"] == 90 and summary["sessions"] == 3


@pytest.mark.parametrize("day, bucket", [(9, 7), (15, 7), (16, 8)])  # Mon 9 Nov 2026 … Mon 16 Nov
def test_weekly_buckets_start_on_monday(day, bucket):
    now = datetime(2026, 11, 18, 12, tzinfo=timezone.utc)
    weeks = panel._weekly([_s(datetime(2026, 11, day, 9, tzinfo=timezone.utc), 5, score=1, max_score=2)], now)
    assert weeks[-1]["week_start"] == "2026-11-16"
    hit = [i + 1 for i, w in enumerate(weeks) if w["sessions"]]
    assert hit == [bucket] and weeks[bucket - 1]["quiz_avg"] == 50.0
