"""Shared FastAPI dependencies."""
import hmac

from fastapi import Header, HTTPException, status

from app import config


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
