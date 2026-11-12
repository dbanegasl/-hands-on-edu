"""Learners, activity sessions, sign attempts and per-sign mastery."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ActivitySession, Learner, SignAttempt
from app.schemas import (
    AttemptsBatch,
    LearnerCreate,
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


@router.post("/learners", response_model=LearnerOut, status_code=status.HTTP_201_CREATED,
             summary="Crear un perfil de estudiante local")
def create_learner(body: LearnerCreate, db: Session = Depends(get_db)):
    learner = Learner(display_name=body.display_name.strip())
    db.add(learner)
    db.commit()
    return learner


@router.get("/learners/{learner_id}", response_model=LearnerOut)
def get_learner(learner_id: str, db: Session = Depends(get_db)):
    return _get_or_404(db, Learner, learner_id, "Estudiante")


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED,
             summary="Iniciar una sesión de actividad")
def create_session(body: SessionCreate, db: Session = Depends(get_db)):
    _get_or_404(db, Learner, body.learner_id, "Estudiante")
    sess = ActivitySession(**body.model_dump())
    db.add(sess)
    db.commit()
    return sess


@router.post("/sessions/{session_id}/attempts", status_code=status.HTTP_201_CREATED,
             summary="Registrar intentos de señas en una sesión")
def add_attempts(session_id: str, body: AttemptsBatch, db: Session = Depends(get_db)):
    sess = _get_or_404(db, ActivitySession, session_id, "Sesión")
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
def finish_session(session_id: str, body: SessionFinish, db: Session = Depends(get_db)):
    sess = _get_or_404(db, ActivitySession, session_id, "Sesión")
    if sess.ended_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "La sesión ya terminó")
    sess.ended_at = datetime.now(timezone.utc)
    sess.score, sess.max_score, sess.details = body.score, body.max_score, body.details
    db.commit()
    return sess


@router.get("/learners/{learner_id}/progress", response_model=ProgressOut,
            summary="Dominio por seña de un estudiante")
def learner_progress(learner_id: str, language: str = Query(...), db: Session = Depends(get_db)):
    _get_or_404(db, Learner, learner_id, "Estudiante")
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
