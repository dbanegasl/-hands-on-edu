"""Interpreter review of signs (/validacion, REQ-023): API, catalog flags, catalog script."""
import dataclasses
import importlib.util
import json
from pathlib import Path

import pytest

from app import config
from app.main import APP_VERSION
from app.signs.catalog import CatalogError, _validate, get_catalog

_spec = importlib.util.spec_from_file_location(
    "apply_sign_reviews", Path(__file__).parent.parent / "scripts" / "apply-sign-reviews.py")
asr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(asr)

URL = "/api/signs/lsec/reviews"


def _review(**kw):
    body = {"sign_id": "a", "reviewer": "Ana Intérprete", "content_ok": True,
            "good_ok": 3, "good_trials": 3, "bad_ok": 0, "bad_trials": 3, "decision": "ok",
            "engine": {"templates": 4, "model": None}}
    body.update(kw)
    return body


class TestApi:
    def test_create_and_latest_per_sign(self, client):
        r = client.post(URL, json=_review(decision="regrabar", good_ok=2))
        assert r.status_code == 201, r.text
        assert r.json()["engine"] == {"templates": 4, "model": None, "app_version": APP_VERSION}
        client.post(URL, json=_review())                       # newer review of "a"
        client.post(URL, json=_review(sign_id="e", content_ok=False, content_note="  pulgar mal  ",
                                      decision="corregir", good_trials=0, good_ok=0, bad_trials=0))
        latest = client.get(URL).json()
        assert {r["sign_id"]: r["decision"] for r in latest} == {"a": "ok", "e": "corregir"}
        assert next(r for r in latest if r["sign_id"] == "e")["content_note"] == "pulgar mal"
        assert len(client.get(URL, params={"history": "true"}).json()) == 3

    @pytest.mark.parametrize("bad", [
        {"sign_id": "no-existe"},
        {"good_ok": 4, "good_trials": 3},
        {"bad_ok": 2, "bad_trials": 1},
        {"decision": "quizas"},
        {"reviewer": "   "},
        {"good_trials": 11},
    ])
    def test_rejects_invalid(self, client, bad):
        assert client.post(URL, json=_review(**bad)).status_code == 422

    def test_unknown_language(self, client):
        assert client.post("/api/signs/klingon/reviews", json=_review()).status_code == 404
        assert client.get("/api/signs/klingon/reviews").status_code == 404

    def test_admin_token_required_when_set(self, client, monkeypatch):
        monkeypatch.setattr(config, "settings", dataclasses.replace(config.settings, admin_token="s3cret"))
        assert client.post(URL, json=_review()).status_code == 401
        assert client.get(URL).status_code == 401
        h = {"X-Admin-Token": "s3cret"}
        assert client.post(URL, json=_review(), headers=h).status_code == 201
        assert len(client.get(URL, headers=h).json()) == 1

    def test_page_served(self, client):
        r = client.get("/validacion")
        assert r.status_code == 200 and 'id="vl-app"' in r.text


class TestCatalogFields:
    def _base(self, **sign):
        s = {"id": "x", "gloss": "X", "category": "c", "kind": "static", "validated": False, **sign}
        return {"language": {"code": "t"}, "categories": [{"id": "c"}], "signs": [s]}

    def test_valid(self):
        _validate("t", self._base(validated=True, validated_by="Ana", validated_at="2026-11-20", assess=False))

    @pytest.mark.parametrize("bad", [
        {"validated": "sí"},
        {"assess": "no"},
        {"validated": True, "validated_by": "Ana"},                                   # without date
        {"validated": True, "validated_at": "2026-11-20"},                            # without name
        {"validated": False, "validated_by": "Ana", "validated_at": "2026-11-20"},    # not validated
        {"validated": True, "validated_by": " ", "validated_at": "2026-11-20"},
        {"validated": True, "validated_by": "Ana", "validated_at": "20/11/2026"},
    ])
    def test_invalid(self, bad):
        with pytest.raises(CatalogError):
            _validate("t", self._base(**bad))


def _row(sign_id, created_at="2026-11-20T10:00:00", **kw):
    r = _review(sign_id=sign_id, **kw)
    r["created_at"] = created_at
    return r


class TestApplyScript:
    def test_target_flags(self):
        assert asr.target_flags(_row("a")) == {
            "validated": True, "assess": True, "validated_by": "Ana Intérprete", "validated_at": "2026-11-20"}
        assert asr.target_flags(_row("a", content_ok=False, decision="corregir"))["validated"] is False
        # The engine accepted it done wrong: out of evaluations, content can still be validated.
        f = asr.target_flags(_row("a", bad_ok=1, decision="retirar"))
        assert f["assess"] is False and f["validated"] is True
        # ...unless the interpreter judged it fine and overrode the decision.
        assert asr.target_flags(_row("a", bad_ok=1, decision="ok"))["assess"] is True

    def test_latest_review_wins(self):
        rows = [_row("a", "2026-11-21T09:00:00", decision="retirar", bad_ok=2), _row("a", "2026-11-20T09:00:00")]
        assert asr.latest_reviews(rows)["a"]["decision"] == "retirar"

    def test_apply_and_catalog_still_valid(self):
        catalog = json.loads(json.dumps(get_catalog("lsec")))
        changes = asr.apply(catalog, [
            _row("a"), _row("e", bad_ok=2, decision="retirar"),
            _row("i", content_ok=False, decision="corregir"), _row("zzz"),
        ])
        signs = {s["id"]: s for s in catalog["signs"]}
        assert signs["a"]["validated"] is True and signs["a"]["validated_by"] == "Ana Intérprete"
        assert "assess" not in signs["a"]
        assert signs["e"]["assess"] is False and signs["e"]["validated"] is True
        assert signs["i"]["validated"] is False and "validated_by" not in signs["i"]
        assert any("zzz" in c for c in changes)
        _validate("lsec", catalog)                        # what the app will load
        # A later review that fixes it puts the sign back in evaluations.
        asr.apply(catalog, [_row("e", "2026-12-01T10:00:00")])
        assert "assess" not in signs["e"]

    def test_main_dry_run_and_write(self, tmp_path, capsys):
        cat = tmp_path / "catalog.json"
        cat.write_text(json.dumps(get_catalog("lsec"), ensure_ascii=False, indent=2), encoding="utf-8")
        before = cat.read_text(encoding="utf-8")
        rev = tmp_path / "rev.json"
        rev.write_text(json.dumps({"language": "lsec", "reviews": [_row("a")]}), encoding="utf-8")
        assert asr.main([str(rev), "--catalog", str(cat)]) == 0
        assert cat.read_text(encoding="utf-8") == before
        assert "--write" in capsys.readouterr().out
        assert asr.main([str(rev), "--catalog", str(cat), "--write"]) == 0
        saved = json.loads(cat.read_text(encoding="utf-8"))
        assert next(s for s in saved["signs"] if s["id"] == "a")["validated_by"] == "Ana Intérprete"
        # Same layout as the repo file: only the changed sign shows in the diff.
        diff = [line for line in cat.read_text(encoding="utf-8").splitlines() if line not in before.splitlines()]
        assert len(diff) <= 4          # validated, validated_by, validated_at (+ a comma)

    def test_wrong_language(self, tmp_path):
        cat = tmp_path / "catalog.json"
        cat.write_text(json.dumps(get_catalog("lsec")), encoding="utf-8")
        rev = tmp_path / "rev.json"
        rev.write_text(json.dumps({"language": "lsb", "reviews": []}), encoding="utf-8")
        assert asr.main([str(rev), "--catalog", str(cat)]) == 2
