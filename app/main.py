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

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api import learning, lti, pages, signs, ws
from app.config import settings
from app.db import init_db

APP_VERSION = "0.11.0"

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

app.mount("/static", StaticFiles(directory="app/static"), name="static")
# MediaPipe Tasks JS bundle + WASM (vendored at build time) and the landmark
# model, so the in-browser engine works on school networks without CDN access.
app.mount("/vendor", StaticFiles(directory=settings.vendor_dir, check_dir=False), name="vendor")
app.mount("/models", StaticFiles(directory=settings.models_dir, check_dir=False), name="models")

app.include_router(pages.router)
app.include_router(ws.router)
app.include_router(signs.router)
app.include_router(learning.router)
app.include_router(lti.router)


@app.get("/health", tags=["sistema"])
async def health():
    return {"status": "ok", "version": APP_VERSION}
