"""
LTI 1.3 core launch: OIDC login initiation and id_token validation.

Flow (IMS Security Framework 1.0, "OIDC third-party initiated login"):
  LMS ──GET/POST /lti/login (iss, login_hint, target_link_uri…)──▶ tool
  tool stores a one-time state+nonce and redirects to the LMS auth endpoint
  LMS ──POST /lti/launch (id_token, state)──▶ tool validates and signs the user in
"""
from __future__ import annotations

import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
import jwt
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import config
from app.models import LtiDeployment, LtiLoginState, LtiPlatform

CLAIM = "https://purl.imsglobal.org/spec/lti/claim/"
AGS_CLAIM = "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint"
DL_CLAIM = "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"
AGS_SCOPE_SCORE = "https://purl.imsglobal.org/spec/lti-ags/scope/score"

MSG_RESOURCE_LINK = "LtiResourceLinkRequest"
MSG_DEEP_LINKING = "LtiDeepLinkingRequest"
STATE_TTL = timedelta(minutes=10)
CLOCK_LEEWAY_S = 60
JWKS_TTL_S = 3600
JWKS_MIN_REFRESH_S = 60

INSTRUCTOR_ROLES = (
    "membership#Instructor", "membership#ContentDeveloper", "membership#Administrator",
    "membership/Instructor#TeachingAssistant", "institution/person#Administrator",
    "institution/person#Instructor", "system/person#Administrator",
)


class LtiError(Exception):
    """Launch rejected. The message is shown to the user (Spanish)."""


def http_client() -> httpx.Client:
    """Factory for outbound HTTP (patched in tests)."""
    return httpx.Client(timeout=10.0)


# ── Platform JWKS cache ──────────────────────────────────────────────────────

_jwks_cache: dict[str, tuple[float, dict]] = {}


def _fetch_jwks(url: str) -> dict:
    with http_client() as client:
        res = client.get(url)
        res.raise_for_status()
        return res.json()


def _refresh_jwks(url: str, now: float) -> tuple[float, dict]:
    try:
        entry = (now, _fetch_jwks(url))
    except (httpx.HTTPError, ValueError) as exc:
        raise LtiError("No se pudo obtener las claves públicas de la plataforma") from exc
    _jwks_cache[url] = entry
    return entry


def _pick_key(jwks_doc: dict, kid: str | None):
    keys = jwks_doc.get("keys", []) if isinstance(jwks_doc, dict) else []
    match = [k for k in keys if k.get("kid") == kid] if kid else keys[:1]
    return jwt.PyJWK(match[0], algorithm="RS256").key if match else None


def platform_key(jwks_url: str, kid: str | None):
    """Public key for `kid`. The JWKS is cached for an hour and refetched early
    (at most once a minute) when an unknown kid appears, to follow key rotation."""
    now = time.time()
    entry = _jwks_cache.get(jwks_url)
    if entry is None or now - entry[0] > JWKS_TTL_S:
        entry = _refresh_jwks(jwks_url, now)
    key = _pick_key(entry[1], kid)
    if key is None and now - entry[0] > JWKS_MIN_REFRESH_S:
        key = _pick_key(_refresh_jwks(jwks_url, now)[1], kid)
    if key is None:
        raise LtiError("La firma usa una clave desconocida para esta plataforma")
    return key


# ── Login initiation ─────────────────────────────────────────────────────────

def find_platform(db: Session, issuer: str, client_id: str | None) -> LtiPlatform:
    stmt = select(LtiPlatform).where(LtiPlatform.issuer == issuer)
    if client_id:
        stmt = stmt.where(LtiPlatform.client_id == client_id)
    rows = db.scalars(stmt).all()
    if not rows:
        raise LtiError("Esta plataforma no está registrada en HandsOnEdu")
    if len(rows) > 1:
        raise LtiError("Hay varias herramientas registradas para esta plataforma; falta client_id")
    return rows[0]


def launch_url() -> str:
    return f"{config.settings.public_base_url}/lti/launch"


def begin_login(db: Session, params: dict) -> str:
    """Validate the login initiation request and return the LMS auth redirect URL."""
    for name in ("iss", "login_hint", "target_link_uri"):
        if not params.get(name):
            raise LtiError(f"Falta el parámetro {name} en el inicio de sesión LTI")
    platform = find_platform(db, params["iss"], params.get("client_id"))
    now = datetime.now(timezone.utc)
    db.execute(delete(LtiLoginState).where(LtiLoginState.created_at < now - STATE_TTL))
    state, nonce = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    db.add(LtiLoginState(state=state, nonce=nonce, platform_id=platform.id, created_at=now))
    db.commit()
    query = {
        "scope": "openid",
        "response_type": "id_token",
        "response_mode": "form_post",
        "prompt": "none",
        "client_id": platform.client_id,
        "redirect_uri": launch_url(),
        "login_hint": params["login_hint"],
        "state": state,
        "nonce": nonce,
    }
    if params.get("lti_message_hint"):
        query["lti_message_hint"] = params["lti_message_hint"]
    sep = "&" if "?" in platform.auth_login_url else "?"
    return platform.auth_login_url + sep + urlencode(query)


# ── Launch validation ────────────────────────────────────────────────────────

@dataclass
class LaunchData:
    platform: LtiPlatform
    claims: dict
    message_type: str
    sub: str
    deployment_id: str
    name: str
    roles: list[str] = field(default_factory=list)
    is_instructor: bool = False
    context: dict = field(default_factory=dict)
    resource_link: dict = field(default_factory=dict)
    custom: dict = field(default_factory=dict)
    ags: dict = field(default_factory=dict)
    deep_linking: dict | None = None
    target_link_uri: str = ""


def is_instructor(roles: list[str]) -> bool:
    return any(r.endswith(suffix) for r in roles for suffix in INSTRUCTOR_ROLES)


def validate_launch(db: Session, id_token: str, state: str) -> LaunchData:
    if not id_token or not state:
        raise LtiError("Lanzamiento LTI incompleto (falta id_token o state)")
    login = db.get(LtiLoginState, state)
    if login is None:
        raise LtiError("Sesión de inicio LTI desconocida o ya usada; vuelve a abrir la actividad")
    db.delete(login)  # one-time use, even if validation fails below
    db.commit()
    if datetime.now(timezone.utc) - login.created_at > STATE_TTL:
        raise LtiError("La sesión de inicio LTI expiró; vuelve a abrir la actividad")
    platform = db.get(LtiPlatform, login.platform_id)

    try:
        kid = jwt.get_unverified_header(id_token).get("kid")
    except jwt.PyJWTError as exc:
        raise LtiError("id_token malformado") from exc
    key = platform_key(platform.jwks_url, kid)
    try:
        claims = jwt.decode(
            id_token, key, algorithms=["RS256"], audience=platform.client_id, issuer=platform.issuer,
            leeway=CLOCK_LEEWAY_S, options={"require": ["exp", "iat", "iss", "aud", "sub", "nonce"]},
        )
    except jwt.PyJWTError as exc:
        raise LtiError(f"id_token inválido: {exc}") from exc

    aud = claims["aud"]
    if isinstance(aud, list) and len(aud) > 1 and claims.get("azp") != platform.client_id:
        raise LtiError("id_token inválido: azp no corresponde a esta herramienta")
    if claims["nonce"] != login.nonce:
        raise LtiError("id_token inválido: nonce no coincide")
    if claims.get(CLAIM + "version") != "1.3.0":
        raise LtiError("Versión de LTI no soportada (se requiere 1.3.0)")
    message_type = claims.get(CLAIM + "message_type")
    if message_type not in (MSG_RESOURCE_LINK, MSG_DEEP_LINKING):
        raise LtiError(f"Tipo de mensaje LTI no soportado: {message_type}")
    deployment_id = claims.get(CLAIM + "deployment_id")
    known = {d.deployment_id for d in platform.deployments}
    if not deployment_id or deployment_id not in known:
        raise LtiError("Este despliegue de la herramienta no está registrado en HandsOnEdu")
    resource_link = claims.get(CLAIM + "resource_link") or {}
    if message_type == MSG_RESOURCE_LINK and not resource_link.get("id"):
        raise LtiError("Falta resource_link en el lanzamiento")
    deep_linking = claims.get(DL_CLAIM)
    if message_type == MSG_DEEP_LINKING and not (deep_linking or {}).get("deep_link_return_url"):
        raise LtiError("Falta deep_link_return_url en la solicitud de Deep Linking")

    roles = [r for r in claims.get(CLAIM + "roles", []) if isinstance(r, str)]
    name = claims.get("name") or " ".join(
        p for p in (claims.get("given_name"), claims.get("family_name")) if p
    ) or "Estudiante"
    return LaunchData(
        platform=platform, claims=claims, message_type=message_type, sub=str(claims["sub"]),
        deployment_id=deployment_id, name=name[:120], roles=roles, is_instructor=is_instructor(roles),
        context=claims.get(CLAIM + "context") or {}, resource_link=resource_link,
        custom={k: str(v) for k, v in (claims.get(CLAIM + "custom") or {}).items()},
        ags=claims.get(AGS_CLAIM) or {}, deep_linking=deep_linking,
        target_link_uri=claims.get(CLAIM + "target_link_uri") or "",
    )
