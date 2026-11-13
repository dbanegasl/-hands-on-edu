"""
HTTP caching and compression for a lab of ~30 computers opening the Aula at
once (see docs/deployment.md, «Laboratorio»).

- `CachedStaticFiles`: StaticFiles with an explicit Cache-Control and, when
  `precompressed`, the `<file>.gz` made at image build time (MediaPipe engine
  and model: ~19 MB → ~9 MB per computer, no CPU spent per request).
- `json_response`: JSON that is serialized and gzipped once per content
  version and revalidated with an ETag, so the sign templates (several MB once
  teachers record) cost one 304 on every later visit.
"""
from __future__ import annotations

import gzip
import hashlib
import mimetypes
import os
import stat
import threading
from collections import OrderedDict
from collections.abc import Callable, Hashable

import anyio
from starlette.datastructures import Headers
from starlette.requests import Request
from starlette.responses import FileResponse, Response
from starlette.staticfiles import NotModifiedResponse, StaticFiles
from starlette.types import Scope

# Unversioned files (pages, app JS/CSS): always ask; an unchanged file costs a 304.
REVALIDATE = "no-cache"
# Files whose URL changes when they change (vendored engine under /vendor/mediapipe@<version>/).
IMMUTABLE = "public, max-age=31536000, immutable"
# The landmark model URL never changes in practice; revalidated after a month.
LONG = "public, max-age=2592000"

mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("application/wasm", ".wasm")


def accepts_gzip(headers: Headers) -> bool:
    return "gzip" in headers.get("accept-encoding", "").lower()


class CachedStaticFiles(StaticFiles):
    def __init__(self, *args, cache_control: str = REVALIDATE, precompressed: bool = False, **kwargs):
        super().__init__(*args, **kwargs)
        self.cache_control = cache_control
        self.precompressed = precompressed

    async def check_config(self) -> None:
        # The engine and model only exist inside the image: elsewhere answer 404
        # (the browser then uses the CDN) instead of a 500 from StaticFiles.
        if self.directory is not None and not os.path.isdir(self.directory):
            return
        await super().check_config()

    async def get_response(self, path: str, scope: Scope) -> Response:
        request_headers = Headers(scope=scope)
        if (self.precompressed and scope["method"] in ("GET", "HEAD") and not path.endswith(".gz")
                and accepts_gzip(request_headers)):
            full_path, stat_result = await anyio.to_thread.run_sync(self.lookup_path, path + ".gz")
            if stat_result is not None and stat.S_ISREG(stat_result.st_mode):
                media_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
                response: Response = FileResponse(
                    full_path, stat_result=stat_result, media_type=media_type,
                    headers={"Content-Encoding": "gzip"})
                if self.is_not_modified(response.headers, request_headers):
                    response = NotModifiedResponse(response.headers)
                return self._decorate(response)
        return self._decorate(await super().get_response(path, scope))

    def _decorate(self, response: Response) -> Response:
        if response.status_code in (200, 206, 304):
            response.headers["Cache-Control"] = self.cache_control
            if self.precompressed:
                response.headers["Vary"] = "Accept-Encoding"
        return response


def vendored_mediapipe_version(vendor_dir: os.PathLike) -> str | None:
    """MediaPipe Tasks JS version written by the Dockerfile next to the bundle."""
    try:
        with open(os.path.join(vendor_dir, "mediapipe", "VERSION"), encoding="utf-8") as fh:
            version = fh.read().strip()
    except OSError:
        return None
    return version if version and all(c.isalnum() or c in ".-" for c in version) else None


# ── Serialized-once JSON ─────────────────────────────────────────────────────

MEMO_ENTRIES = 32
_memo: OrderedDict[Hashable, tuple[str | None, str, bytes, bytes]] = OrderedDict()
_memo_lock = threading.Lock()
_build_locks: dict[Hashable, threading.Lock] = {}


def _entry(key: Hashable, version: str | None, build: Callable[[], bytes]):
    with _memo_lock:
        hit = _memo.get(key)
        if hit is not None and hit[0] == version:
            _memo.move_to_end(key)
            return hit
        lock = _build_locks.setdefault(key, threading.Lock())
    with lock:  # 30 computers at once → one serialization
        with _memo_lock:
            hit = _memo.get(key)
            if hit is not None and hit[0] == version:
                return hit
        raw = build()
        entry = (version, '"' + hashlib.sha1(raw).hexdigest()[:24] + '"', raw, gzip.compress(raw, 6))
        with _memo_lock:
            _memo[key] = entry
            _memo.move_to_end(key)
            while len(_memo) > MEMO_ENTRIES:
                _memo.popitem(last=False)
        return entry


def clear_memo() -> None:
    with _memo_lock:
        _memo.clear()


def json_response(request: Request, key: Hashable, version: str | None, build: Callable[[], bytes]) -> Response:
    """
    `build()` returns the JSON bytes; it runs once per (`key`, `version`).
    `version` must change whenever the content does (None: constant for the
    life of the process, e.g. the catalog). The ETag is the content's hash, so
    a new release that serializes differently is never served as unchanged.
    """
    _, etag, raw, gz = _entry(key, version, build)
    headers = {"ETag": etag, "Cache-Control": REVALIDATE, "Vary": "Accept-Encoding"}
    if etag in [t.strip() for t in request.headers.get("if-none-match", "").split(",")]:
        return Response(status_code=304, headers=headers)
    if accepts_gzip(request.headers):
        return Response(gz, media_type="application/json", headers={**headers, "Content-Encoding": "gzip"})
    return Response(raw, media_type="application/json", headers=headers)
