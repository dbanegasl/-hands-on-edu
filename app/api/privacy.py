"""Privacy notice data and the learner's own data rights (REQ-021)."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app import config, privacy
from app.api.deps import LearnerCredentials
from app.api.learning import _learner_for
from app.db import get_db

router = APIRouter(prefix="/api", tags=["privacidad"])
log = logging.getLogger("handsonedu.privacy")


@router.get("/privacy", summary="Responsable de los datos, contacto y plazo de conservación (para /privacidad)")
def privacy_info():
    s = config.settings
    return {
        "controller": s.privacy_controller or None,
        "contact": s.privacy_contact or None,
        "retention_days": s.data_retention_days or None,
        "not_stored": privacy.NOT_STORED,
    }


@router.get("/learners/{learner_id}/export", summary="Descargar todos los datos de un estudiante (JSON)")
def export_learner(learner_id: str, db: Session = Depends(get_db), creds: LearnerCredentials = Depends()):
    learner = _learner_for(db, learner_id, creds)
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return JSONResponse(privacy.export_learner(db, learner), headers={
        "Content-Disposition": f'attachment; filename="handsonedu-mis-datos-{day}.json"',
        "Cache-Control": "no-store",
    })


@router.delete("/learners/{learner_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Borrar un estudiante y toda su actividad")
def delete_learner(learner_id: str, db: Session = Depends(get_db), creds: LearnerCredentials = Depends()):
    learner = _learner_for(db, learner_id, creds)
    counts = privacy.delete_learner(db, learner)
    log.info("learner %s deleted on request (%s; by %s)", learner_id, counts,
             "admin" if creds.lti is None and creds.is_admin() else "the learner")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
