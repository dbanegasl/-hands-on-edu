"""Tests for sign-language catalogs and reference templates (app/api/signs.py)."""
import dataclasses
import json
from pathlib import Path
from unittest.mock import patch

import pytest

from app import config
from app.signs.catalog import CatalogError, _validate, get_catalog, validate_handshape

FIXTURES = Path(__file__).parent / "fixtures"


def _hand(handedness="Right"):
    return {"handedness": handedness, "landmarks": [[0.5, 0.5, 0.0]] * 21}


def _template(sign_id="a", kind="static", n=3, hands=1):
    return {
        "sign_id": sign_id,
        "kind": kind,
        "author": "Docente",
        "frames": [{"t": i * 33, "aspect": 1.333, "hands": [_hand() for _ in range(hands)]} for i in range(n)],
    }


# ── Catalog ───────────────────────────────────────────────────────────────────

class TestCatalog:
    def test_languages_lists_lsec(self, client):
        langs = client.get("/api/languages").json()
        lsec = next(lang for lang in langs if lang["code"] == "lsec")
        assert lsec["name"] == "Lengua de Señas Ecuatoriana"
        assert lsec["sign_count"] >= 40

    def test_catalog_shape(self, client):
        data = client.get("/api/signs/lsec/catalog").json()
        assert data["language"]["code"] == "lsec"
        ids = {s["id"] for s in data["signs"]}
        assert {"a", "b", "v", "num_1", "hola"} <= ids
        assert all(set(u["signs"]) <= ids for u in data["units"])

    def test_catalog_flags_content_as_unvalidated(self):
        data = get_catalog("lsec")
        assert data["language"]["status"] == "borrador"
        assert "validation_note" in data["language"]
        assert all(s["validated"] is False for s in data["signs"])

    def test_dynamic_signs_have_no_handshape_spec(self):
        for s in get_catalog("lsec")["signs"]:
            if s["kind"] == "dynamic":
                assert "handshape" not in s, s["id"]

    def test_unknown_language_404(self, client):
        assert client.get("/api/signs/klingon/catalog").status_code == 404
        assert client.get("/api/signs/klingon/templates").status_code == 404


class TestCatalogValidation:
    def _base(self, **sign):
        s = {"id": "x", "gloss": "X", "category": "c", "kind": "static", **sign}
        return {"language": {"code": "t"}, "categories": [{"id": "c"}], "signs": [s]}

    def test_valid_minimal(self):
        assert _validate("t", self._base())["signs"][0]["id"] == "x"

    @pytest.mark.parametrize("bad", [
        {"kind": "moving"},
        {"category": "nope"},
        {"handshape": {"index": "wiggly"}},
        {"handshape": {"thumb": "up"}},
        {"handshape": {"touch": [["thumb_tip"]]}},
        {"handshape": {"touch": [["thumb_tip", "elbow"]]}},
        {"handshape": {"crossed": ["index"]}},
        {"handshape": {"palm": "inside"}},
        {"handshape": {"mystery": 1}},
        {"confusable": ["ghost"]},
    ])
    def test_rejects_invalid_signs(self, bad):
        with pytest.raises(CatalogError):
            _validate("t", self._base(**bad))

    def test_rejects_handshape_on_dynamic_sign(self):
        with pytest.raises(CatalogError):
            _validate("t", self._base(kind="dynamic", handshape={"index": "extended"}))

    def test_rejects_duplicate_ids_and_code_mismatch(self):
        data = self._base()
        data["signs"].append(dict(data["signs"][0]))
        with pytest.raises(CatalogError):
            _validate("t", data)
        with pytest.raises(CatalogError):
            _validate("other", self._base())

    def test_rejects_unit_with_unknown_sign(self):
        data = self._base()
        data["units"] = [{"id": "u", "signs": ["x", "y"]}]
        with pytest.raises(CatalogError):
            _validate("t", data)

    def test_validate_handshape_accepts_full_vocabulary(self):
        validate_handshape("ok", {
            "index": "extended", "middle": "bent", "ring": "curled", "pinky": "not_extended",
            "thumb": "folded", "touch": [["thumb_tip", "index_tip"]], "together": [],
            "apart": [["index_tip", "middle_tip"]], "crossed": ["index", "middle"],
            "palm": "forward", "fingers": "up",
        })


# ── Templates ─────────────────────────────────────────────────────────────────

class TestTemplates:
    def test_create_list_delete(self, client):
        r = client.post("/api/signs/lsec/templates", json=_template())
        assert r.status_code == 201
        tpl = r.json()
        assert tpl["hands"] == 1 and tpl["kind"] == "static" and len(tpl["frames"]) == 3
        assert tpl["frames"][0]["aspect"] == pytest.approx(1.333)

        listed = client.get("/api/signs/lsec/templates", params={"sign_id": "a"}).json()
        assert [t["id"] for t in listed] == [tpl["id"]]
        assert client.get("/api/signs/lsec/templates", params={"sign_id": "b"}).json() == []

        assert client.delete(f"/api/signs/lsec/templates/{tpl['id']}").status_code == 204
        assert client.get("/api/signs/lsec/templates").json() == []
        assert client.delete(f"/api/signs/lsec/templates/{tpl['id']}").status_code == 404

    def test_timestamps_are_timezone_aware_after_reload(self, client):
        client.post("/api/signs/lsec/templates", json=_template())
        listed = client.get("/api/signs/lsec/templates").json()[0]
        assert listed["created_at"].endswith(("Z", "+00:00"))

    def test_two_hand_template_counts_hands(self, client):
        r = client.post("/api/signs/lsec/templates", json=_template(sign_id="nombre", kind="dynamic", n=6, hands=2))
        assert r.status_code == 201
        assert r.json()["hands"] == 2

    def test_unknown_sign_rejected(self, client):
        r = client.post("/api/signs/lsec/templates", json=_template(sign_id="zzz"))
        assert r.status_code == 422

    def test_short_dynamic_rejected(self, client):
        r = client.post("/api/signs/lsec/templates", json=_template(sign_id="j", kind="dynamic", n=3))
        assert r.status_code == 422

    @pytest.mark.parametrize("mutate", [
        lambda t: t["frames"][0]["hands"][0].update(landmarks=[[0, 0, 0]] * 20),
        lambda t: t["frames"][0]["hands"][0].update(landmarks=[[0, 0]] * 21),
        lambda t: t["frames"][0].update(hands=[]),
        lambda t: t["frames"][0].update(hands=[_hand(), _hand(), _hand()]),
        lambda t: t.update(frames=[]),
        lambda t: t.update(kind="wiggle"),
    ])
    def test_malformed_payload_rejected(self, client, mutate):
        body = _template()
        mutate(body)
        assert client.post("/api/signs/lsec/templates", json=body).status_code == 422

    def test_delete_wrong_language_404(self, client):
        tpl = client.post("/api/signs/lsec/templates", json=_template()).json()
        assert client.delete(f"/api/signs/klingon/templates/{tpl['id']}").status_code == 404

    def test_import_round_trip(self, client):
        client.post("/api/signs/lsec/templates", json=_template("a"))
        client.post("/api/signs/lsec/templates", json=_template("b"))
        exported = client.get("/api/signs/lsec/templates").json()
        body = {"templates": [
            {k: t[k] for k in ("sign_id", "kind", "frames", "author")} for t in exported
        ]}
        r = client.post("/api/signs/lsec/templates/import", json=body)
        assert r.json() == {"imported": 2}
        assert len(client.get("/api/signs/lsec/templates").json()) == 4

    def test_import_is_atomic(self, client):
        body = {"templates": [_template("a"), _template("not-a-sign")]}
        assert client.post("/api/signs/lsec/templates/import", json=body).status_code == 422
        assert client.get("/api/signs/lsec/templates").json() == []

    def test_real_landmarks_fixture_is_storable(self, client):
        """Landmarks from real photos (incl. world coords) round-trip through the API."""
        img = json.loads((FIXTURES / "real_hands.json").read_text())["images"]["victory"]
        body = {"sign_id": "v", "kind": "static", "frames": [{"t": 0, "aspect": img["aspect"], "hands": img["hands"]}]}
        r = client.post("/api/signs/lsec/templates", json=body)
        assert r.status_code == 201
        assert r.json()["frames"][0]["hands"][0]["world"] is not None


class TestAdminToken:
    @pytest.fixture
    def locked(self):
        with patch.object(config, "settings", dataclasses.replace(config.settings, admin_token="s3cret")):
            yield

    def test_write_requires_token(self, client, locked):
        assert client.post("/api/signs/lsec/templates", json=_template()).status_code == 401
        bad = client.post("/api/signs/lsec/templates", json=_template(), headers={"X-Admin-Token": "nope"})
        assert bad.status_code == 401
        ok = client.post("/api/signs/lsec/templates", json=_template(), headers={"X-Admin-Token": "s3cret"})
        assert ok.status_code == 201

    def test_reads_stay_public(self, client, locked):
        assert client.get("/api/signs/lsec/templates").status_code == 200
        assert client.get("/api/signs/lsec/catalog").status_code == 200
