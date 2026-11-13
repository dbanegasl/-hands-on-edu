"""
Learners' data rights (REQ-021): export everything stored about a learner,
delete it, and purge data past the retention period.

Used by the API (`app/api/privacy.py`: the learner exercises their own rights
from /privacidad) and as a CLI for the administrator, inside the container:

  python -m app.privacy find "Ana"                  # learners whose name contains "Ana"
  python -m app.privacy export <learner_id> [-o f]  # everything stored about them (JSON)
  python -m app.privacy delete <learner_id> [--yes] # delete them and all their activity
  python -m app.privacy purge [--days N] [--attendance-days N] [--diagnostics-days N] [--yes]
                                                    # inactive learners / old roll calls / device checks;
                                                    # without --yes it only lists them
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from app import config
from app.models import (
    ActivitySession,
    AttendanceSession,
    DeviceCheck,
    Learner,
    LtiLaunch,
    LtiPlatform,
    LtiScoreSubmission,
    SignAttempt,
)

NOT_STORED = (
    "HandsOnEdu no guarda video ni imágenes de la cámara: las manos se detectan en el navegador "
    "y al servidor solo llegan los resultados de cada ejercicio."
)


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def origin(learner: Learner) -> str:
    return "lms" if learner.external_id else "local"


def last_activity(db: Session, learner: Learner) -> datetime:
    times = [
        learner.created_at,
        db.scalar(select(func.max(ActivitySession.started_at)).where(ActivitySession.learner_id == learner.id)),
        db.scalar(select(func.max(LtiLaunch.created_at)).where(LtiLaunch.learner_id == learner.id)),
    ]
    return max(_aware(t) for t in times if t is not None)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def export_learner(db: Session, learner: Learner) -> dict:
    """Everything HandsOnEdu stores about `learner`, in a form a person can read."""
    sessions = db.scalars(select(ActivitySession).where(ActivitySession.learner_id == learner.id)
                          .order_by(ActivitySession.started_at)).all()
    attempts: dict[str, list[SignAttempt]] = {}
    for a in db.scalars(select(SignAttempt).where(SignAttempt.learner_id == learner.id)
                        .order_by(SignAttempt.created_at, SignAttempt.id)):
        attempts.setdefault(a.session_id, []).append(a)
    launches = db.scalars(select(LtiLaunch).where(LtiLaunch.learner_id == learner.id)
                          .order_by(LtiLaunch.created_at)).all()
    platforms = {p.id: p.name for p in db.scalars(select(LtiPlatform))} if launches else {}
    grades = db.scalars(select(LtiScoreSubmission)
                        .where(LtiScoreSubmission.launch_id.in_([la.id for la in launches]))
                        .order_by(LtiScoreSubmission.created_at)).all() if launches else []
    return {
        "service": "HandsOnEdu",
        "version": _version(),
        "generated_at": _iso(datetime.now(timezone.utc)),
        "not_stored": NOT_STORED,
        "learner": {
            "id": learner.id,
            "display_name": learner.display_name,
            "origin": origin(learner),
            "lms_identity": learner.external_id,
            "created_at": _iso(learner.created_at),
        },
        "sessions": [{
            "id": s.id, "module": s.module, "activity": s.activity, "language": s.language,
            "started_at": _iso(s.started_at), "ended_at": _iso(s.ended_at),
            "score": s.score, "max_score": s.max_score, "details": s.details,
            "attempts": [{
                "sign_id": a.sign_id, "correct": a.correct, "confidence": a.confidence,
                "response_ms": a.response_ms, "created_at": _iso(a.created_at),
            } for a in attempts.get(s.id, [])],
        } for s in sessions],
        "lms_launches": [{
            "platform": platforms.get(la.platform_id), "course": la.context_title,
            "activity": la.resource_link_title, "roles": la.roles, "is_instructor": la.is_instructor,
            "created_at": _iso(la.created_at),
        } for la in launches],
        "grades_sent_to_lms": [{
            "session_id": g.session_id, "score_given": g.score_given, "score_maximum": g.score_maximum,
            "status": g.status, "created_at": _iso(g.created_at),
        } for g in grades],
    }


def delete_learner(db: Session, learner: Learner) -> dict:
    """Delete `learner` and everything that hangs from them (sessions, attempts, LMS launches)."""
    counts = {
        "sessions": db.scalar(select(func.count()).where(ActivitySession.learner_id == learner.id)),
        "attempts": db.scalar(select(func.count()).where(SignAttempt.learner_id == learner.id)),
        "lms_launches": db.scalar(select(func.count()).where(LtiLaunch.learner_id == learner.id)),
    }
    db.delete(learner)          # the database cascades (ondelete="CASCADE", SQLite foreign_keys=ON)
    db.commit()
    return counts


def inactive_learners(db: Session, days: int, now: datetime | None = None) -> list[Learner]:
    """Learners with no profile creation, session or LMS launch in the last `days` days."""
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=days)
    recent_session = exists().where(ActivitySession.learner_id == Learner.id, ActivitySession.started_at >= cutoff)
    recent_launch = exists().where(LtiLaunch.learner_id == Learner.id, LtiLaunch.created_at >= cutoff)
    stmt = (select(Learner).where(Learner.created_at < cutoff, ~recent_session, ~recent_launch)
            .order_by(Learner.created_at))
    return list(db.scalars(stmt))


def old_attendance(db: Session, days: int, now: datetime | None = None) -> list[AttendanceSession]:
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=days)
    return list(db.scalars(select(AttendanceSession).where(AttendanceSession.created_at < cutoff)
                           .order_by(AttendanceSession.created_at)))


def old_device_checks(db: Session, days: int, now: datetime | None = None) -> list[DeviceCheck]:
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=days)
    return list(db.scalars(select(DeviceCheck).where(DeviceCheck.created_at < cutoff)))


def _version() -> str:
    from app.main import APP_VERSION  # late import: app.main imports the API, which imports this module
    return APP_VERSION


# ── CLI ──────────────────────────────────────────────────────────────────────

def _get(db: Session, learner_id: str) -> Learner:
    learner = db.get(Learner, learner_id)
    if learner is None:
        raise SystemExit(f"No existe el estudiante {learner_id!r} (búscalo con: python -m app.privacy find <nombre>)")
    return learner


def _confirm(args, question: str) -> bool:
    if args.yes:
        return True
    if not sys.stdin.isatty():
        print("Sin --yes no se borra nada (modo de prueba).")
        return False
    return input(f"{question} Escribe «borrar» para confirmar: ").strip().lower() == "borrar"


def cmd_find(db: Session, args) -> int:
    pattern = f"%{args.text.strip()}%"
    rows = db.scalars(select(Learner).where(Learner.display_name.ilike(pattern)).order_by(Learner.display_name)).all()
    if not rows:
        print("Ningún estudiante con ese nombre.")
        return 1
    print(f"{'id':32}  {'origen':6}  {'creado':10}  {'última actividad':16}  nombre")
    for learner in rows:
        print(f"{learner.id:32}  {origin(learner):6}  {_aware(learner.created_at):%Y-%m-%d}  "
              f"{last_activity(db, learner):%Y-%m-%d %H:%M}  {learner.display_name}")
    return 0


def cmd_export(db: Session, args) -> int:
    data = json.dumps(export_learner(db, _get(db, args.learner_id)), ensure_ascii=False, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(data + "\n")
        print(f"Datos exportados a {args.output}", file=sys.stderr)
    else:
        print(data)
    return 0


def cmd_delete(db: Session, args) -> int:
    learner = _get(db, args.learner_id)
    print(f"{learner.display_name} ({origin(learner)}), creado el {_aware(learner.created_at):%Y-%m-%d}.")
    if not _confirm(args, "Se borrará este estudiante con toda su actividad."):
        return 1
    counts = delete_learner(db, learner)
    print("Borrado: {sessions} sesiones, {attempts} intentos, {lms_launches} accesos desde el LMS.".format(**counts))
    return 0


def cmd_purge(db: Session, args) -> int:
    days = args.days if args.days is not None else config.settings.data_retention_days
    if not days and args.attendance_days is None and args.diagnostics_days is None:
        raise SystemExit("Indica --days N (o define DATA_RETENTION_DAYS), --attendance-days N y/o --diagnostics-days N.")
    learners = inactive_learners(db, days) if days else []
    rollcalls = old_attendance(db, args.attendance_days) if args.attendance_days else []
    checks = old_device_checks(db, args.diagnostics_days) if args.diagnostics_days else []
    if days:
        print(f"Estudiantes sin actividad en {days} días: {len(learners)}")
        for learner in learners[:20]:
            print(f"  {learner.id}  {origin(learner):5}  última actividad {last_activity(db, learner):%Y-%m-%d}  "
                  f"{learner.display_name}")
        if len(learners) > 20:
            print(f"  … y {len(learners) - 20} más")
    if args.attendance_days:
        print(f"Sesiones de asistencia de hace más de {args.attendance_days} días: {len(rollcalls)}")
    if args.diagnostics_days:
        print(f"Diagnósticos de equipos de hace más de {args.diagnostics_days} días: {len(checks)}")
    if not learners and not rollcalls and not checks:
        return 0
    if not _confirm(args, "Se borrará todo lo listado."):
        return 1
    for learner in learners:
        db.delete(learner)
    for row in [*rollcalls, *checks]:
        db.delete(row)
    db.commit()
    print(f"Borrados {len(learners)} estudiantes, {len(rollcalls)} sesiones de asistencia "
          f"y {len(checks)} diagnósticos de equipos.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.privacy",
                                     description="Derechos sobre los datos de los estudiantes (REQ-021)")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("find", help="Buscar estudiantes por nombre")
    p.add_argument("text")
    p.set_defaults(func=cmd_find)
    p = sub.add_parser("export", help="Exportar todos los datos de un estudiante (JSON)")
    p.add_argument("learner_id")
    p.add_argument("-o", "--output", help="Archivo de salida (por defecto, la pantalla)")
    p.set_defaults(func=cmd_export)
    p = sub.add_parser("delete", help="Borrar un estudiante y toda su actividad")
    p.add_argument("learner_id")
    p.add_argument("--yes", action="store_true", help="No pedir confirmación")
    p.set_defaults(func=cmd_delete)
    p = sub.add_parser("purge", help="Borrar estudiantes inactivos y asistencias antiguas")
    p.add_argument("--days", type=int, help="Días sin actividad (por defecto DATA_RETENTION_DAYS)")
    p.add_argument("--attendance-days", type=int, help="Antigüedad de las sesiones de asistencia a borrar")
    p.add_argument("--diagnostics-days", type=int, help="Antigüedad de los diagnósticos de equipos a borrar")
    p.add_argument("--yes", action="store_true", help="Borrar de verdad (sin esto solo se listan)")
    p.set_defaults(func=cmd_purge)
    args = parser.parse_args(argv)

    from app.db import SessionLocal
    with SessionLocal() as db:
        return args.func(db, args)


if __name__ == "__main__":
    sys.exit(main())
