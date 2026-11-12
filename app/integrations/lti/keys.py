"""
Tool key pair (RS256) and the app's own launch tokens.

The private key lives in the database (`lti_keys`) and is created on first
use, so a fresh deployment works without manual key management. The same key
signs: client assertions for AGS, deep-linking responses, and the short-lived
token the browser receives after a launch (`#lti=<token>`).
"""
from __future__ import annotations

import base64
import hashlib
import time
from datetime import datetime, timezone

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config
from app.models import LtiKey

APP_TOKEN_AUDIENCE = "handsonedu-app"
APP_TOKEN_TTL_S = 8 * 3600


class AppTokenError(Exception):
    """The browser's launch token is missing, malformed, expired or forged."""


def _b64u(n: int) -> str:
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _new_key() -> LtiKey:
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = private.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    pub = private.public_key().public_numbers()
    kid = hashlib.sha256(f"{pub.n}:{pub.e}".encode()).hexdigest()[:32]
    return LtiKey(kid=kid, private_pem=pem, active=True, created_at=datetime.now(timezone.utc))


def active_key(db: Session) -> LtiKey:
    key = db.scalars(select(LtiKey).where(LtiKey.active.is_(True)).order_by(LtiKey.created_at.desc())).first()
    if key is None:
        key = _new_key()
        db.add(key)
        db.commit()
    return key


def _private(key: LtiKey):
    return serialization.load_pem_private_key(key.private_pem.encode(), password=None)


def public_jwk(key: LtiKey) -> dict:
    nums = _private(key).public_key().public_numbers()
    return {"kty": "RSA", "alg": "RS256", "use": "sig", "kid": key.kid, "n": _b64u(nums.n), "e": _b64u(nums.e)}


def jwks(db: Session) -> dict:
    active_key(db)
    keys = db.scalars(select(LtiKey).order_by(LtiKey.created_at)).all()
    return {"keys": [public_jwk(k) for k in keys]}


def sign(db: Session, claims: dict) -> str:
    key = active_key(db)
    return jwt.encode(claims, key.private_pem, algorithm="RS256", headers={"kid": key.kid})


# ── App launch tokens ────────────────────────────────────────────────────────

def issue_app_token(db: Session, *, learner_id: str, launch_id: str, instructor: bool) -> str:
    now = int(time.time())
    return sign(db, {
        "iss": config.settings.public_base_url,
        "aud": APP_TOKEN_AUDIENCE,
        "sub": learner_id,
        "lti_launch": launch_id,
        "instructor": instructor,
        "iat": now,
        "exp": now + APP_TOKEN_TTL_S,
    })


def verify_app_token(db: Session, token: str) -> dict:
    try:
        kid = jwt.get_unverified_header(token).get("kid")
    except jwt.PyJWTError as exc:
        raise AppTokenError("token malformado") from exc
    key = db.get(LtiKey, kid) if kid else None
    if key is None:
        raise AppTokenError("clave desconocida")
    try:
        return jwt.decode(
            token, _private(key).public_key(), algorithms=["RS256"], audience=APP_TOKEN_AUDIENCE,
            issuer=config.settings.public_base_url, options={"require": ["exp", "sub", "lti_launch"]},
        )
    except jwt.PyJWTError as exc:
        raise AppTokenError(str(exc)) from exc
