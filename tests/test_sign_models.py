"""Trained sign classifier storage (REQ-010): publish, serve, activate, validate."""
import copy
import dataclasses
import json
from pathlib import Path

import pytest

from app import config

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "sign_model_small.json").read_text())
METRICS = {"baseline": {"accuracy": 0.8, "accept": 0.4, "false_accept": 0.01},
           "best": {"weight": 0.5, "accuracy": 0.95, "accept": 0.7, "false_accept": 0.01}, "recommended": True}


def _publish(client, model=None, **kw):
    body = {"model": model or FIXTURE, "metrics": METRICS, "author": "Docente", **kw}
    return client.post("/api/signs/lsec/models", json=body)


def test_no_active_model_is_204(client):
    assert client.get("/api/signs/lsec/model").status_code == 204
    assert client.get("/api/signs/lsec/models").json() == []
    assert client.get("/api/signs/xx/model").status_code == 404


def test_publish_a_model_trained_by_the_browser_code(client):
    r = _publish(client)
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["active"] is True and out["classes"] == ["num_1", "v"]
    assert out["template_count"] == 4 and out["metrics"]["recommended"] is True

    served = client.get("/api/signs/lsec/model").json()
    assert served["id"] == out["id"]
    for key in ("format", "feature_version", "classes", "W1", "b2", "weight", "trained_on"):
        assert served[key] == FIXTURE[key]


def test_new_model_replaces_the_active_one_and_old_can_be_restored(client):
    first = _publish(client).json()
    second = _publish(client).json()
    rows = client.get("/api/signs/lsec/models").json()
    assert [(m["id"], m["active"]) for m in rows] == [(second["id"], True), (first["id"], False)]
    assert "W1" not in rows[0]                                    # list has no weights

    assert client.post(f"/api/signs/lsec/models/{first['id']}/activate").json()["active"] is True
    assert client.get("/api/signs/lsec/model").json()["id"] == first["id"]

    draft = _publish(client, activate=False).json()                # stored, not active
    assert draft["active"] is False and client.get("/api/signs/lsec/model").json()["id"] == first["id"]

    assert client.delete("/api/signs/lsec/model").status_code == 204
    assert client.get("/api/signs/lsec/model").status_code == 204
    assert client.delete(f"/api/signs/lsec/models/{second['id']}").status_code == 204
    assert client.post(f"/api/signs/lsec/models/{second['id']}/activate").status_code == 404
    assert len(client.get("/api/signs/lsec/models").json()) == 2


@pytest.mark.parametrize("mutate, detail", [
    (lambda m: m["W1"].pop(), "W1"),
    (lambda m: m.update(classes=["v", "v"], b2=[0, 0], W2=m["W2"]), "repetidas"),
    (lambda m: m.update(classes=["hola", "v"]), "estáticas de una mano"),     # dynamic sign
    (lambda m: m.update(classes=["nope", "v"]), "estáticas de una mano"),
])
def test_rejects_inconsistent_models(client, mutate, detail):
    m = copy.deepcopy(FIXTURE)
    mutate(m)
    r = _publish(client, model=m)
    assert r.status_code == 422 and detail in r.text


def test_rejects_other_formats_and_non_finite_weights(client):
    assert _publish(client, model={**FIXTURE, "format": "x"}).status_code == 422
    body = json.dumps({"model": {**FIXTURE, "b1": [float("nan")] * len(FIXTURE["b1"])}})
    r = client.post("/api/signs/lsec/models", content=body, headers={"Content-Type": "application/json"})
    assert r.status_code == 422


def test_writes_require_admin_token_when_set(client, monkeypatch):
    model_id = _publish(client).json()["id"]
    monkeypatch.setattr(config, "settings", dataclasses.replace(config.settings, admin_token="s3cret"))
    assert _publish(client).status_code == 401
    assert client.post(f"/api/signs/lsec/models/{model_id}/activate").status_code == 401
    assert client.delete("/api/signs/lsec/model").status_code == 401
    assert client.get("/api/signs/lsec/model").status_code == 200        # learners read it without a token
    assert _publish(client).status_code == 401
    r = client.post("/api/signs/lsec/models", json={"model": FIXTURE}, headers={"X-Admin-Token": "s3cret"})
    assert r.status_code == 201
