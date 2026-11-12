"""
AttendEye attendance history (REQ-005): roll calls and participation sessions.

Students here are names typed by the teacher (a class list), not learner
profiles. Attendance is personal data, so every endpoint is a teacher action
guarded by the admin token (open when ADMIN_TOKEN is unset, as elsewhere).
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_admin
from app.db import get_db
from app.models import AttendanceRecord, AttendanceSession
from app.schemas import AttendanceClass, AttendanceIn, AttendanceOut, AttendanceSummary

router = APIRouter(prefix="/api/attendance", tags=["asistencia"], dependencies=[Depends(require_admin)])

STATUS_ES = {"present": "Presente", "absent": "Ausente", "skipped": "Omitido", "pending": "Sin marcar"}
METHOD_ES = {"gesture": "Gesto", "manual": "Manual"}


def summarize(a: AttendanceSession) -> dict:
    counts = {k: 0 for k in STATUS_ES}
    for r in a.records:
        counts[r.status] = counts.get(r.status, 0) + 1
    marked = counts["present"] + counts["absent"] + counts["skipped"]
    duration = None
    if a.ended_at is not None:
        duration = round(max(0.0, (a.ended_at - a.started_at).total_seconds()) / 60, 1)
    return {
        "id": a.id, "mode": a.mode, "class_name": a.class_name, "started_at": a.started_at, "ended_at": a.ended_at,
        "total": len(a.records), "present": counts["present"], "absent": counts["absent"],
        "skipped": counts["skipped"],
        "rate": round(counts["present"] / marked, 4) if a.mode == "rollcall" and marked else None,
        "participations": sum(r.participations for r in a.records), "duration_min": duration,
    }


def _get(db: Session, attendance_id: str) -> AttendanceSession:
    a = db.get(AttendanceSession, attendance_id, options=[selectinload(AttendanceSession.records)])
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registro de asistencia no encontrado")
    return a


@router.post("", response_model=AttendanceOut, status_code=status.HTTP_201_CREATED,
             summary="Guardar una lista de asistencia o una sesión de participación")
def create_attendance(body: AttendanceIn, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    a = AttendanceSession(mode=body.mode, class_name=body.class_name.strip(),
                          started_at=body.started_at or now, ended_at=body.ended_at or now)
    a.records = [AttendanceRecord(position=i, **r.model_dump()) for i, r in enumerate(body.records)]
    db.add(a)
    db.commit()
    db.refresh(a)
    return {**summarize(a), "records": a.records}


@router.get("", response_model=list[AttendanceSummary], summary="Historial de asistencia (más reciente primero)")
def list_attendance(
    class_name: str | None = Query(None, max_length=120),
    mode: str | None = Query(None, pattern="^(rollcall|participation)$"),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = select(AttendanceSession).options(selectinload(AttendanceSession.records))
    if class_name:
        q = q.where(AttendanceSession.class_name == class_name)
    if mode:
        q = q.where(AttendanceSession.mode == mode)
    rows = db.scalars(q.order_by(AttendanceSession.started_at.desc()).limit(limit)).all()
    return [summarize(a) for a in rows]


@router.get("/classes", response_model=list[AttendanceClass], summary="Clases registradas con su última lista")
def list_classes(db: Session = Depends(get_db)):
    stats = db.execute(
        select(AttendanceSession.class_name, func.count(AttendanceSession.id), func.max(AttendanceSession.started_at))
        .group_by(AttendanceSession.class_name)
    ).all()
    out = []
    for name, count, _ in stats:
        latest = db.scalars(select(AttendanceSession).options(selectinload(AttendanceSession.records))
                            .where(AttendanceSession.class_name == name)
                            .order_by(AttendanceSession.started_at.desc()).limit(1)).first()
        out.append({"class_name": name, "sessions": count, "last_at": latest.started_at,
                    "roster": [r.student_name for r in latest.records]})
    out.sort(key=lambda c: c["last_at"], reverse=True)
    return out


@router.get("/{attendance_id}", response_model=AttendanceOut, summary="Detalle de una sesión de asistencia")
def get_attendance(attendance_id: str, db: Session = Depends(get_db)):
    a = _get(db, attendance_id)
    return {**summarize(a), "records": a.records}


@router.get("/{attendance_id}/export.csv", summary="Exportar una sesión de asistencia (CSV)")
def export_attendance(
    attendance_id: str,
    tz: int = Query(0, ge=-840, le=840, description="Minutos al este de UTC del docente (Ecuador: -300)"),
    db: Session = Depends(get_db),
):
    a = _get(db, attendance_id)
    local = timezone(timedelta(minutes=tz))
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Clase", "Fecha", "Modo", "Estudiante", "Estado", "Hora", "Método", "Participaciones"])
    day = a.started_at.astimezone(local).strftime("%Y-%m-%d")
    mode = "Lista de asistencia" if a.mode == "rollcall" else "Participación"
    for r in a.records:
        w.writerow([a.class_name, day, mode, r.student_name, STATUS_ES.get(r.status, r.status),
                    r.marked_at.astimezone(local).strftime("%H:%M:%S") if r.marked_at else "",
                    METHOD_ES.get(r.method or "", ""), r.participations])
    safe = "".join(c if c.isascii() and c.isalnum() else "-" for c in a.class_name).strip("-")[:40] or "clase"
    return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="asistencia-{safe}-{day}.csv"'})


@router.delete("/{attendance_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Eliminar una sesión de asistencia")
def delete_attendance(attendance_id: str, db: Session = Depends(get_db)):
    db.delete(_get(db, attendance_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
