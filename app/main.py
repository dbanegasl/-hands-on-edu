"""
HandsOnEdu application entry point.

Routers:
- app.api.pages     — one HTML page per module
- app.api.ws        — WS /ws/analyze (server-side landmark fallback)
- app.api.signs     — sign-language catalogs + reference templates
- app.api.learning  — learners, sessions, attempts, mastery
"""
import logging
import mimetypes
from contextlib import asynccontextmanager

import math

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.gzip import GZipMiddleware

from app.api import attendance, diagnostics, learning, lti, pages, panel, privacy, reviews, signs, ws
from app.config import settings
from app.db import init_db
from app.http_cache import IMMUTABLE, LONG, REVALIDATE, CachedStaticFiles, vendored_mediapipe_version

APP_VERSION = "0.23.0"

# Python's mimetypes has no entry for .mjs on slim images; ES-module imports
# are rejected by browsers unless served with a JavaScript MIME type.
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("application/wasm", ".wasm")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("handsonedu")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    logger.info("HandsOnEdu %s ready (db=%s)", APP_VERSION, settings.database_url.split("://")[0])
    yield


app = FastAPI(
    title="HandsOnEdu",
    description="Plataforma educativa de lengua de señas y control gestual — HandsOnEdu",
    version=APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Compress pages, app JS/CSS and JSON on the fly (files precompressed at build
# time and the cached JSON already carry Content-Encoding and are left alone).
app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=6)

app.mount("/static", CachedStaticFiles(directory="app/static", cache_control=REVALIDATE), name="static")
# MediaPipe Tasks JS bundle + WASM (vendored at build time) and the landmark
# model, so the in-browser engine works on school networks without CDN access.
# The engine is served under its version so browsers keep it for a year; a
# release with another version changes the URL (ho-hands.js MP_VERSION).
MEDIAPIPE_VERSION = vendored_mediapipe_version(settings.vendor_dir)
if MEDIAPIPE_VERSION:
    app.mount(f"/vendor/mediapipe@{MEDIAPIPE_VERSION}",
              CachedStaticFiles(directory=settings.vendor_dir / "mediapipe", cache_control=IMMUTABLE, precompressed=True),
              name="mediapipe")
app.mount("/vendor", CachedStaticFiles(directory=settings.vendor_dir, check_dir=False, precompressed=True), name="vendor")
app.mount("/models", CachedStaticFiles(directory=settings.models_dir, check_dir=False, cache_control=LONG,
                                       precompressed=True), name="models")

app.include_router(pages.router)
app.include_router(ws.router)
app.include_router(signs.router)
app.include_router(learning.router)
app.include_router(lti.router)
app.include_router(panel.router)
app.include_router(attendance.router)
app.include_router(privacy.router)
app.include_router(diagnostics.router)
app.include_router(reviews.router)


def _json_safe(value):
    """Replace NaN/±Infinity (valid in Python's JSON parser, not in JSON) by None."""
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return value


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    # Same 422 body as FastAPI's default, but a NaN echoed back as "input"
    # must not turn a validation error into a 500.
    return JSONResponse(status_code=422, content={"detail": _json_safe(jsonable_encoder(exc.errors()))})


@app.get("/health", tags=["sistema"])
async def health():
    return {"status": "ok", "version": APP_VERSION}
