"""Pure helpers of deploy/check-install.py (the full run is exercised by scripts/test-deploy.sh)."""
import importlib.util
import io
from pathlib import Path

import pytest

_spec = importlib.util.spec_from_file_location("check_install", Path(__file__).parent.parent / "deploy" / "check-install.py")
ci = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ci)


@pytest.mark.parametrize("url, expected", [
    ("https://Senas.Edu.EC/", "https://senas.edu.ec"),
    ("https://senas.edu.ec:443", "https://senas.edu.ec"),
    ("http://localhost:9876/", "http://localhost:9876"),
    ("https://lms.edu/moodle/", "https://lms.edu/moodle"),
])
def test_normalize_base(url, expected):
    assert ci.normalize_base(url) == expected


def test_parse_version_and_minimum():
    assert ci.parse_version("0.18.0") == (0, 18, 0)
    assert ci.parse_version("0.16.2") < ci.MIN_SECURE_VERSION <= ci.parse_version("0.17.0")
    assert ci.parse_version("dev") is None


@pytest.mark.parametrize("header, allowed", [
    (None, True), ("", True),
    ("camera=(self)", True), ("geolocation=(), camera=(self \"https://x\")", True), ("camera=*", True),
    ("camera=()", False), ("microphone=(), camera=()", False),
    ("microphone=()", True),
])
def test_camera_allowed(header, allowed):
    assert ci.camera_allowed(header) is allowed


def test_clock_skew():
    assert ci.clock_skew("Thu, 12 Nov 2026 12:00:30 GMT", now=1794484800.0) == pytest.approx(30)
    assert ci.clock_skew(None) is None and ci.clock_skew("garbage") is None


def test_report_counts_and_exit_code(capsys):
    r = ci.Report(out=io.StringIO())
    r.ok("a"); r.warn("b", "fix"); r.fail("c")
    assert (r.fails, r.warns) == (1, 1)
    assert "→ fix" in r.out.getvalue()


def test_unreachable_site_fails_cleanly(capsys):
    assert ci.main(["http://127.0.0.1:9", "--allow-http"]) == 1
    assert "No se puede abrir" in capsys.readouterr().out


def test_delivery_issues():
    good = {"Content-Encoding": "gzip", "Cache-Control": "public, max-age=31536000, immutable"}
    assert ci.delivery_issues(good) == []
    assert ci.delivery_issues({"Cache-Control": "public, max-age=2592000"}) == ["sin comprimir"]
    assert ci.delivery_issues({"Content-Encoding": "gzip"}) == ["sin caché en el navegador"]
    assert ci.delivery_issues({"Content-Encoding": "gzip", "Cache-Control": "no-cache"}) == ["sin caché en el navegador"]
    assert ci.delivery_issues({"Content-Encoding": "gzip", "Cache-Control": "max-age=60"}) == ["sin caché en el navegador"]


@pytest.mark.parametrize("js, expected", [
    ("const MP_VERSION = '0.10.35';\nconst VENDOR_BASE = '/vendor/mediapipe@' + MP_VERSION + '/';", "/vendor/mediapipe@0.10.35/"),
    ("const MP_VERSION = '0.10.35';\nconst VENDOR_BASE = '/vendor/mediapipe/';", "/vendor/mediapipe/"),
])
def test_engine_prefix(monkeypatch, js, expected):
    monkeypatch.setattr(ci, "fetch", lambda url, **kw: (200, {}, js.encode()))
    assert ci.engine_prefix("https://x") == expected


def test_engine_prefix_of_the_real_file(monkeypatch):
    js = (Path(__file__).parent.parent / "app/static/js/ho-hands.js").read_bytes()
    monkeypatch.setattr(ci, "fetch", lambda url, **kw: (200, {}, js))
    assert ci.engine_prefix("https://x").startswith("/vendor/mediapipe@")
