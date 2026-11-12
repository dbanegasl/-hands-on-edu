"""
LTI 1.3 endpoints (REQ-019): Moodle (or any LTI Advantage LMS) launches the
Aula de Señas with single sign-on and receives quiz grades through AGS.

Public, called by the LMS / browser:
  GET|POST /lti/login   OIDC login initiation
  POST     /lti/launch  id_token validation → redirect to the app with a launch token
  GET      /lti/jwks    tool public keys
Browser, with `Authorization: Bearer <launch token>`:
  GET  /api/lti/me, POST /api/lti/deeplink, GET /api/lti/sessions/{id}/grade
Admin (X-Admin-Token): /api/lti/platforms CRUD; GET /api/lti/tool-config is public.
"""
from html import escape
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config
from app.api.deps import require_admin, require_lti
from app.api.pages import PAGES, STATIC
from app.db import get_db
from app.integrations.lti import keys, services
from app.integrations.lti.launch import (
    AGS_SCOPE_SCORE,
    MSG_DEEP_LINKING,
    LtiError,
    begin_login,
    launch_url,
    validate_launch,
)
from app.models import (
    ActivitySession,
    Learner,
    LtiDeployment,
    LtiLaunch,
    LtiPlatform,
    LtiScoreSubmission,
    LtiSessionLink,
)
from app.schemas import (
    DeepLinkIn,
    DeepLinkOut,
    GradeSyncOut,
    LearnerOut,
    LtiDeploymentIn,
    LtiPlatformIn,
    LtiPlatformOut,
)
from app.signs.catalog import CatalogError, get_catalog

router = APIRouter(tags=["lti"])

INSTRUCTOR_PAGES = {"/aula", "/signstudio"}


def _error_page(message: str, code: int = 400) -> HTMLResponse:
    body = f"""<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>HandsOnEdu · LTI</title>
<style>body{{font-family:system-ui,sans-serif;background:#0f1226;color:#f1f5f9;display:grid;place-items:center;
min-height:100vh;margin:0;padding:16px}}main{{max-width:560px;background:#191d3a;border:1px solid #343c72;
border-radius:16px;padding:24px}}h1{{font-size:1.3rem;margin:0 0 10px}}p{{color:#a5b0c8;line-height:1.5}}</style>
</head><body><main><h1>🤟 No se pudo abrir HandsOnEdu</h1><p>{escape(message)}</p>
<p>Si el problema continúa, avisa a tu docente o al administrador de la plataforma.</p></main></body></html>"""
    return HTMLResponse(body, status_code=code)


# ── LMS-facing endpoints ─────────────────────────────────────────────────────

@router.get("/lti/jwks", summary="Claves públicas de la herramienta (JWKS)")
def tool_jwks(db: Session = Depends(get_db)):
    return keys.jwks(db)


def _login(db: Session, params: dict):
    try:
        return RedirectResponse(begin_login(db, params), status_code=status.HTTP_302_FOUND)
    except LtiError as exc:
        return _error_page(str(exc))


@router.get("/lti/login", summary="Inicio de sesión OIDC (GET)", include_in_schema=False)
def lti_login_get(request: Request, db: Session = Depends(get_db)):
    return _login(db, dict(request.query_params))


@router.post("/lti/login", summary="Inicio de sesión OIDC (POST)")
def lti_login_post(
    iss: str = Form(""), login_hint: str = Form(""), target_link_uri: str = Form(""),
    lti_message_hint: str = Form(""), client_id: str = Form(""), lti_deployment_id: str = Form(""),
    db: Session = Depends(get_db),
):
    return _login(db, {
        "iss": iss, "login_hint": login_hint, "target_link_uri": target_link_uri,
        "lti_message_hint": lti_message_hint, "client_id": client_id, "lti_deployment_id": lti_deployment_id,
    })


def _target_page(target_link_uri: str, instructor: bool) -> str:
    """Learners always land in the Aula; instructors may target another tool page."""
    if instructor and target_link_uri:
        parts = urlsplit(target_link_uri)
        same_origin = not parts.netloc or parts.netloc == urlsplit(config.settings.public_base_url).netloc
        if same_origin and parts.path in INSTRUCTOR_PAGES and parts.path in PAGES:
            return parts.path
    return "/aula"


@router.post("/lti/launch", summary="Lanzamiento LTI 1.3 (id_token)")
def lti_launch(id_token: str = Form(""), state: str = Form(""), db: Session = Depends(get_db)):
    try:
        data = validate_launch(db, id_token, state)
    except LtiError as exc:
        return _error_page(str(exc))

    external_id = f"lti:{data.platform.id}:{data.sub}"
    learner = db.scalars(select(Learner).where(Learner.external_id == external_id)).first()
    if learner is None:
        learner = Learner(display_name=data.name, external_id=external_id)
        db.add(learner)
    elif learner.display_name != data.name and data.name != "Estudiante":
        learner.display_name = data.name
    db.flush()

    launch = LtiLaunch(
        platform_id=data.platform.id, learner_id=learner.id, user_sub=data.sub,
        deployment_id=data.deployment_id, message_type=data.message_type, roles=data.roles,
        is_instructor=data.is_instructor, context_id=data.context.get("id"),
        context_title=data.context.get("title") or data.context.get("label"),
        resource_link_id=data.resource_link.get("id"), resource_link_title=data.resource_link.get("title"),
        custom=data.custom or None, ags_lineitem=data.ags.get("lineitem"), ags_scopes=data.ags.get("scope"),
        deep_linking=data.deep_linking,
    )
    db.add(launch)
    db.commit()

    token = keys.issue_app_token(db, learner_id=learner.id, launch_id=launch.id, instructor=data.is_instructor)
    if data.message_type == MSG_DEEP_LINKING:
        if not data.is_instructor:
            return _error_page("Solo un docente puede elegir el contenido de la actividad.", 403)
        target = "/lti/deeplink"
    else:
        target = _target_page(data.target_link_uri, data.is_instructor)
    # The token travels in the fragment: never sent to servers or written to access logs.
    return RedirectResponse(f"{target}#lti={token}", status_code=status.HTTP_303_SEE_OTHER)


# ── Browser endpoints (launch token) ─────────────────────────────────────────

def _launch(db: Session, ctx: dict) -> LtiLaunch:
    launch = db.get(LtiLaunch, ctx["lti_launch"])
    if launch is None or launch.learner_id != ctx["sub"]:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Lanzamiento LTI desconocido")
    return launch


@router.get("/api/lti/me", summary="Estudiante y contexto del lanzamiento LTI actual")
def lti_me(ctx: dict = Depends(require_lti), db: Session = Depends(get_db)):
    launch = _launch(db, ctx)
    platform = db.get(LtiPlatform, launch.platform_id)
    graded = bool(launch.ags_lineitem) and AGS_SCOPE_SCORE in (launch.ags_scopes or [])
    return {
        "learner": LearnerOut.model_validate(db.get(Learner, launch.learner_id)).model_dump(mode="json"),
        "launch": {
            "id": launch.id,
            "platform": platform.name if platform else None,
            "message_type": launch.message_type,
            "is_instructor": launch.is_instructor,
            "context_title": launch.context_title,
            "resource_link_title": launch.resource_link_title,
            "unit": (launch.custom or {}).get("unit"),
            "graded": graded,
        },
    }


@router.post("/api/lti/deeplink", response_model=DeepLinkOut,
             summary="Docente: elegir unidades del Aula para la actividad del LMS (Deep Linking)")
def lti_deeplink(body: DeepLinkIn, ctx: dict = Depends(require_lti), db: Session = Depends(get_db)):
    launch = _launch(db, ctx)
    if launch.message_type != MSG_DEEP_LINKING or not launch.deep_linking:
        raise HTTPException(status.HTTP_409_CONFLICT, "Este lanzamiento no es una solicitud de Deep Linking")
    if not launch.is_instructor:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo docentes")
    try:
        catalog = get_catalog(body.language)
    except (CatalogError, FileNotFoundError, KeyError) as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lengua no disponible") from exc
    units = {u["id"]: u for u in catalog["units"]}
    unknown = [u for u in body.units if u not in units]
    if unknown:
        raise HTTPException(422, f"Unidades desconocidas: {', '.join(unknown)}")
    items = [services.course_content_item()] if body.course else []
    items += [services.unit_content_item(units[u], body.graded) for u in body.units]
    if not items:
        raise HTTPException(422, "Elige al menos una unidad o el curso completo")
    accept = (launch.deep_linking or {}).get("accept_multiple", True)
    if accept is False and len(items) > 1:
        raise HTTPException(422, "La plataforma solo acepta un elemento a la vez")
    jwt_, return_url = services.deep_linking_response(db, launch, items)
    return DeepLinkOut(return_url=return_url, jwt=jwt_)


@router.get("/api/lti/sessions/{session_id}/grade", response_model=GradeSyncOut,
            summary="Estado del envío de la nota de una sesión a la plataforma")
def lti_grade_status(session_id: str, ctx: dict = Depends(require_lti), db: Session = Depends(get_db)):
    sess = db.get(ActivitySession, session_id)
    if sess is None or sess.learner_id != ctx["sub"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sesión no encontrada")
    link = db.get(LtiSessionLink, session_id)
    if link is None:
        return GradeSyncOut(status="not_graded", detail="La sesión no pertenece a una actividad de la plataforma")
    launch = db.get(LtiLaunch, link.launch_id)
    reason = services.gradable(launch, sess) if sess.ended_at else None
    if reason:
        return GradeSyncOut(status="not_graded", detail=reason)
    last = db.scalars(select(LtiScoreSubmission).where(LtiScoreSubmission.session_id == session_id)
                      .order_by(LtiScoreSubmission.id.desc())).first()
    if last is None:
        return GradeSyncOut(status="none")
    return GradeSyncOut(status=last.status, score_given=last.score_given,
                        score_maximum=last.score_maximum, detail=last.detail)


# ── Administration ───────────────────────────────────────────────────────────

@router.get("/api/lti/tool-config", summary="Datos para registrar HandsOnEdu como herramienta LTI 1.3")
def tool_config():
    base = config.settings.public_base_url
    return {
        "title": "HandsOnEdu — Aula de Señas",
        "description": "Enseñanza de lengua de señas con reconocimiento de manos en el navegador.",
        "tool_url": launch_url(),
        "initiate_login_url": f"{base}/lti/login",
        "redirection_uris": [launch_url()],
        "jwks_url": f"{base}/lti/jwks",
        "deep_linking_url": launch_url(),
        "custom_parameters": {"unit": "Opcional: id de unidad del catálogo (p. ej. u1). Lo completa el Deep Linking."},
        "scopes": [AGS_SCOPE_SCORE],
        "launch_container": "Nueva ventana (la cámara no funciona en iframes sin permiso explícito)",
    }


def _platform_out(p: LtiPlatform) -> LtiPlatformOut:
    return LtiPlatformOut(
        id=p.id, name=p.name, issuer=p.issuer, client_id=p.client_id, auth_login_url=p.auth_login_url,
        auth_token_url=p.auth_token_url, jwks_url=p.jwks_url,
        deployment_ids=sorted(d.deployment_id for d in p.deployments), created_at=p.created_at,
    )


@router.get("/api/lti/platforms", response_model=list[LtiPlatformOut], dependencies=[Depends(require_admin)])
def list_platforms(db: Session = Depends(get_db)):
    return [_platform_out(p) for p in db.scalars(select(LtiPlatform).order_by(LtiPlatform.created_at)).all()]


@router.post("/api/lti/platforms", response_model=LtiPlatformOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_admin)], summary="Registrar una plataforma (p. ej. un sitio Moodle)")
def create_platform(body: LtiPlatformIn, db: Session = Depends(get_db)):
    dup = db.scalars(select(LtiPlatform).where(LtiPlatform.issuer == body.issuer,
                                               LtiPlatform.client_id == body.client_id)).first()
    if dup:
        raise HTTPException(status.HTTP_409_CONFLICT, "Esa plataforma (issuer + client_id) ya está registrada")
    platform = LtiPlatform(**body.model_dump(exclude={"deployment_ids"}))
    platform.deployments = [LtiDeployment(deployment_id=d) for d in dict.fromkeys(body.deployment_ids)]
    db.add(platform)
    db.commit()
    return _platform_out(platform)


@router.post("/api/lti/platforms/{platform_id}/deployments", response_model=LtiPlatformOut,
             dependencies=[Depends(require_admin)])
def add_deployment(platform_id: str, body: LtiDeploymentIn, db: Session = Depends(get_db)):
    platform = db.get(LtiPlatform, platform_id)
    if platform is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plataforma no encontrada")
    if body.deployment_id not in {d.deployment_id for d in platform.deployments}:
        platform.deployments.append(LtiDeployment(deployment_id=body.deployment_id))
        db.commit()
    return _platform_out(platform)


@router.delete("/api/lti/platforms/{platform_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_admin)])
def delete_platform(platform_id: str, db: Session = Depends(get_db)):
    platform = db.get(LtiPlatform, platform_id)
    if platform is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plataforma no encontrada")
    db.delete(platform)
    db.commit()


@router.get("/lti/deeplink", include_in_schema=False)
def deeplink_page():
    return FileResponse(f"{STATIC}/lti-deeplink.html")


@router.get("/lti/setup", include_in_schema=False)
def setup_page():
    return FileResponse(f"{STATIC}/lti-setup.html")
