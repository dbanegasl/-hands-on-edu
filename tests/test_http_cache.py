"""Caching and compression for a lab opening the Aula at once (app.http_cache)."""
import gzip
import re
import threading
from pathlib import Path

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.routing import Mount, Route
from starlette.testclient import TestClient

from app import http_cache
from app.http_cache import IMMUTABLE, CachedStaticFiles, json_response, vendored_mediapipe_version
from tests.test_api_signs import _template

ROOT = Path(__file__).parent.parent
GZ = {"Accept-Encoding": "gzip"}
PLAIN = {"Accept-Encoding": "identity"}


def test_engine_version_matches_dockerfile():
    """ho-hands.js asks for /vendor/mediapipe@<MP_VERSION>/; the image serves the Dockerfile's version."""
    js = re.search(r"MP_VERSION = '([^']+)'", (ROOT / "app/static/js/ho-hands.js").read_text()).group(1)
    docker = re.search(r"ARG MP_JS_VERSION=(\S+)", (ROOT / "Dockerfile").read_text()).group(1)
    assert js == docker
    assert "'/vendor/mediapipe@' + MP_VERSION" in (ROOT / "app/static/js/ho-hands.js").read_text()


def test_vendored_version(tmp_path):
    assert vendored_mediapipe_version(tmp_path) is None
    (tmp_path / "mediapipe").mkdir()
    (tmp_path / "mediapipe" / "VERSION").write_text("0.10.35\n")
    assert vendored_mediapipe_version(tmp_path) == "0.10.35"
    (tmp_path / "mediapipe" / "VERSION").write_text("../etc")
    assert vendored_mediapipe_version(tmp_path) is None


class TestPrecompressedStatic:
    def _client(self, tmp_path):
        body = b"\0asm" + b"x" * 5000
        (tmp_path / "engine.wasm").write_bytes(body)
        (tmp_path / "engine.wasm.gz").write_bytes(gzip.compress(body))
        (tmp_path / "plain.js").write_text("console.log(1)")
        app = Starlette(routes=[Mount("/v", CachedStaticFiles(directory=tmp_path, cache_control=IMMUTABLE,
                                                                precompressed=True))])
        return TestClient(app), body

    def test_serves_gz_to_gzip_clients(self, tmp_path):
        c, body = self._client(tmp_path)
        r = c.get("/v/engine.wasm", headers=GZ)
        assert r.status_code == 200
        assert r.headers["content-encoding"] == "gzip"
        assert r.headers["content-type"] == "application/wasm"
        assert r.headers["cache-control"] == IMMUTABLE and r.headers["vary"] == "Accept-Encoding"
        assert r.content == body                      # httpx decodes it
        assert int(r.headers["content-length"]) < len(body)

    def test_plain_without_gzip_and_without_gz_file(self, tmp_path):
        c, body = self._client(tmp_path)
        r = c.get("/v/engine.wasm", headers=PLAIN)
        assert "content-encoding" not in r.headers and r.content == body
        assert r.headers["cache-control"] == IMMUTABLE
        r = c.get("/v/plain.js", headers=GZ)
        assert r.status_code == 200 and "content-encoding" not in r.headers

    def test_revalidation_304(self, tmp_path):
        c, _ = self._client(tmp_path)
        etag = c.get("/v/engine.wasm", headers=GZ).headers["etag"]
        r = c.get("/v/engine.wasm", headers={**GZ, "If-None-Match": etag})
        assert r.status_code == 304 and r.headers["cache-control"] == IMMUTABLE

    def test_missing_is_404(self, tmp_path):
        c, _ = self._client(tmp_path)
        assert c.get("/v/nope.wasm", headers=GZ).status_code == 404

    def test_missing_directory_is_404_not_500(self, tmp_path):
        app = Starlette(routes=[Mount("/m", CachedStaticFiles(directory=tmp_path / "absent", check_dir=False))])
        assert TestClient(app).get("/m/hand_landmarker.task").status_code == 404


def test_json_response_builds_once_per_version():
    calls = []

    def build():
        calls.append(1)
        return b'{"a":1}' * 300

    async def endpoint(request: Request):
        return json_response(request, ("t", "x"), request.query_params.get("v"), build)

    http_cache.clear_memo()
    c = TestClient(Starlette(routes=[Route("/j", endpoint)]))
    threads = [threading.Thread(target=lambda: c.get("/j?v=1", headers=GZ)) for _ in range(10)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert len(calls) == 1
    r = c.get("/j?v=1", headers=GZ)
    assert r.headers["content-encoding"] == "gzip" and r.headers["cache-control"] == "no-cache"
    assert c.get("/j?v=1", headers={"If-None-Match": r.headers["etag"]}).status_code == 304
    c.get("/j?v=2")
    assert len(calls) == 2


class TestSignEndpoints:
    def test_templates_etag_changes_with_content(self, client):
        url = "/api/signs/lsec/templates"
        empty = client.get(url, headers=GZ)
        assert empty.headers["cache-control"] == "no-cache"
        assert client.get(url, headers={"If-None-Match": empty.headers["etag"]}).status_code == 304
        tpl = client.post(url, json=_template()).json()
        one = client.get(url, headers=GZ)
        assert one.headers["etag"] != empty.headers["etag"]
        assert client.get(url, headers={"If-None-Match": empty.headers["etag"]}).status_code == 200
        assert [t["id"] for t in one.json()] == [tpl["id"]]
        assert one.headers["content-encoding"] == "gzip"
        assert client.get(url, params={"sign_id": "b"}).json() == []
        client.delete(f"{url}/{tpl['id']}")
        assert client.get(url, headers={"If-None-Match": one.headers["etag"]}).status_code == 200

    def test_catalog_and_no_model(self, client):
        cat = client.get("/api/signs/lsec/catalog")
        assert cat.json()["language"]["code"] == "lsec"
        assert client.get("/api/signs/lsec/catalog", headers={"If-None-Match": cat.headers["etag"]}).status_code == 304
        m = client.get("/api/signs/lsec/model")
        assert m.status_code == 204 and m.headers["cache-control"] == "no-cache"

    def test_pages_and_app_files_are_revalidated_and_compressed(self, client):
        page = client.get("/aula", headers=GZ)
        assert page.headers["cache-control"] == "no-cache" and page.headers["content-encoding"] == "gzip"
        js = client.get("/static/js/aula.js", headers=GZ)
        assert js.headers["cache-control"] == "no-cache" and js.headers["content-encoding"] == "gzip"
        assert client.get("/static/js/aula.js", headers={"If-None-Match": js.headers["etag"]}).status_code == 304
