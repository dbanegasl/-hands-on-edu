"""AttendEye attendance history (REQ-005) and gesture modules in the teacher panel."""
import dataclasses

from app import config


def _rollcall(client, class_name="5to A", statuses=("present", "present", "absent", "skipped"), **kw):
    names = ["Ana García", "Carlos López", "María Torres", "Pedro Jiménez", "Lucía Rodríguez"]
    body = {
        "mode": "rollcall", "class_name": class_name,
        "started_at": "2026-11-12T13:00:00Z", "ended_at": "2026-11-12T13:06:30Z",
        "records": [{"student_name": names[i], "status": st,
                     "marked_at": "2026-11-12T13:01:0%dZ" % i if st != "pending" else None,
                     "method": "gesture" if st == "present" else ("manual" if st != "pending" else None)}
                    for i, st in enumerate(statuses)],
        **kw,
    }
    r = client.post("/api/attendance", json=body)
    assert r.status_code == 201, r.text
    return r.json()


class TestAttendance:
    def test_create_and_summary(self, client):
        a = _rollcall(client)
        assert (a["total"], a["present"], a["absent"], a["skipped"]) == (4, 2, 1, 1)
        assert a["rate"] == 0.5 and a["duration_min"] == 6.5
        assert [r["student_name"] for r in a["records"]][:2] == ["Ana García", "Carlos López"]
        assert a["records"][0]["method"] == "gesture"

    def test_pending_students_do_not_lower_the_rate(self, client):
        assert _rollcall(client, statuses=("present", "absent", "pending"))["rate"] == 0.5

    def test_participation(self, client):
        r = client.post("/api/attendance", json={"mode": "participation", "class_name": "5to A", "records": [
            {"student_name": "Ana", "participations": 3}, {"student_name": "Luis", "participations": 0}]})
        assert r.status_code == 201
        assert r.json()["participations"] == 3 and r.json()["rate"] is None

    def test_list_filters_and_classes(self, client):
        _rollcall(client, "5to A", started_at="2026-11-10T13:00:00Z")
        _rollcall(client, "5to A", statuses=("present", "present", "present"), started_at="2026-11-12T13:00:00Z")
        _rollcall(client, "6to B", started_at="2026-11-11T13:00:00Z")
        rows = client.get("/api/attendance").json()
        assert [r["class_name"] for r in rows] == ["5to A", "6to B", "5to A"]          # newest first
        assert len(client.get("/api/attendance", params={"class_name": "6to B"}).json()) == 1
        assert client.get("/api/attendance", params={"mode": "participation"}).json() == []
        assert client.get("/api/attendance", params={"mode": "x"}).status_code == 422

        classes = client.get("/api/attendance/classes").json()
        assert [c["class_name"] for c in classes] == ["5to A", "6to B"]
        assert classes[0]["sessions"] == 2 and len(classes[0]["roster"]) == 3  # roster of the latest list

    def test_detail_csv_delete(self, client):
        a = _rollcall(client, class_name="5to A / Matemáticas")
        assert client.get(f"/api/attendance/{a['id']}").json()["records"][2]["status"] == "absent"
        r = client.get(f"/api/attendance/{a['id']}/export.csv", params={"tz": -300})
        assert r.status_code == 200 and 'filename="asistencia-5to-A---Matem' in r.headers["content-disposition"]
        lines = r.content.decode("utf-8-sig").splitlines()
        assert lines[0].startswith("Clase,Fecha,Modo,Estudiante,Estado,Hora")
        assert lines[1] == "5to A / Matemáticas,2026-11-12,Lista de asistencia,Ana García,Presente,08:01:00,Gesto,0"
        assert client.delete(f"/api/attendance/{a['id']}").status_code == 204
        assert client.get(f"/api/attendance/{a['id']}").status_code == 404
        assert client.delete(f"/api/attendance/{a['id']}").status_code == 404

    def test_validation(self, client):
        base = {"mode": "rollcall", "class_name": "X", "records": [{"student_name": "Ana"}]}
        assert client.post("/api/attendance", json={**base, "records": []}).status_code == 422
        assert client.post("/api/attendance", json={**base, "mode": "otro"}).status_code == 422
        assert client.post("/api/attendance", json={**base, "records": [{"student_name": "A", "status": "x"}]}).status_code == 422

    def test_requires_admin_token_when_set(self, client, monkeypatch):
        monkeypatch.setattr(config, "settings", dataclasses.replace(config.settings, admin_token="s3cret"))
        assert client.get("/api/attendance").status_code == 401
        assert client.post("/api/attendance", json={"mode": "rollcall", "class_name": "X",
                                                    "records": [{"student_name": "A"}]}).status_code == 401
        assert client.get("/api/attendance", headers={"X-Admin-Token": "s3cret"}).status_code == 200


# ── Panel: GestiEdu / MotivaSign / AttendEye in the installation-wide view ────

def _played(client, learner_id, module, activity, score, max_score, attempts=()):
    s = client.post("/api/sessions", json={"learner_id": learner_id, "module": module, "activity": activity,
                                           "language": "gestos" if module == "motivasign" else None}).json()
    if attempts:
        client.post(f"/api/sessions/{s['id']}/attempts", json={"attempts": [
            {"sign_id": sid, "correct": ok} for sid, ok in attempts]})
    client.post(f"/api/sessions/{s['id']}/finish", json={"score": score, "max_score": max_score})
    return s["id"]


def test_panel_summarises_gesture_modules(client):
    ana = client.post("/api/learners", json={"display_name": "Ana"}).json()["id"]
    luis = client.post("/api/learners", json={"display_name": "Luis"}).json()["id"]
    _played(client, ana, "gestiedu", "quiz", 8, 10)
    _played(client, luis, "gestiedu", "quiz", 4, 10)
    _played(client, ana, "motivasign", "challenge", 9, 10, attempts=[("uno", True), ("dos", False)])
    _played(client, ana, "motivasign", "learn", 3, 15)                 # practice: not averaged
    _rollcall(client)

    data = client.get("/api/panel/overview").json()
    ge, ms, ae = data["modules"]["gestiedu"], data["modules"]["motivasign"], data["modules"]["attendeye"]
    assert (ge["sessions"], ge["learners"], ge["avg_pct"]) == (2, 2, 60.0)
    assert (ms["sessions"], ms["scored"], ms["avg_pct"]) == (2, 1, 90.0)
    assert ae["rollcalls"] == 1 and ae["avg_rate"] == 0.5 and ae["last"]["class_name"] == "5to A"

    # Learners who only used the gesture modules are listed, with their activity.
    rows = {r["name"]: r for r in data["learners"]}
    assert rows["Luis"]["other_sessions"] == 1 and rows["Luis"]["has_activity"] is False
    assert rows["Luis"]["last_activity"] is not None
    detail = client.get(f"/api/panel/learners/{ana}").json()
    assert [(s["module"], s["label"]) for s in detail["other_sessions"]] == [
        ("MotivaSign", "Práctica libre"), ("MotivaSign", "Desafío"), ("GestiEdu", "Cuestionario")]
    assert detail["other_sessions"][1]["pct"] == 90.0
