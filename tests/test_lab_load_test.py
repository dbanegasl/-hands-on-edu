"""deploy/lab-load-test.py against the app itself (in-process server)."""
import importlib.util
import io
import sys
import threading
import time
from pathlib import Path

import uvicorn

_spec = importlib.util.spec_from_file_location("lab_load_test", Path(__file__).parent.parent / "deploy" / "lab-load-test.py")
llt = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = llt  # dataclasses need the module registered
_spec.loader.exec_module(llt)


def test_page_assets():
    html = '<link rel="stylesheet" href="/static/css/a.css"><script src="/static/js/x.js"></script>' \
           '<script src="https://cdn.example/y.js"></script><script src="/static/js/x.js"></script>'
    assert llt.page_assets(html) == ["/static/js/x.js", "/static/css/a.css"]


def test_fresh_and_revalidation():
    assert llt.fresh({"cache-control": "public, max-age=31536000, immutable"})
    assert not llt.fresh({"cache-control": "no-cache"})
    assert not llt.fresh({})
    assert llt.revalidation_headers({"etag": '"a"', "last-modified": "x"}) == {"If-None-Match": '"a"', "If-Modified-Since": "x"}


def test_runs_against_the_app(client):
    from app.main import app
    config = uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning")
    server = uvicorn.Server(config)
    t = threading.Thread(target=server.run, daemon=True)
    t.start()
    while not server.started:
        time.sleep(0.05)
    port = server.servers[0].sockets[0].getsockname()[1]
    out = io.StringIO()
    try:
        code = llt.main([f"http://127.0.0.1:{port}", "--pcs", "3", "--link-mbps", "100"], out=out)
    finally:
        server.should_exit = True
        t.join(5)
    text = out.getvalue()
    from app.config import settings
    if settings.models_dir.is_dir():                 # inside the image: everything is served
        assert code == 0, text
    else:                                            # CI without the engine files: only those fail, with a 404
        assert code == 1 and "/models/hand_landmarker.task: HTTP 404" in text, text
    assert "Primera vez" in text and "Siguiente vez" in text and "100 Mb/s" in text
    assert "/api/signs/lsec/templates" in text and "gzip" in text
