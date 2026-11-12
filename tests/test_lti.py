"""
LTI 1.3 tool (REQ-019) against a simulated platform: OIDC login, id_token
validation, SSO learner mapping, Deep Linking response and AGS grade passback.
The platform's JWKS, token endpoint and score endpoint are faked with an
httpx.MockTransport, so no Moodle is needed.
"""
import json
import time
from urllib.parse import parse_qs, urlsplit

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.integrations.lti import keys, launch as lti_launch, services
from app.integrations.lti.launch import AGS_CLAIM, AGS_SCOPE_SCORE, CLAIM, DL_CLAIM

ISS = "https://moodle.example.edu"
CLIENT_ID = "client-abc"
DEPLOYMENT = "1"
LINEITEM = f"{ISS}/mod/lti/services.php/2/lineitems/7/lineitem?type_id=3"
TOKEN_URL = f"{ISS}/mod/lti/token.php"
JWKS_URL = f"{ISS}/mod/lti/certs.php"
INSTRUCTOR = "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"
LEARNER = "http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"


def _rsa():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


PLATFORM_KEY = _rsa()
OTHER_KEY = _rsa()


def _jwk(private, kid):
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private.public_key()))
    return {**jwk, "kid": kid, "alg": "RS256", "use": "sig"}


class FakePlatform:
    """Records outbound calls and answers like Moodle's token/score endpoints."""

    def __init__(self):
        self.calls = []
        self.score_status = 200
        self.jwks = {"keys": [_jwk(PLATFORM_KEY, "plat-1")]}

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        url = str(request.url)
        if url == JWKS_URL:
            return httpx.Response(200, json=self.jwks)
        if url == TOKEN_URL:
            return httpx.Response(200, json={"access_token": "ags-token", "token_type": "Bearer", "expires_in": 3600})
        if "/scores" in url:
            return httpx.Response(self.score_status, json={})
        return httpx.Response(404)

    def scores(self):
        return [c for c in self.calls if "/scores" in str(c.url)]

    def token_requests(self):
        return [c for c in self.calls if str(c.url) == TOKEN_URL]


@pytest.fixture
def platform(client, monkeypatch):
    fake = FakePlatform()
    monkeypatch.setattr(lti_launch, "http_client", lambda: httpx.Client(transport=httpx.MockTransport(fake.handler)))
    monkeypatch.setattr(services, "http_client", lambda: httpx.Client(transport=httpx.MockTransport(fake.handler)))
    lti_launch._jwks_cache.clear()
    services._token_cache.clear()
    r = client.post("/api/lti/platforms", json={
        "name": "Moodle de prueba", "issuer": ISS, "client_id": CLIENT_ID,
        "auth_login_url": f"{ISS}/mod/lti/auth.php", "auth_token_url": TOKEN_URL, "jwks_url": JWKS_URL,
        "deployment_ids": [DEPLOYMENT],
    })
    assert r.status_code == 201, r.text
    fake.id = r.json()["id"]
    return fake


def _login(client, **extra):
    params = {"iss": ISS, "login_hint": "u-42", "target_link_uri": "http://localhost:9876/lti/launch",
              "client_id": CLIENT_ID, "lti_message_hint": "msg", **extra}
    r = client.get("/lti/login", params=params, follow_redirects=False)
    assert r.status_code == 302, r.text
    q = parse_qs(urlsplit(r.headers["location"]).query)
    return q["state"][0], q["nonce"][0], q


def _id_token(nonce, *, key=PLATFORM_KEY, kid="plat-1", roles=(LEARNER,), message=lti_launch.MSG_RESOURCE_LINK,
              custom=None, ags=True, **override):
    now = int(time.time())
    claims = {
        "iss": ISS, "aud": CLIENT_ID, "sub": "u-42", "iat": now, "exp": now + 300, "nonce": nonce,
        "name": "Ana Quishpe",
        CLAIM + "message_type": message,
        CLAIM + "version": "1.3.0",
        CLAIM + "deployment_id": DEPLOYMENT,
        CLAIM + "target_link_uri": "http://localhost:9876/lti/launch",
        CLAIM + "roles": list(roles),
        CLAIM + "context": {"id": "c-1", "label": "LSEC1", "title": "Lengua de Señas I"},
        CLAIM + "custom": custom or {},
    }
    if message == lti_launch.MSG_RESOURCE_LINK:
        claims[CLAIM + "resource_link"] = {"id": "rl-1", "title": "Vocales"}
    else:
        claims[DL_CLAIM] = {"deep_link_return_url": f"{ISS}/mod/lti/contentitem_return.php",
                            "accept_types": ["ltiResourceLink"], "data": "opaque-123"}
    if ags:
        claims[AGS_CLAIM] = {"scope": [AGS_SCOPE_SCORE], "lineitem": LINEITEM}
    claims.update(override)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": kid})


def _launch(client, **kw):
    state, nonce, _ = _login(client)
    r = client.post("/lti/launch", data={"id_token": _id_token(nonce, **kw), "state": state}, follow_redirects=False)
    return r


def _token_from(r):
    assert r.status_code == 303, r.text
    path, _, frag = r.headers["location"].partition("#lti=")
    return path, frag


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── Tool keys ────────────────────────────────────────────────────────────────

class TestJwks:
    def test_publishes_stable_rsa_key(self, client):
        a = client.get("/lti/jwks").json()["keys"]
        b = client.get("/lti/jwks").json()["keys"]
        assert a == b and len(a) == 1
        assert a[0]["kty"] == "RSA" and a[0]["alg"] == "RS256" and "d" not in a[0]

    @pytest.mark.parametrize("path", ["/lti/setup", "/lti/deeplink"])
    def test_pages_served(self, client, path):
        r = client.get(path)
        assert r.status_code == 200 and "text/html" in r.headers["content-type"]

    def test_tool_config_lists_urls(self, client):
        cfg = client.get("/api/lti/tool-config").json()
        assert cfg["initiate_login_url"].endswith("/lti/login")
        assert cfg["redirection_uris"] == [cfg["tool_url"]]
        assert cfg["jwks_url"].endswith("/lti/jwks")


# ── Login + launch ───────────────────────────────────────────────────────────

class TestLaunch:
    def test_login_redirects_to_platform_with_state_and_nonce(self, client, platform):
        _, _, q = _login(client)
        assert q["client_id"] == [CLIENT_ID]
        assert q["response_mode"] == ["form_post"] and q["prompt"] == ["none"]
        assert q["redirect_uri"][0].endswith("/lti/launch")
        assert q["lti_message_hint"] == ["msg"]

    def test_login_post_form(self, client, platform):
        r = client.post("/lti/login", data={"iss": ISS, "login_hint": "x", "target_link_uri": "t",
                                            "client_id": CLIENT_ID}, follow_redirects=False)
        assert r.status_code == 302

    @pytest.mark.parametrize("params", [
        {"iss": "https://unknown.example", "login_hint": "x", "target_link_uri": "t"},
        {"iss": ISS, "target_link_uri": "t"},
    ])
    def test_login_rejects_unknown_platform_or_missing_params(self, client, platform, params):
        r = client.get("/lti/login", params=params, follow_redirects=False)
        assert r.status_code == 400 and "HandsOnEdu" in r.text

    def test_learner_launch_creates_sso_learner(self, client, platform):
        path, token = _token_from(_launch(client))
        assert path == "/aula"
        me = client.get("/api/lti/me", headers=_auth(token)).json()
        assert me["learner"]["display_name"] == "Ana Quishpe"
        from app.db import SessionLocal
        from app.models import Learner

        with SessionLocal() as db:
            assert db.get(Learner, me["learner"]["id"]).external_id == f"lti:{platform.id}:u-42"
        assert me["launch"]["context_title"] == "Lengua de Señas I"
        assert me["launch"]["graded"] is True and me["launch"]["is_instructor"] is False

        # A second launch reuses the same learner.
        _, token2 = _token_from(_launch(client))
        assert client.get("/api/lti/me", headers=_auth(token2)).json()["learner"]["id"] == me["learner"]["id"]

    def test_instructor_may_target_sign_studio(self, client, platform):
        r = _launch(client, roles=(INSTRUCTOR,), **{CLAIM + "target_link_uri": "http://localhost:9876/signstudio"})
        path, token = _token_from(r)
        assert path == "/signstudio"
        assert client.get("/api/lti/me", headers=_auth(token)).json()["launch"]["is_instructor"] is True

    def test_learner_cannot_target_other_pages(self, client, platform):
        path, _ = _token_from(_launch(client, **{CLAIM + "target_link_uri": "http://localhost:9876/signstudio"}))
        assert path == "/aula"

    @pytest.mark.parametrize("kw, fragment", [
        ({"aud": "someone-else"}, "id_token inválido"),
        ({"exp": int(time.time()) - 3600}, "id_token inválido"),
        ({"iss": "https://evil.example"}, "id_token inválido"),
        ({"key": OTHER_KEY}, "id_token inválido"),
        ({"kid": "unknown-kid"}, "clave desconocida"),
        ({CLAIM + "version": "1.1"}, "Versión"),
        ({CLAIM + "message_type": "LtiSubmissionReviewRequest"}, "no soportado"),
        ({CLAIM + "deployment_id": "99"}, "despliegue"),
        ({CLAIM + "resource_link": None}, "resource_link"),
        ({"aud": [CLIENT_ID, "other"], "azp": "other"}, "azp"),
    ])
    def test_rejects_invalid_id_tokens(self, client, platform, kw, fragment):
        r = _launch(client, **kw)
        assert r.status_code == 400
        assert fragment in r.text

    def test_rejects_wrong_nonce_and_replayed_state(self, client, platform):
        state, nonce, _ = _login(client)
        bad = client.post("/lti/launch", data={"id_token": _id_token("not-the-nonce"), "state": state})
        assert bad.status_code == 400 and "nonce" in bad.text
        # The state was consumed by the failed attempt: replaying it fails too.
        again = client.post("/lti/launch", data={"id_token": _id_token(nonce), "state": state})
        assert again.status_code == 400 and "ya usada" in again.text

    def test_missing_fields(self, client, platform):
        assert client.post("/lti/launch", data={}).status_code == 400

    def test_jwks_refetched_on_key_rotation(self, client, platform):
        _token_from(_launch(client))  # caches plat-1
        platform.jwks = {"keys": [_jwk(OTHER_KEY, "plat-2")]}
        lti_launch._jwks_cache[JWKS_URL] = (time.time() - 120, lti_launch._jwks_cache[JWKS_URL][1])
        _token_from(_launch(client, key=OTHER_KEY, kid="plat-2"))


# ── App token ────────────────────────────────────────────────────────────────

class TestAppToken:
    def test_invalid_or_missing_tokens(self, client, platform):
        assert client.get("/api/lti/me").status_code == 401
        assert client.get("/api/lti/me", headers={"Authorization": "Basic abc"}).status_code == 401
        assert client.get("/api/lti/me", headers=_auth("garbage")).status_code == 401
        forged = jwt.encode({"sub": "x", "lti_launch": "y", "exp": int(time.time()) + 60}, OTHER_KEY,
                            algorithm="RS256", headers={"kid": "nope"})
        assert client.get("/api/lti/me", headers=_auth(forged)).status_code == 401

    def test_session_must_belong_to_launch_learner(self, client, platform):
        _, token = _token_from(_launch(client))
        other = client.post("/api/learners", json={"display_name": "Otro"}).json()
        r = client.post("/api/sessions", headers=_auth(token),
                        json={"learner_id": other["id"], "module": "aula_senas", "language": "lsec"})
        assert r.status_code == 403


# ── AGS grade passback ───────────────────────────────────────────────────────

def _run_quiz(client, token, score, max_score=5, activity="quiz:u1"):
    learner_id = client.get("/api/lti/me", headers=_auth(token)).json()["learner"]["id"]
    sess = client.post("/api/sessions", headers=_auth(token), json={
        "learner_id": learner_id, "module": "aula_senas", "activity": activity, "language": "lsec"}).json()
    r = client.post(f"/api/sessions/{sess['id']}/finish", headers=_auth(token),
                    json={"score": score, "max_score": max_score})
    assert r.status_code == 200
    return sess["id"], client.get(f"/api/lti/sessions/{sess['id']}/grade", headers=_auth(token)).json()


class TestGradePassback:
    def test_quiz_score_is_published(self, client, platform):
        _, token = _token_from(_launch(client, custom={"unit": "u1"}))
        _, grade = _run_quiz(client, token, 4)
        assert grade == {"status": "sent", "score_given": 80.0, "score_maximum": 100.0, "detail": None}

        (tok_req,) = platform.token_requests()
        form = parse_qs(tok_req.content.decode())
        assert form["grant_type"] == ["client_credentials"] and form["scope"] == [AGS_SCOPE_SCORE]
        tool_jwks = client.get("/lti/jwks").json()
        assertion = jwt.decode(form["client_assertion"][0], jwt.PyJWK(tool_jwks["keys"][0]).key,
                               algorithms=["RS256"], audience=TOKEN_URL)
        assert assertion["iss"] == assertion["sub"] == CLIENT_ID

        (score_req,) = platform.scores()
        assert str(score_req.url) == f"{ISS}/mod/lti/services.php/2/lineitems/7/lineitem/scores?type_id=3"
        assert score_req.headers["authorization"] == "Bearer ags-token"
        assert score_req.headers["content-type"] == "application/vnd.ims.lis.v1.score+json"
        body = json.loads(score_req.content)
        assert body["userId"] == "u-42" and body["scoreGiven"] == 80.0 and body["scoreMaximum"] == 100.0
        assert body["activityProgress"] == "Completed" and body["gradingProgress"] == "FullyGraded"

    def test_keeps_best_score(self, client, platform):
        _, token = _token_from(_launch(client))
        assert _run_quiz(client, token, 4)[1]["status"] == "sent"
        worse = _run_quiz(client, token, 2)[1]
        assert worse["status"] == "skipped" and "80" in worse["detail"]
        assert _run_quiz(client, token, 5)[1]["status"] == "sent"
        assert [json.loads(c.content)["scoreGiven"] for c in platform.scores()] == [80.0, 100.0]
        assert len(platform.token_requests()) == 1  # access token cached

    def test_lessons_and_other_units_are_not_graded(self, client, platform):
        _, token = _token_from(_launch(client, custom={"unit": "u1"}))
        assert _run_quiz(client, token, 5, activity="lesson:u1")[1]["status"] == "not_graded"
        assert _run_quiz(client, token, 5, activity="quiz:u2")[1]["status"] == "not_graded"
        assert platform.scores() == []

    def test_instructor_quiz_is_not_graded(self, client, platform):
        _, token = _token_from(_launch(client, roles=(INSTRUCTOR,), custom={"unit": "u1"}))
        assert _run_quiz(client, token, 5)[1]["status"] == "not_graded"
        assert platform.scores() == []

    def test_activity_without_gradebook(self, client, platform):
        _, token = _token_from(_launch(client, ags=False))
        assert _run_quiz(client, token, 5)[1]["status"] == "not_graded"

    def test_lms_error_is_recorded_not_raised(self, client, platform):
        platform.score_status = 500
        _, token = _token_from(_launch(client))
        grade = _run_quiz(client, token, 5)[1]
        assert grade["status"] == "failed"

    def test_local_sessions_untouched(self, client, platform):
        learner = client.post("/api/learners", json={"display_name": "Local"}).json()
        sess = client.post("/api/sessions", json={"learner_id": learner["id"], "module": "aula_senas",
                                                  "activity": "quiz:u1", "language": "lsec"}).json()
        client.post(f"/api/sessions/{sess['id']}/finish", json={"score": 5, "max_score": 5})
        assert platform.scores() == []

    def test_grade_status_is_private(self, client, platform):
        _, token = _token_from(_launch(client))
        sid, _ = _run_quiz(client, token, 3)
        other_state, other_nonce, _ = _login(client)
        r = client.post("/lti/launch", data={"id_token": _id_token(other_nonce, sub="u-99"), "state": other_state},
                        follow_redirects=False)
        _, other_token = _token_from(r)
        assert client.get(f"/api/lti/sessions/{sid}/grade", headers=_auth(other_token)).status_code == 404


# ── Deep Linking ─────────────────────────────────────────────────────────────

class TestDeepLinking:
    def _dl_token(self, client, roles=(INSTRUCTOR,)):
        return _launch(client, roles=roles, message=lti_launch.MSG_DEEP_LINKING, ags=False)

    def test_instructor_picks_units(self, client, platform):
        path, token = _token_from(self._dl_token(client))
        assert path == "/lti/deeplink"
        r = client.post("/api/lti/deeplink", headers=_auth(token), json={"units": ["u1", "u6"], "course": True})
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["return_url"] == f"{ISS}/mod/lti/contentitem_return.php"
        tool_key = jwt.PyJWK(client.get("/lti/jwks").json()["keys"][0]).key
        claims = jwt.decode(out["jwt"], tool_key, algorithms=["RS256"], audience=ISS)
        assert claims["iss"] == CLIENT_ID
        assert claims[CLAIM + "message_type"] == "LtiDeepLinkingResponse"
        assert claims[CLAIM + "deployment_id"] == DEPLOYMENT
        assert claims["https://purl.imsglobal.org/spec/lti-dl/claim/data"] == "opaque-123"
        items = claims["https://purl.imsglobal.org/spec/lti-dl/claim/content_items"]
        assert [i["custom"].get("unit") for i in items] == [None, "u1", "u6"]
        assert "lineItem" not in items[0]
        assert items[1]["lineItem"]["scoreMaximum"] == 100 and items[1]["lineItem"]["resourceId"] == "quiz:u1"

    def test_validation(self, client, platform):
        _, token = _token_from(self._dl_token(client))
        assert client.post("/api/lti/deeplink", headers=_auth(token), json={"units": ["zz"]}).status_code == 422
        assert client.post("/api/lti/deeplink", headers=_auth(token), json={}).status_code == 422
        assert client.post("/api/lti/deeplink", headers=_auth(token),
                           json={"units": ["u1"], "language": "xx"}).status_code == 404

    def test_learner_cannot_deep_link(self, client, platform):
        assert self._dl_token(client, roles=(LEARNER,)).status_code == 403

    def test_resource_launch_is_not_deep_linking(self, client, platform):
        _, token = _token_from(_launch(client, roles=(INSTRUCTOR,)))
        assert client.post("/api/lti/deeplink", headers=_auth(token), json={"units": ["u1"]}).status_code == 409


# ── Platform administration ──────────────────────────────────────────────────

class TestPlatformAdmin:
    def test_crud_and_duplicates(self, client, platform):
        rows = client.get("/api/lti/platforms").json()
        assert rows[0]["deployment_ids"] == [DEPLOYMENT]
        dup = client.post("/api/lti/platforms", json={**{k: rows[0][k] for k in (
            "name", "issuer", "client_id", "auth_login_url", "auth_token_url", "jwks_url")}})
        assert dup.status_code == 409
        r = client.post(f"/api/lti/platforms/{platform.id}/deployments", json={"deployment_id": "2"})
        assert r.json()["deployment_ids"] == ["1", "2"]
        assert client.delete(f"/api/lti/platforms/{platform.id}").status_code == 204
        assert client.get("/api/lti/platforms").json() == []
        assert client.delete(f"/api/lti/platforms/{platform.id}").status_code == 404
        assert client.post("/api/lti/platforms/nope/deployments", json={"deployment_id": "x"}).status_code == 404

    def test_rejects_non_http_urls(self, client):
        r = client.post("/api/lti/platforms", json={"name": "x", "issuer": "x", "client_id": "y",
                                                    "auth_login_url": "javascript:alert(1)",
                                                    "auth_token_url": "https://a.b/c", "jwks_url": "https://a.b/d"})
        assert r.status_code == 422

    def test_requires_admin_token(self, client, monkeypatch):
        from app import config
        monkeypatch.setattr(config, "settings", config.Settings(**{**config.settings.__dict__, "admin_token": "s3cret"}))
        assert client.get("/api/lti/platforms").status_code == 401
        assert client.get("/api/lti/platforms", headers={"X-Admin-Token": "s3cret"}).status_code == 200


def test_app_token_roundtrip_and_expiry(client):
    from app.db import SessionLocal

    with SessionLocal() as db:
        tok = keys.issue_app_token(db, learner_id="l1", launch_id="x1", instructor=False)
        assert keys.verify_app_token(db, tok)["sub"] == "l1"
        key = keys.active_key(db)
        expired = jwt.encode({"iss": "http://localhost:9876", "aud": keys.APP_TOKEN_AUDIENCE, "sub": "l1",
                              "lti_launch": "x", "exp": int(time.time()) - 10}, key.private_pem,
                             algorithm="RS256", headers={"kid": key.kid})
        with pytest.raises(keys.AppTokenError):
            keys.verify_app_token(db, expired)


def test_scores_url_keeps_query():
    assert services.scores_url("https://m/x/lineitem?type_id=3") == "https://m/x/lineitem/scores?type_id=3"
    assert services.scores_url("https://m/x/lineitem/") == "https://m/x/lineitem/scores"
