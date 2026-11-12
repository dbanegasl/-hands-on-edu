"""Shared FastAPI dependencies."""
import hashlib
import hmac
import secrets

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app import config
from app.db import get_db
from app.integrations.lti import keys
from app.models import Learner


def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    """
    Guard for teacher-only write endpoints. Open when ADMIN_TOKEN is unset
    (local development); otherwise the `X-Admin-Token` header must match.
    Interim measure until LTI roles / REQ-008 auth land.
    """
    expected = config.settings.admin_token
    if not expected:
        return
    if not x_admin_token or not hmac.compare_digest(x_admin_token, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token de docente inválido o ausente")


def lti_context(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict | None:
    """
    Claims of the browser's LTI launch token (`Authorization: Bearer …`), or
    None for local (non-LMS) use. A present but invalid token is an error, so
    an expired LMS session never silently falls back to anonymous mode.
    """
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Cabecera Authorization inválida")
    try:
        return keys.verify_app_token(db, token.strip())
    except keys.AppTokenError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Tu sesión de la plataforma educativa expiró: vuelve a abrir la actividad desde Moodle",
        ) from exc


def require_lti(ctx: dict | None = Depends(lti_context)) -> dict:
    if ctx is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Se requiere un lanzamiento LTI")
    return ctx


# ── Learner credentials (TD-013) ─────────────────────────────────────────────
# A learner's data can be read or written with:
#   • the LTI launch token of that same learner (Authorization: Bearer …);
#   • the secret of a local profile (X-Learner-Token), handed out once when the
#     profile is created and kept by that browser — the server stores its hash;
#   • the admin token, when ADMIN_TOKEN is configured (support / teachers).

def new_learner_secret() -> tuple[str, str]:
    """(secret for the browser, hash for the database)."""
    secret = secrets.token_urlsafe(32)
    return secret, hash_learner_secret(secret)


def hash_learner_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


class LearnerCredentials:
    """Whatever the request carries that may identify a learner."""

    def __init__(
        self,
        lti: dict | None = Depends(lti_context),
        x_learner_token: str | None = Header(default=None),
        x_admin_token: str | None = Header(default=None),
    ):
        self.lti = lti
        self.learner_token = x_learner_token
        self.admin_token = x_admin_token

    def is_admin(self) -> bool:
        expected = config.settings.admin_token
        return bool(expected and self.admin_token and hmac.compare_digest(self.admin_token, expected))

    def check(self, learner: Learner) -> None:
        """Raise 401/403 unless these credentials belong to `learner`."""
        if self.lti is not None:          # inside an LMS launch the launch token decides
            if self.lti["sub"] != learner.id:
                raise HTTPException(status.HTTP_403_FORBIDDEN,
                                    "Estos datos no corresponden al estudiante de la plataforma educativa")
            return
        if self.is_admin():
            return
        if self.learner_token:
            if learner.secret_hash and hmac.compare_digest(hash_learner_secret(self.learner_token), learner.secret_hash):
                return
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Este perfil pertenece a otro equipo o navegador")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Falta la credencial del perfil del estudiante")
