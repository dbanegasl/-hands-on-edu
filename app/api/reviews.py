"""
Interpreter review of signs (/validacion, REQ-023).

The interpreter tests each sign with the Aula's assessment rule: done well it
must be accepted, done with typical learner mistakes it must be rejected. Each
result is stored as it is made, so a long sitting is never lost; the report is
the latest review of each sign. Teacher/admin only (`X-Admin-Token`).
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.db import get_db
from app.models import SignReview
from app.signs.catalog import get_catalog

router = APIRouter(prefix="/api", tags=["validación de señas"], dependencies=[Depends(require_admin)])

DECISIONS = ("ok", "regrabar", "corregir", "retirar")
MAX_TRIALS = 10


class SignReviewIn(BaseModel):
    sign_id: str = Field(min_length=1, max_length=40)
    reviewer: str = Field(min_length=1, max_length=80)
    sitting: str | None = Field(default=None, max_length=40)
    content_ok: bool | None = None
    content_note: str | None = Field(default=None, max_length=2000)
    recognizable: bool = True
    good_ok: int = Field(default=0, ge=0, le=MAX_TRIALS)
    good_trials: int = Field(default=0, ge=0, le=MAX_TRIALS)
    bad_ok: int = Field(default=0, ge=0, le=MAX_TRIALS)
    bad_trials: int = Field(default=0, ge=0, le=MAX_TRIALS)
    bad_note: str | None = Field(default=None, max_length=200)
    decision: Literal["ok", "regrabar", "corregir", "retirar"]
    note: str | None = Field(default=None, max_length=2000)
    engine: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _consistent(self):
        if self.good_ok > self.good_trials or self.bad_ok > self.bad_trials:
            raise ValueError("Hay más intentos aceptados que intentos")
        if len(str(self.engine)) > 2000:
            raise ValueError("engine demasiado grande")
        return self


class SignReviewOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    sign_id: str
    reviewer: str
    sitting: str | None
    content_ok: bool | None
    content_note: str | None
    recognizable: bool
    good_ok: int
    good_trials: int
    bad_ok: int
    bad_trials: int
    bad_note: str | None
    decision: str
    note: str | None
    engine: dict
    created_at: object


def _catalog_or_404(language: str) -> dict:
    try:
        return get_catalog(language)
    except KeyError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Lengua de señas desconocida: {language}") from None


def _clean(text: str | None) -> str | None:
    return (text or "").strip() or None


@router.post("/signs/{language}/reviews", response_model=SignReviewOut, status_code=status.HTTP_201_CREATED,
             summary="Guardar la revisión de una seña hecha por un intérprete (docente)")
def create_review(language: str, body: SignReviewIn, db: Session = Depends(get_db)):
    catalog = _catalog_or_404(language)
    if body.sign_id not in {s["id"] for s in catalog.get("signs", [])}:
        raise HTTPException(422, f"Seña desconocida: {body.sign_id}")
    reviewer = body.reviewer.strip()
    if not reviewer:
        raise HTTPException(422, "Falta el nombre de quien revisa")
    from app.main import APP_VERSION  # late import: app.main imports this router

    row = SignReview(
        language=language, sign_id=body.sign_id, reviewer=reviewer, sitting=_clean(body.sitting),
        content_ok=body.content_ok, content_note=_clean(body.content_note), recognizable=body.recognizable,
        good_ok=body.good_ok, good_trials=body.good_trials, bad_ok=body.bad_ok, bad_trials=body.bad_trials,
        bad_note=_clean(body.bad_note), decision=body.decision, note=_clean(body.note),
        engine={**body.engine, "app_version": APP_VERSION},
    )
    db.add(row)
    db.commit()
    return row


@router.get("/signs/{language}/reviews", response_model=list[SignReviewOut],
            summary="Revisiones de señas: la última de cada seña (o todas con history=true)")
def list_reviews(language: str, history: bool = Query(False), db: Session = Depends(get_db)):
    _catalog_or_404(language)
    rows = db.scalars(select(SignReview).where(SignReview.language == language)
                      .order_by(SignReview.created_at.desc(), SignReview.id.desc())).all()
    if history:
        return rows
    latest: dict[str, SignReview] = {}
    for r in rows:
        latest.setdefault(r.sign_id, r)
    return list(latest.values())
