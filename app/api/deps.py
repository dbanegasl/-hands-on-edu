"""Shared FastAPI dependencies."""
import hmac

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app import config
from app.db import get_db
from app.integrations.lti import keys


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
