"""
Teacher panel (REQ-007): progress of the learners of a course in the Aula de Señas.

Scope depends on who asks:
- an LTI **instructor** launch token → that LMS course: learners who launched
  from it plus its roster (NRPS), only sessions started from that course;
- the admin token (`X-Admin-Token`, or nothing when ADMIN_TOKEN is unset) →
  every learner of this installation (local use without an LMS).
Sessions started by instructors never count in the statistics.
"""
from __future__ import annotations

import csv
import io
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import lti_context, require_admin
from app.api.learning import MASTERED_THRESHOLD, compute_mastery
from app.db import get_db
from app.integrations.lti import services as lti_services
from app.models import (
    ActivitySession,
    AttendanceSession,
    Learner,
    LtiContext,
    LtiLaunch,
    LtiPlatform,
    LtiScoreSubmission,
    LtiSessionLink,
    SignAttempt,
)
from app.signs.catalog import CatalogError, get_catalog

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/panel", tags=["panel docente"])

MODULE = "aula_senas"
QUIZ_PREFIX = "quiz:"
PASS_PCT = 70.0
PRACTICE_CAP = timedelta(hours=1)  # a session left open overnight counts as 1 h at most
WEEKS = 8
# Gesture modules saved per learner (REQ-005), summarised in the installation-wide view.
OTHER_MODULES = {"gestiedu": "GestiEdu", "motivasign": "MotivaSign"}
OTHER_ACTIVITIES = {"quiz": "Cuestionario", "challenge": "Desafío", "learn": "Práctica libre"}


# ── Scope ────────────────────────────────────────────────────────────────────

@dataclass
class Scope:
    kind: str                      # "course" | "all"
    title: str
    platform: LtiPlatform | None = None
    context_id: str | None = None
    context: LtiContext | None = None


def panel_scope(
    lti: dict | None = Depends(lti_context),
    x_admin_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Scope:
    if lti is not None:
        if not lti.get("instructor"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "El panel es solo para docentes")
        launch = db.get(LtiLaunch, lti.get("lti_launch"))
        if launch is None or not launch.context_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "Este lanzamiento no pertenece a un curso")
        ctx = db.scalars(select(LtiContext).where(
            LtiContext.platform_id == launch.platform_id, LtiContext.context_id == launch.context_id)).first()
        return Scope(kind="course", title=(ctx and ctx.title) or launch.context_title or "Curso",
                     platform=db.get(LtiPlatform, launch.platform_id), context_id=launch.context_id, context=ctx)
    require_admin(x_admin_token)
    return Scope(kind="all", title="Todos los estudiantes")


def _sessions_query(scope: Scope, language: str):
    q = (
        select(ActivitySession)
        .where(ActivitySession.module == MODULE, ActivitySession.language == language)
        .outerjoin(LtiSessionLink, LtiSessionLink.session_id == ActivitySession.id)
        .outerjoin(LtiLaunch, LtiLaunch.id == LtiSessionLink.launch_id)
        .where(or_(LtiLaunch.id.is_(None), LtiLaunch.is_instructor.is_(False)))
    )
    if scope.kind == "course":
        q = q.where(LtiLaunch.platform_id == scope.platform.id, LtiLaunch.context_id == scope.context_id)
    return q


def _course_learner_ids(db: Session, scope: Scope) -> set[str]:
    return set(db.scalars(select(LtiLaunch.learner_id).where(
        LtiLaunch.platform_id == scope.platform.id, LtiLaunch.context_id == scope.context_id,
        LtiLaunch.is_instructor.is_(False))).all())


def _catalog(language: str) -> dict:
    try:
        return get_catalog(language)
    except (CatalogError, FileNotFoundError, KeyError) as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Lengua de señas no disponible: {language}") from exc


# ── Aggregation (pure helpers) ───────────────────────────────────────────────

def _pct(sess: ActivitySession) -> float | None:
    if sess.ended_at is None or not sess.max_score:
        return None
    return round(100.0 * max(0.0, min(1.0, (sess.score or 0) / sess.max_score)), 1)


def _duration(sess: ActivitySession) -> timedelta:
    if sess.ended_at is None:
        return timedelta(0)
    return max(timedelta(0), min(sess.ended_at - sess.started_at, PRACTICE_CAP))


def _last_seen(sess: ActivitySession) -> datetime:
    return sess.ended_at or sess.started_at


def _week_start(dt: datetime) -> datetime:
    d = dt.astimezone(timezone.utc)
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc) - timedelta(days=d.weekday())


def _latest_submissions(db: Session, session_ids: list[str]) -> dict[str, LtiScoreSubmission]:
    latest: dict[str, LtiScoreSubmission] = {}
    if not session_ids:
        return latest
    rows = db.scalars(select(LtiScoreSubmission)
                      .where(LtiScoreSubmission.session_id.in_(session_ids))
                      .order_by(LtiScoreSubmission.created_at, LtiScoreSubmission.id)).all()
    for sub in rows:
        latest[sub.session_id] = sub
    return latest


def _sign_mastery(attempts: list[SignAttempt]) -> dict[str, dict]:
    by_sign: dict[str, list[SignAttempt]] = {}
    for a in attempts:
        by_sign.setdefault(a.sign_id, []).append(a)
    out = {}
    for sign_id, items in by_sign.items():
        items.sort(key=lambda a: (a.created_at, a.id))
        outcomes = [a.correct for a in items]
        out[sign_id] = {
            "attempts": len(outcomes),
            "accuracy": round(sum(outcomes) / len(outcomes), 4),
            "mastery": compute_mastery(outcomes),
            "last_attempt_at": items[-1].created_at,
        }
    return out


def _learner_summary(sessions: list[ActivitySession], attempts: list[SignAttempt],
                     latest: dict[str, LtiScoreSubmission], unit_ids: list[str]) -> dict:
    best: dict[str, float] = {}
    quizzes = 0
    for s in sessions:
        pct = _pct(s)
        if pct is not None and (s.activity or "").startswith(QUIZ_PREFIX):
            quizzes += 1
            unit = s.activity[len(QUIZ_PREFIX):]
            best[unit] = max(best.get(unit, 0.0), pct)
    signs = _sign_mastery(attempts)
    masteries = [v["mastery"] for v in signs.values()]
    grades = {"sent": 0, "skipped": 0, "failed": 0}
    for s in sessions:
        sub = latest.get(s.id)
        if sub is not None:
            grades[sub.status] = grades.get(sub.status, 0) + 1
    return {
        "has_activity": bool(sessions),
        "last_activity": max((_last_seen(s) for s in sessions), default=None),
        "sessions": len(sessions),
        "quizzes": quizzes,
        "practice_minutes": round(sum((_duration(s) for s in sessions), timedelta(0)).total_seconds() / 60),
        "units": {u: {"best": best[u], "passed": best[u] >= PASS_PCT} for u in unit_ids if u in best},
        "units_passed": sum(1 for u in unit_ids if best.get(u, 0.0) >= PASS_PCT),
        "signs_practiced": len(signs),
        "signs_mastered": sum(1 for m in masteries if m >= MASTERED_THRESHOLD),
        "mastery_avg": round(sum(masteries) / len(masteries), 4) if masteries else None,
        "grades": grades,
    }


def _weekly(sessions: list[ActivitySession], now: datetime) -> list[dict]:
    first = _week_start(now) - timedelta(weeks=WEEKS - 1)
    buckets = {first + timedelta(weeks=i): {"learners": set(), "sessions": 0, "quiz": []} for i in range(WEEKS)}
    for s in sessions:
        b = buckets.get(_week_start(s.started_at))
        if b is None:
            continue
        b["sessions"] += 1
        b["learners"].add(s.learner_id)
        pct = _pct(s)
        if pct is not None and (s.activity or "").startswith(QUIZ_PREFIX):
            b["quiz"].append(pct)
    return [{"week_start": wk.date().isoformat(), "active_learners": len(b["learners"]), "sessions": b["sessions"],
             "quiz_avg": round(sum(b["quiz"]) / len(b["quiz"]), 1) if b["quiz"] else None}
            for wk, b in sorted(buckets.items())]


def _sign_stats(attempts: list[SignAttempt], glosses: dict[str, str]) -> list[dict]:
    agg: dict[str, dict] = {}
    for a in attempts:
        g = agg.setdefault(a.sign_id, {"attempts": 0, "correct": 0, "ms": [], "learners": set()})
        g["attempts"] += 1
        g["correct"] += int(a.correct)
        g["learners"].add(a.learner_id)
        if a.correct and a.response_ms:
            g["ms"].append(a.response_ms)
    rows = [{
        "sign_id": sid, "gloss": glosses.get(sid, sid), "attempts": g["attempts"],
        "accuracy": round(g["correct"] / g["attempts"], 4), "learners": len(g["learners"]),
        "avg_response_ms": round(sum(g["ms"]) / len(g["ms"])) if g["ms"] else None,
    } for sid, g in agg.items()]
    rows.sort(key=lambda r: (r["accuracy"], -r["attempts"]))
    return rows


# ── Data loading ─────────────────────────────────────────────────────────────

def _roster(db: Session, scope: Scope) -> dict:
    if scope.kind != "course":
        return {"status": "n/a", "members": []}
    url = scope.context.memberships_url if scope.context else None
    if not url:
        return {"status": "unavailable", "members": [],
                "detail": "La plataforma no ofrece la lista del curso (activa «Names and Role Provisioning» en la herramienta)"}
    try:
        return {"status": "ok", "members": lti_services.fetch_roster(db, scope.platform, url)}
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        log.warning("NRPS roster failed for %s: %s", url, exc)
        return {"status": "error", "members": [], "detail": f"No se pudo leer la lista del curso: {exc}"}


def _load(db: Session, scope: Scope, language: str):
    sessions = list(db.scalars(_sessions_query(scope, language)).all())
    ids = [s.id for s in sessions]
    attempts = list(db.scalars(select(SignAttempt).where(SignAttempt.session_id.in_(ids)))) if ids else []
    return sessions, attempts, _latest_submissions(db, ids)


def _rows(db: Session, scope: Scope, language: str, catalog: dict):
    """One row per learner in scope (roster members without activity included)."""
    unit_ids = [u["id"] for u in catalog.get("units", [])]
    sessions, attempts, latest = _load(db, scope, language)
    roster = _roster(db, scope)

    learner_ids = {s.learner_id for s in sessions}
    other_last: dict[str, tuple[int, datetime]] = {}
    if scope.kind == "all":  # learners who only used GestiEdu / MotivaSign are listed too
        for lid, n, last in db.execute(
                select(ActivitySession.learner_id, func.count(ActivitySession.id), func.max(ActivitySession.ended_at))
                .where(ActivitySession.module.in_(OTHER_MODULES), ActivitySession.ended_at.is_not(None))
                .group_by(ActivitySession.learner_id)).all():
            other_last[lid] = (n, last)
        learner_ids |= set(other_last)
    by_external: dict[str, dict] = {}
    if scope.kind == "course":
        learner_ids |= _course_learner_ids(db, scope)
        prefix = f"lti:{scope.platform.id}:"
        for m in roster["members"]:
            if m["is_learner"]:
                by_external[prefix + m["user_id"]] = m
        if by_external:
            learner_ids |= set(db.scalars(select(Learner.id).where(Learner.external_id.in_(by_external))).all())
    learners = {lr.id: lr for lr in db.scalars(select(Learner).where(Learner.id.in_(learner_ids)))} if learner_ids else {}

    s_by, a_by = {}, {}
    for s in sessions:
        s_by.setdefault(s.learner_id, []).append(s)
    for a in attempts:
        a_by.setdefault(a.learner_id, []).append(a)

    rows, seen_external = [], set()
    for lid, lr in learners.items():
        member = by_external.get(lr.external_id or "")
        if scope.kind == "course" and roster["status"] == "ok" and member is None and lid not in s_by:
            continue  # launched once as a learner but no longer enrolled, and never practised here
        seen_external.add(lr.external_id)
        rows.append({"id": lid, "name": (member or {}).get("name") or lr.display_name,
                     "user_id": (member or {}).get("user_id") or _lms_user(lr.external_id),
                     "in_roster": member is not None,
                     **_with_other(_learner_summary(s_by.get(lid, []), a_by.get(lid, []), latest, unit_ids),
                                   other_last.get(lid))})
    for ext, m in by_external.items():
        if ext not in seen_external:
            rows.append({"id": None, "name": m["name"], "user_id": m["user_id"], "in_roster": True,
                         **_with_other(_learner_summary([], [], {}, unit_ids), None)})
    rows.sort(key=lambda r: r["name"].lower())
    return rows, sessions, attempts, roster


def _with_other(summary: dict, other: tuple[int, datetime] | None) -> dict:
    """Add GestiEdu/MotivaSign activity (installation view) to a learner row."""
    summary["other_sessions"] = other[0] if other else 0
    if other and (summary["last_activity"] is None or other[1] > summary["last_activity"]):
        summary["last_activity"] = other[1]
    return summary


def _lms_user(external_id: str | None) -> str | None:
    return external_id.split(":", 2)[2] if external_id and external_id.startswith("lti:") else None


def _scope_out(scope: Scope) -> dict:
    return {"kind": scope.kind, "title": scope.title,
            "platform": scope.platform.name if scope.platform else None,
            "label": scope.context.label if scope.context else None}


def _module_summaries(db: Session, now: datetime) -> dict:
    from app.api.attendance import summarize  # local import: attendance depends on nothing here

    week_ago = now - timedelta(days=7)
    out: dict[str, dict] = {}
    for module, name in OTHER_MODULES.items():
        sessions = db.scalars(select(ActivitySession).where(
            ActivitySession.module == module, ActivitySession.ended_at.is_not(None))).all()
        scored = [p for s in sessions if s.activity != "learn" and (p := _pct(s)) is not None]
        out[module] = {
            "name": name, "sessions": len(sessions), "learners": len({s.learner_id for s in sessions}),
            "active_7d": len({s.learner_id for s in sessions if s.ended_at >= week_ago}),
            "scored": len(scored), "avg_pct": round(sum(scored) / len(scored), 1) if scored else None,
            "last_at": max((s.ended_at for s in sessions), default=None),
        }
    att = [summarize(a) for a in db.scalars(select(AttendanceSession)
                                            .options(selectinload(AttendanceSession.records))
                                            .order_by(AttendanceSession.started_at.desc())).all()]
    rollcalls = [a for a in att if a["mode"] == "rollcall"]
    rates = [a["rate"] for a in rollcalls if a["rate"] is not None]
    last = rollcalls[0] if rollcalls else None
    out["attendeye"] = {
        "name": "AttendEye", "rollcalls": len(rollcalls),
        "participation_sessions": sum(1 for a in att if a["mode"] == "participation"),
        "participations": sum(a["participations"] for a in att),
        "classes": len({a["class_name"] for a in att}),
        "avg_rate": round(sum(rates) / len(rates), 4) if rates else None,
        "last": {"class_name": last["class_name"], "started_at": last["started_at"], "rate": last["rate"],
                 "present": last["present"], "total": last["total"]} if last else None,
    }
    return out


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/overview", summary="Resumen del curso: estudiantes, unidades, semanas y señas difíciles")
def overview(language: str = Query("lsec"), scope: Scope = Depends(panel_scope), db: Session = Depends(get_db)):
    catalog = _catalog(language)
    rows, sessions, attempts, roster = _rows(db, scope, language, catalog)
    glosses = {s["id"]: s.get("gloss", s["id"]) for s in catalog.get("signs", [])}
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    units = []
    for u in catalog.get("units", []):
        bests = [r["units"][u["id"]]["best"] for r in rows if u["id"] in r["units"]]
        units.append({"id": u["id"], "title": u.get("title", u["id"]), "signs": len(u.get("signs", [])),
                      "attempted": len(bests), "passed": sum(1 for b in bests if b >= PASS_PCT),
                      "best_avg": round(sum(bests) / len(bests), 1) if bests else None})
    all_bests = [v["best"] for r in rows for v in r["units"].values()]
    summary = {
        "learners": len(rows),
        "with_activity": sum(1 for r in rows if r["has_activity"]),
        "active_7d": sum(1 for r in rows if r["last_activity"] and r["last_activity"] >= week_ago),
        "quizzes": sum(r["quizzes"] for r in rows),
        "best_avg": round(sum(all_bests) / len(all_bests), 1) if all_bests else None,
        "practice_minutes": sum(r["practice_minutes"] for r in rows),
        "grades_failed": sum(r["grades"]["failed"] for r in rows),
    }
    return {
        "scope": _scope_out(scope), "language": language, "generated_at": now, "pass_pct": PASS_PCT,
        "roster": {"status": roster["status"], "detail": roster.get("detail"),
                   "members": sum(1 for m in roster["members"] if m["is_learner"])},
        "summary": summary, "units": units, "learners": rows,
        "weekly": _weekly(sessions, now), "signs": _sign_stats(attempts, glosses),
        "modules": _module_summaries(db, now) if scope.kind == "all" else None,
    }


def _learner_in_scope(db: Session, scope: Scope, learner_id: str) -> Learner:
    learner = db.get(Learner, learner_id)
    if learner is None or (scope.kind == "course" and learner_id not in _course_learner_ids(db, scope)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Estudiante no encontrado en este curso")
    return learner


def _activity_label(activity: str | None, unit_titles: dict[str, str]) -> str:
    kind, _, arg = (activity or "").partition(":")
    names = {"lesson": "Lección", "quiz": "Evaluación", "review": "Repaso", "spell": "Deletreo"}
    label = names.get(kind, activity or "Actividad")
    if kind in ("lesson", "quiz") and arg:
        return f"{label} · {unit_titles.get(arg, arg)}"
    return f"{label} · {arg}" if arg else label


@router.get("/learners/{learner_id}", summary="Detalle de un estudiante: dominio por seña y sesiones")
def learner_detail(learner_id: str, language: str = Query("lsec"), scope: Scope = Depends(panel_scope),
                   db: Session = Depends(get_db)):
    catalog = _catalog(language)
    learner = _learner_in_scope(db, scope, learner_id)
    q = _sessions_query(scope, language).where(ActivitySession.learner_id == learner_id)
    sessions = list(db.scalars(q).all())
    ids = [s.id for s in sessions]
    attempts = list(db.scalars(select(SignAttempt).where(SignAttempt.session_id.in_(ids)))) if ids else []
    latest = _latest_submissions(db, ids)
    unit_titles = {u["id"]: u.get("title", u["id"]) for u in catalog.get("units", [])}
    mastery = _sign_mastery(attempts)
    signs_by_id = {s["id"]: s for s in catalog.get("signs", [])}

    units = []
    for u in catalog.get("units", []):
        units.append({"id": u["id"], "title": u.get("title", u["id"]), "signs": [
            {"sign_id": sid, "gloss": signs_by_id.get(sid, {}).get("gloss", sid), **mastery.get(sid, {})}
            for sid in u.get("signs", [])]})
    sessions.sort(key=lambda s: s.started_at, reverse=True)
    other = []
    if scope.kind == "all":
        other = db.scalars(select(ActivitySession).where(
            ActivitySession.learner_id == learner_id, ActivitySession.module.in_(OTHER_MODULES))
            .order_by(ActivitySession.started_at.desc()).limit(50)).all()
    return {
        "scope": _scope_out(scope),
        "learner": {"id": learner.id, "name": learner.display_name, "user_id": _lms_user(learner.external_id)},
        "summary": _learner_summary(sessions, attempts, latest, list(unit_titles)),
        "units": units,
        "sessions": [{
            "id": s.id, "activity": s.activity, "label": _activity_label(s.activity, unit_titles),
            "started_at": s.started_at, "ended_at": s.ended_at, "minutes": round(_duration(s).total_seconds() / 60, 1),
            "score": s.score, "max_score": s.max_score, "pct": _pct(s),
            "grade": ({"status": latest[s.id].status, "score_given": latest[s.id].score_given,
                       "detail": latest[s.id].detail} if s.id in latest else None),
        } for s in sessions[:200]],
        "other_sessions": [{
            "id": s.id, "module": OTHER_MODULES[s.module],
            "label": OTHER_ACTIVITIES.get(s.activity or "", s.activity or "Actividad"),
            "started_at": s.started_at, "ended_at": s.ended_at, "score": s.score, "max_score": s.max_score,
            "pct": _pct(s),
        } for s in other],
    }


@router.post("/sessions/{session_id}/grade/retry", summary="Reintentar el envío de una nota fallida")
def retry_grade(session_id: str, scope: Scope = Depends(panel_scope), db: Session = Depends(get_db)):
    sess = db.get(ActivitySession, session_id)
    if sess is None or db.scalars(_sessions_query(scope, sess.language or "").where(
            ActivitySession.id == session_id)).first() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sesión no encontrada en este curso")
    latest = _latest_submissions(db, [session_id]).get(session_id)
    if latest is None or latest.status != "failed":
        raise HTTPException(status.HTTP_409_CONFLICT, "Solo se reintentan envíos fallidos")
    sub = lti_services.publish_session_score(db, session_id)
    if sub is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Esta sesión ya no se puede calificar")
    return {"status": sub.status, "score_given": sub.score_given, "score_maximum": sub.score_maximum,
            "detail": sub.detail}


@router.get("/export.csv", summary="Exportar el progreso del curso (CSV)")
def export_csv(language: str = Query("lsec"),
               tz: int = Query(0, ge=-840, le=840, description="Minutos al este de UTC (Ecuador: -300)"),
               scope: Scope = Depends(panel_scope), db: Session = Depends(get_db)):
    local = timezone(timedelta(minutes=tz))
    catalog = _catalog(language)
    rows, *_ = _rows(db, scope, language, catalog)
    units = catalog.get("units", [])
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Estudiante", "Usuario LMS", "Última actividad", "Sesiones", "Minutos de práctica",
                "Unidades aprobadas", "Señas dominadas", "Dominio medio (%)", "Notas no enviadas"]
               + [f"{u['id']} · {u.get('title', u['id'])} (mejor %)" for u in units])
    for r in rows:
        w.writerow([
            r["name"], r["user_id"] or "",
            r["last_activity"].astimezone(local).strftime("%Y-%m-%d %H:%M") if r["last_activity"] else "",
            r["sessions"], r["practice_minutes"], r["units_passed"], r["signs_mastered"],
            "" if r["mastery_avg"] is None else round(100 * r["mastery_avg"]), r["grades"]["failed"],
        ] + ["" if u["id"] not in r["units"] else f"{r['units'][u['id']]['best']:g}" for u in units])
    stamp = datetime.now(local).strftime("%Y-%m-%d")
    return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="progreso-{language}-{stamp}.csv"'})
