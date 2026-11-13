"""Sign-language catalogs, teacher-recorded reference templates and trained models (REQ-010).

The three GETs every Aula/Studio page makes are serialized once per content
version, gzipped and revalidated with an ETag (`app.http_cache`): with several
recordings per sign the templates are megabytes, and a lab opens them at once.
"""
import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from pydantic import TypeAdapter
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.db import get_db
from app.http_cache import json_response
from app.models import SignModel, SignTemplate
from app.schemas import (
    MAX_MODEL_PARAMS,
    SignModelIn,
    SignModelOut,
    TemplateCreate,
    TemplateImport,
    TemplateOut,
)
from app.signs.catalog import available_languages, get_catalog

router = APIRouter(prefix="/api", tags=["señas"])

MIN_DYNAMIC_FRAMES = 5


def _catalog_or_404(language: str) -> dict:
    try:
        return get_catalog(language)
    except KeyError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Lengua de señas desconocida: {language}")


def _new_template(language: str, catalog: dict, body: TemplateCreate) -> SignTemplate:
    signs = {s["id"]: s for s in catalog.get("signs", [])}
    if body.sign_id not in signs:
        raise HTTPException(422, f"Seña desconocida: {body.sign_id}")
    if body.kind == "dynamic" and len(body.frames) < MIN_DYNAMIC_FRAMES:
        raise HTTPException(
            422,
            f"Una seña dinámica necesita al menos {MIN_DYNAMIC_FRAMES} cuadros",
        )
    return SignTemplate(
        language=language,
        sign_id=body.sign_id,
        kind=body.kind,
        hands=max(len(f.hands) for f in body.frames),
        frames=[f.model_dump() for f in body.frames],
        author=body.author,
    )


@router.get("/languages", summary="Lenguas de señas disponibles")
def list_languages():
    return available_languages()


_TEMPLATES = TypeAdapter(list[TemplateOut])


def _json(data) -> bytes:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=str).encode()


@router.get("/signs/{language}/catalog", summary="Catálogo completo de una lengua de señas")
def catalog(language: str, request: Request):
    data = _catalog_or_404(language)
    return json_response(request, ("catalog", language), None, lambda: _json(data))


@router.get("/signs/{language}/templates", response_model=list[TemplateOut],
            summary="Plantillas de referencia grabadas (todas o de una seña)")
def list_templates(request: Request, language: str, sign_id: str | None = Query(default=None),
                   db: Session = Depends(get_db)):
    _catalog_or_404(language)
    where = [SignTemplate.language == language] + ([SignTemplate.sign_id == sign_id] if sign_id else [])
    # Templates are immutable (create/import/delete), so their ids identify the content.
    ids = sorted(db.scalars(select(SignTemplate.id).where(*where)).all())
    version = hashlib.sha1(" ".join(ids).encode()).hexdigest()

    def build() -> bytes:
        rows = db.scalars(select(SignTemplate).where(*where)
                          .order_by(SignTemplate.sign_id, SignTemplate.created_at)).all()
        # Same validation + serialization FastAPI's response_model did, now once per version.
        return _TEMPLATES.dump_json(_TEMPLATES.validate_python(rows, from_attributes=True))

    return json_response(request, ("templates", language, sign_id), version, build)


@router.post("/signs/{language}/templates", response_model=TemplateOut,
             status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)],
             summary="Guardar una plantilla de referencia (docente)")
def create_template(language: str, body: TemplateCreate, db: Session = Depends(get_db)):
    tpl = _new_template(language, _catalog_or_404(language), body)
    db.add(tpl)
    db.commit()
    return tpl


@router.post("/signs/{language}/templates/import", dependencies=[Depends(require_admin)],
             summary="Importar un lote de plantillas (exportado de otra instancia)")
def import_templates(language: str, body: TemplateImport, db: Session = Depends(get_db)):
    catalog = _catalog_or_404(language)
    rows = [_new_template(language, catalog, t) for t in body.templates]
    db.add_all(rows)
    db.commit()
    return {"imported": len(rows)}


@router.delete("/signs/{language}/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_admin)], summary="Eliminar una plantilla (docente)")
def delete_template(language: str, template_id: str, db: Session = Depends(get_db)):
    tpl = db.get(SignTemplate, template_id)
    if tpl is None or tpl.language != language:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plantilla no encontrada")
    db.delete(tpl)
    db.commit()


# ── Trained classifier (REQ-010) ────────────────────────────────────────────
# Training and inference run in the browser (ho-signs-model.js); the server
# validates the network's shape, stores versions and serves the active one.


def _check_model(body: SignModelIn, catalog: dict) -> None:
    m = body.model
    c, h, d = len(m.classes), m.hidden, m.inputs
    sizes = {"mean": d, "std": d, "W1": h * d, "b1": h, "W2": c * h, "b2": c}
    for name, n in sizes.items():
        if len(getattr(m, name)) != n:
            raise HTTPException(422, f"Tamaño incorrecto en {name}: {len(getattr(m, name))} (se esperaba {n})")
    if h * d + c * h > MAX_MODEL_PARAMS:
        raise HTTPException(422, "Modelo demasiado grande")
    if len(set(m.classes)) != c:
        raise HTTPException(422, "Clases repetidas en el modelo")
    static_one_hand = {s["id"] for s in catalog.get("signs", []) if s.get("kind") == "static" and s.get("hands", 1) == 1}
    unknown = [x for x in m.classes if x not in static_one_hand]
    if unknown:
        raise HTTPException(422, f"El modelo solo puede incluir señas estáticas de una mano del catálogo: {', '.join(unknown[:5])}")


def _deactivate_all(db: Session, language: str) -> None:
    db.execute(update(SignModel).where(SignModel.language == language, SignModel.active.is_(True)).values(active=False))


def _model_or_404(db: Session, language: str, model_id: str) -> SignModel:
    m = db.get(SignModel, model_id)
    if m is None or m.language != language:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modelo no encontrado")
    return m


@router.get("/signs/{language}/model", summary="Modelo entrenado activo (pesos); 204 si no hay ninguno")
def active_model(language: str, request: Request, db: Session = Depends(get_db)):
    _catalog_or_404(language)
    m = db.scalars(select(SignModel).where(SignModel.language == language, SignModel.active.is_(True))
                   .order_by(SignModel.created_at.desc())).first()
    if m is None:  # the usual case: not an error, the engine works without a model
        return Response(status_code=status.HTTP_204_NO_CONTENT, headers={"Cache-Control": "no-cache"})
    return json_response(request, ("model", language), m.id,
                         lambda: _json({**m.model, "id": m.id, "created_at": m.created_at.isoformat()}))


@router.get("/signs/{language}/models", response_model=list[SignModelOut],
            summary="Modelos publicados (sin pesos), más reciente primero")
def list_models(language: str, db: Session = Depends(get_db)):
    _catalog_or_404(language)
    return db.scalars(select(SignModel).where(SignModel.language == language)
                      .order_by(SignModel.created_at.desc())).all()


@router.post("/signs/{language}/models", response_model=SignModelOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_admin)], summary="Publicar un modelo entrenado en el Estudio (docente)")
def publish_model(language: str, body: SignModelIn, db: Session = Depends(get_db)):
    catalog = _catalog_or_404(language)
    _check_model(body, catalog)
    trained_on = (body.model.model_extra or {}).get("trained_on") or {}
    if body.activate:
        _deactivate_all(db, language)
    m = SignModel(
        language=language, active=body.activate, author=body.author,
        classes=list(body.model.classes),
        template_count=int(trained_on.get("templates") or 0) if isinstance(trained_on, dict) else 0,
        metrics=body.metrics, model=body.model.model_dump(),
    )
    db.add(m)
    db.commit()
    return m


@router.post("/signs/{language}/models/{model_id}/activate", response_model=SignModelOut,
             dependencies=[Depends(require_admin)], summary="Activar un modelo publicado (p. ej. volver a uno anterior)")
def activate_model(language: str, model_id: str, db: Session = Depends(get_db)):
    m = _model_or_404(db, language, model_id)
    _deactivate_all(db, language)
    m.active = True
    db.commit()
    return m


@router.delete("/signs/{language}/model", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_admin)], summary="Desactivar el modelo (volver al motor sin modelo)")
def deactivate_model(language: str, db: Session = Depends(get_db)):
    _catalog_or_404(language)
    _deactivate_all(db, language)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/signs/{language}/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_admin)], summary="Eliminar un modelo publicado")
def delete_model(language: str, model_id: str, db: Session = Depends(get_db)):
    db.delete(_model_or_404(db, language, model_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
