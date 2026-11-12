"""Learners, activity sessions, sign attempts and per-sign mastery."""
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import LearnerCredentials, new_learner_secret
from app.db import get_db
from app.integrations.lti import services as lti_services
from app.models import ActivitySession, Learner, LtiSessionLink, SignAttempt
from app.schemas import (
    AttemptsBatch,
    LearnerClaimed,
    LearnerCreate,
    LearnerCreated,
    LearnerOut,
    ProgressOut,
    SessionCreate,
    SessionFinish,
    SessionOut,
    SignProgress,
)

router = APIRouter(prefix="/api", tags=["aprendizaje"])

# Mastery = exponentially weighted moving average of correctness, oldest → newest.
# Recent attempts weigh more, so a learner who used to fail but now succeeds
# climbs quickly, and a forgotten sign decays after a few misses.
MASTERY_ALPHA = 0.35
MASTERED_THRESHOLD = 0.8


def compute_mastery(outcomes: list[bool], alpha: float = MASTERY_ALPHA) -> float:
    m = 0.0
    for ok in outcomes:
        m = alpha * (1.0 if ok else 0.0) + (1 - alpha) * m
    return round(m, 4)


def _get_or_404(db: Session, model, key: str, label: str):
    obj = db.get(model, key)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{label} no encontrado")
    return obj


def _learner_for(db: Session, learner_id: str, creds: LearnerCredentials) -> Learner:
    learner = _get_or_404(db, Learner, learner_id, "Estudiante")
    creds.check(learner)
    return learner


def _session_for(db: Session, session_id: str, creds: LearnerCredentials) -> ActivitySession:
    sess = _get_or_404(db, ActivitySession, session_id, "Sesión")
    creds.check(sess.learner)
    return sess


@router.post("/learners", response_model=LearnerCreated, status_code=status.HTTP_201_CREATED,
             summary="Crear un perfil de estudiante local",
             description="Devuelve una sola vez el `token` del perfil: el navegador lo guarda y lo envía en "
                         "`X-Learner-Token` para leer o guardar los datos de ese estudiante.")
def create_learner(body: LearnerCreate, db: Session = Depends(get_db)):
    secret, secret_hash = new_learner_secret()
    learner = Learner(display_name=body.display_name.strip(), secret_hash=secret_hash)
    db.add(learner)
    db.commit()
    return LearnerCreated(id=learner.id, display_name=learner.display_name, created_at=learner.created_at, token=secret)


@router.post("/learners/{learner_id}/claim", response_model=LearnerClaimed,
             summary="Obtener la credencial de un perfil creado antes de v0.17",
             description="Solo para perfiles locales que aún no tienen credencial (creados antes de v0.17): "
                         "el primer navegador que la pide la recibe. Después responde 409.")
def claim_learner(learner_id: str, db: Session = Depends(get_db)):
    learner = _get_or_404(db, Learner, learner_id, "Estudiante")
    if learner.secret_hash is not None or learner.external_id is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Este perfil ya tiene credencial o es de la plataforma educativa")
    secret, learner.secret_hash = new_learner_secret()
    db.commit()
    return LearnerClaimed(id=learner.id, token=secret)


@router.get("/learners/{learner_id}", response_model=LearnerOut)
def get_learner(learner_id: str, db: Session = Depends(get_db), creds: LearnerCredentials = Depends()):
    return _learner_for(db, learner_id, creds)


@router.get("/learners/{learner_id}/sessions", response_model=list[SessionOut],
            summary="Historial de sesiones de un estudiante (más recientes primero)")
def learner_sessions(
    learner_id: str,
    module: str | None = Query(default=None),
    finished: bool | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    creds: LearnerCredentials = Depends(),
):
    _learner_for(db, learner_id, creds)
    stmt = select(ActivitySession).where(ActivitySession.learner_id == learner_id)
    if module:
        stmt = stmt.where(ActivitySession.module == module)
    if finished is True:
        stmt = stmt.where(ActivitySession.ended_at.is_not(None))
    elif finished is False:
        stmt = stmt.where(ActivitySession.ended_at.is_(None))
    stmt = stmt.order_by(ActivitySession.started_at.desc()).limit(limit)
    return db.scalars(stmt).all()


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED,
             summary="Iniciar una sesión de actividad")
def create_session(body: SessionCreate, db: Session = Depends(get_db), creds: LearnerCredentials = Depends()):
    _learner_for(db, body.learner_id, creds)
    lti = creds.lti
    sess = ActivitySession(**body.model_dump())
    db.add(sess)
    db.flush()
    if lti is not None:
        # Started inside an LMS activity: its result can go back to the gradebook (AGS).
        db.add(LtiSessionLink(session_id=sess.id, launch_id=lti["lti_launch"]))
    db.commit()
    return sess


@router.post("/sessions/{session_id}/attempts", status_code=status.HTTP_201_CREATED,
             summary="Registrar intentos de señas en una sesión")
def add_attempts(session_id: str, body: AttemptsBatch, db: Session = Depends(get_db),
                 creds: LearnerCredentials = Depends()):
    sess = _session_for(db, session_id, creds)
    if sess.ended_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "La sesión ya terminó")
    if not sess.language:
        raise HTTPException(422, "La sesión no tiene lengua de señas")
    db.add_all([
        SignAttempt(session_id=sess.id, learner_id=sess.learner_id, language=sess.language, **a.model_dump())
        for a in body.attempts
    ])
    db.commit()
    return {"recorded": len(body.attempts)}


@router.post("/sessions/{session_id}/finish", response_model=SessionOut, summary="Cerrar una sesión con su resultado")
def finish_session(session_id: str, body: SessionFinish, background: BackgroundTasks, db: Session = Depends(get_db),
                   creds: LearnerCredentials = Depends()):
    sess = _session_for(db, session_id, creds)
    if sess.ended_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "La sesión ya terminó")
    sess.ended_at = datetime.now(timezone.utc)
    sess.score, sess.max_score, sess.details = body.score, body.max_score, body.details
    db.commit()
    if db.get(LtiSessionLink, session_id) is not None:
        # Publish to the LMS gradebook after responding: a slow LMS never blocks the learner.
        background.add_task(lti_services.publish_in_background, session_id)
    return sess


@router.get("/learners/{learner_id}/progress", response_model=ProgressOut,
            summary="Dominio por seña de un estudiante")
def learner_progress(learner_id: str, language: str = Query(...), db: Session = Depends(get_db),
                     creds: LearnerCredentials = Depends()):
    _learner_for(db, learner_id, creds)
    rows = db.execute(
        select(SignAttempt.sign_id, SignAttempt.correct, SignAttempt.created_at)
        .where(SignAttempt.learner_id == learner_id, SignAttempt.language == language)
        .order_by(SignAttempt.created_at, SignAttempt.id)
    ).all()

    by_sign: dict[str, list] = {}
    for sign_id, correct, created_at in rows:
        by_sign.setdefault(sign_id, []).append((correct, created_at))

    signs = []
    for sign_id, items in sorted(by_sign.items()):
        outcomes = [c for c, _ in items]
        n_ok = sum(outcomes)
        signs.append(SignProgress(
            sign_id=sign_id,
            attempts=len(outcomes),
            correct=n_ok,
            accuracy=round(n_ok / len(outcomes), 4),
            mastery=compute_mastery(outcomes),
            last_attempt_at=items[-1][1],
        ))

    return ProgressOut(
        learner_id=learner_id,
        language=language,
        total_attempts=len(rows),
        signs_practiced=len(signs),
        signs_mastered=sum(1 for s in signs if s.mastery >= MASTERED_THRESHOLD),
        signs=signs,
    )
