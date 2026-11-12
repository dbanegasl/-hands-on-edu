"""Sign-language catalogs and teacher-recorded reference templates."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.db import get_db
from app.models import SignTemplate
from app.schemas import TemplateCreate, TemplateImport, TemplateOut
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


@router.get("/signs/{language}/catalog", summary="Catálogo completo de una lengua de señas")
def catalog(language: str):
    return _catalog_or_404(language)


@router.get("/signs/{language}/templates", response_model=list[TemplateOut],
            summary="Plantillas de referencia grabadas (todas o de una seña)")
def list_templates(language: str, sign_id: str | None = Query(default=None), db: Session = Depends(get_db)):
    _catalog_or_404(language)
    stmt = select(SignTemplate).where(SignTemplate.language == language)
    if sign_id:
        stmt = stmt.where(SignTemplate.sign_id == sign_id)
    return db.scalars(stmt.order_by(SignTemplate.sign_id, SignTemplate.created_at)).all()


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
