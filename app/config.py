"""
Runtime configuration, read once from environment variables (and `.env`).

Kept dependency-free on purpose (no pydantic-settings): a frozen dataclass is
enough for a handful of values and is trivial to override in tests.
"""
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _int_env(name: str, default: int) -> int:
    raw = _env(name)
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} debe ser un número entero de días, no {raw!r}") from exc
    if value < 0:
        raise ValueError(f"{name} no puede ser negativo")
    return value


@dataclass(frozen=True)
class Settings:
    app_env: str
    database_url: str
    # Optional shared secret protecting teacher-only write endpoints (sign
    # templates). Empty = open (dev mode). Replaced by real roles with LTI/auth.
    admin_token: str
    # Directory with the vendored MediaPipe Tasks JS bundle + WASM (filled at
    # image build time; the browser falls back to the CDN when it is missing).
    vendor_dir: Path
    # Directory with hand_landmarker.task (shared by the server fallback and
    # the in-browser engine).
    models_dir: Path
    content_dir: Path
    # Public origin of the tool as the LMS and browsers reach it (LTI redirect
    # URIs, JWKS URL, deep-linking targets). No trailing slash.
    public_base_url: str
    # Shown on /privacidad (REQ-021): who is responsible for the learners' data
    # (the institution) and how to reach them. Empty = the page asks learners to
    # contact their institution.
    privacy_controller: str = ""
    privacy_contact: str = ""
    # Announced retention after the last activity, in days (0 = not announced);
    # also the default of `python -m app.privacy purge`.
    data_retention_days: int = 0

    @property
    def is_dev(self) -> bool:
        return self.app_env != "production"


def load_settings() -> Settings:
    data_dir = Path(_env("DATA_DIR", str(BASE_DIR / "data")))
    return Settings(
        app_env=_env("APP_ENV", "development"),
        database_url=_env("DATABASE_URL", f"sqlite:///{data_dir / 'handsonedu.db'}"),
        admin_token=_env("ADMIN_TOKEN"),
        vendor_dir=Path(_env("VENDOR_DIR", str(BASE_DIR / "vendor"))),
        models_dir=Path(_env("MODELS_DIR", str(BASE_DIR / "models"))),
        content_dir=Path(__file__).resolve().parent / "content",
        public_base_url=_env("PUBLIC_BASE_URL", "http://localhost:9876").rstrip("/"),
        privacy_controller=_env("PRIVACY_CONTROLLER"),
        privacy_contact=_env("PRIVACY_CONTACT"),
        data_retention_days=_int_env("DATA_RETENTION_DAYS", 0),
    )


settings = load_settings()
