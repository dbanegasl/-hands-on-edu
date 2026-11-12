"""
LTI Advantage services used by HandsOnEdu:

- AGS (Assignment and Grade Services): publish the learner's quiz result to
  the line item of the launch. Policy: the gradebook keeps the learner's BEST
  result for that activity (a worse retry is recorded as "skipped").
- Deep Linking: the teacher picks which Aula unit an LMS activity opens.
- NRPS (Names and Role Provisioning): the course roster for the teacher panel.
"""
from __future__ import annotations

import logging
import secrets
import time
import uuid
from datetime import timezone
from urllib.parse import urlsplit, urlunsplit

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config
from app.integrations.lti import keys
from app.integrations.lti.launch import AGS_SCOPE_SCORE, CLAIM, NRPS_SCOPE, http_client
from app.models import ActivitySession, LtiLaunch, LtiPlatform, LtiScoreSubmission, LtiSessionLink

log = logging.getLogger(__name__)

SCORE_MAXIMUM = 100.0
GRADED_ACTIVITY_PREFIX = "quiz:"
_token_cache: dict[tuple[str, str], tuple[str, float]] = {}


# ── OAuth2 client credentials (JWT bearer assertion) ────────────────────────

def access_token(db: Session, platform: LtiPlatform, scope: str) -> str:
    cached = _token_cache.get((platform.id, scope))
    if cached and cached[1] - 30 > time.time():
        return cached[0]
    now = int(time.time())
    assertion = keys.sign(db, {
        "iss": platform.client_id, "sub": platform.client_id, "aud": platform.auth_token_url,
        "iat": now, "exp": now + 300, "jti": uuid.uuid4().hex,
    })
    with http_client() as client:
        res = client.post(platform.auth_token_url, data={
            "grant_type": "client_credentials",
            "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            "client_assertion": assertion,
            "scope": scope,
        })
        res.raise_for_status()
        body = res.json()
    token = body["access_token"]
    _token_cache[(platform.id, scope)] = (token, time.time() + float(body.get("expires_in", 3600)))
    return token


def scores_url(lineitem: str) -> str:
    """`{lineitem}/scores`, keeping any query string (Moodle uses ?type_id=…)."""
    parts = urlsplit(lineitem)
    return urlunsplit(parts._replace(path=parts.path.rstrip("/") + "/scores"))


# ── NRPS course roster ───────────────────────────────────────────────────────

NRPS_MEDIA_TYPE = "application/vnd.ims.lti-nrps.v2.membershipcontainer+json"
ROSTER_TTL_S = 300
ROSTER_MAX_PAGES = 20
_roster_cache: dict[str, tuple[float, list[dict]]] = {}


def fetch_roster(db: Session, platform: LtiPlatform, memberships_url: str) -> list[dict]:
    """Active members of the course: [{user_id, name, roles, is_learner}]. Cached for 5 min."""
    cached = _roster_cache.get(memberships_url)
    if cached and time.time() - cached[0] < ROSTER_TTL_S:
        return cached[1]
    token = access_token(db, platform, NRPS_SCOPE)
    members: list[dict] = []
    url: str | None = memberships_url
    with http_client() as client:
        for _ in range(ROSTER_MAX_PAGES):
            if not url:
                break
            res = client.get(url, headers={"Authorization": f"Bearer {token}", "Accept": NRPS_MEDIA_TYPE})
            res.raise_for_status()
            for m in res.json().get("members", []):
                if m.get("status", "Active") != "Active" or not m.get("user_id"):
                    continue
                roles = [r for r in m.get("roles", []) if isinstance(r, str)]
                name = m.get("name") or " ".join(p for p in (m.get("given_name"), m.get("family_name")) if p)
                members.append({"user_id": str(m["user_id"]), "name": name or str(m["user_id"]),
                                "roles": roles, "is_learner": any(r == "Learner" or r.endswith("#Learner") for r in roles)})
            url = res.links.get("next", {}).get("url")
    _roster_cache[memberships_url] = (time.time(), members)
    return members


# ── AGS score publishing ─────────────────────────────────────────────────────

def gradable(launch: LtiLaunch, sess: ActivitySession) -> str | None:
    """Reason the session is NOT sent, or None if it should be."""
    if not launch.ags_lineitem or AGS_SCOPE_SCORE not in (launch.ags_scopes or []):
        return "La actividad de la plataforma no tiene calificación"
    if launch.is_instructor:
        return "Las evaluaciones del docente no se envían al libro de calificaciones"
    if not (sess.activity or "").startswith(GRADED_ACTIVITY_PREFIX):
        return "Solo las evaluaciones se califican"
    unit = (launch.custom or {}).get("unit")
    if unit and sess.activity != GRADED_ACTIVITY_PREFIX + unit:
        return "La evaluación no corresponde a la unidad de esta actividad"
    if not sess.max_score:
        return "Sesión sin puntaje"
    return None


def publish_session_score(db: Session, session_id: str) -> LtiScoreSubmission | None:
    link = db.get(LtiSessionLink, session_id)
    if link is None:
        return None
    sess = db.get(ActivitySession, session_id)
    launch = db.get(LtiLaunch, link.launch_id)
    if sess is None or launch is None or sess.ended_at is None or gradable(launch, sess):
        return None
    platform = db.get(LtiPlatform, launch.platform_id)
    score = round(SCORE_MAXIMUM * max(0.0, min(1.0, (sess.score or 0) / sess.max_score)), 2)
    sub = LtiScoreSubmission(session_id=sess.id, launch_id=launch.id, score_given=score,
                             score_maximum=SCORE_MAXIMUM, status="failed")

    best = db.scalar(
        select(LtiScoreSubmission.score_given)
        .join(LtiLaunch, LtiLaunch.id == LtiScoreSubmission.launch_id)
        .where(LtiLaunch.platform_id == launch.platform_id, LtiLaunch.user_sub == launch.user_sub,
               LtiLaunch.ags_lineitem == launch.ags_lineitem, LtiScoreSubmission.status == "sent")
        .order_by(LtiScoreSubmission.score_given.desc())
        .limit(1)
    )
    if best is not None and score <= best:
        sub.status, sub.detail = "skipped", f"Se conserva la mejor nota enviada ({best:g}/{SCORE_MAXIMUM:g})"
        db.add(sub)
        db.commit()
        return sub

    unit_title = sess.activity[len(GRADED_ACTIVITY_PREFIX):]
    payload = {
        "userId": launch.user_sub,
        "scoreGiven": score,
        "scoreMaximum": SCORE_MAXIMUM,
        "activityProgress": "Completed",
        "gradingProgress": "FullyGraded",
        "timestamp": sess.ended_at.astimezone(timezone.utc).isoformat(),
        "comment": f"HandsOnEdu · Aula de Señas · evaluación {unit_title}: {sess.score:g}/{sess.max_score:g}",
    }
    try:
        token = access_token(db, platform, AGS_SCOPE_SCORE)
        with http_client() as client:
            res = client.post(scores_url(launch.ags_lineitem), json=payload, headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/vnd.ims.lis.v1.score+json",
            })
        sub.http_status = res.status_code
        if res.is_success:
            sub.status = "sent"
        else:
            sub.detail = res.text[:500]
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        sub.detail = f"{type(exc).__name__}: {exc}"[:500]
        log.warning("AGS score publish failed for session %s: %s", session_id, sub.detail)
    db.add(sub)
    db.commit()
    return sub


def publish_in_background(session_id: str) -> None:
    """BackgroundTasks entry point: own DB session, never raises."""
    from app.db import SessionLocal

    try:
        with SessionLocal() as db:
            publish_session_score(db, session_id)
    except Exception:  # noqa: BLE001 — a grading failure must never break the learner flow
        log.exception("Unexpected error publishing LTI score for session %s", session_id)


# ── Deep Linking ─────────────────────────────────────────────────────────────

def deep_linking_response(db: Session, launch: LtiLaunch, items: list[dict]) -> tuple[str, str]:
    """Signed LtiDeepLinkingResponse JWT and the LMS return URL."""
    platform = db.get(LtiPlatform, launch.platform_id)
    settings_ = launch.deep_linking or {}
    now = int(time.time())
    claims = {
        "iss": platform.client_id,
        "aud": platform.issuer,
        "iat": now,
        "exp": now + 600,
        "nonce": secrets.token_urlsafe(16),
        CLAIM + "deployment_id": launch.deployment_id,
        CLAIM + "message_type": "LtiDeepLinkingResponse",
        CLAIM + "version": "1.3.0",
        "https://purl.imsglobal.org/spec/lti-dl/claim/content_items": items,
    }
    if settings_.get("data") is not None:
        claims["https://purl.imsglobal.org/spec/lti-dl/claim/data"] = settings_["data"]
    return keys.sign(db, claims), settings_["deep_link_return_url"]


def unit_content_item(unit: dict, graded: bool) -> dict:
    title = f"Aula de Señas · {unit['title']}"
    item = {
        "type": "ltiResourceLink",
        "title": title,
        "text": "Lección y evaluación de la unidad con reconocimiento de señas en vivo (HandsOnEdu).",
        "url": f"{config.settings.public_base_url}/lti/launch",
        "custom": {"unit": unit["id"]},
    }
    if graded:
        item["lineItem"] = {
            "scoreMaximum": SCORE_MAXIMUM,
            "label": f"{title} — evaluación",
            "resourceId": GRADED_ACTIVITY_PREFIX + unit["id"],
            "tag": "handsonedu-aula",
        }
    return item


def course_content_item() -> dict:
    return {
        "type": "ltiResourceLink",
        "title": "Aula de Señas (curso completo)",
        "text": "Ruta completa de aprendizaje de lengua de señas con progreso del estudiante (HandsOnEdu).",
        "url": f"{config.settings.public_base_url}/lti/launch",
        "custom": {},
    }

