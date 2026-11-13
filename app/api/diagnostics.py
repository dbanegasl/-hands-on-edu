"""
Equipment test (/diagnostico): each computer reports its result, the teacher
panel summarises the lab before a class. No learner identity is stored.
"""
from __future__ import annotations

import statistics
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.panel import Scope, panel_scope
from app.db import get_db
from app.models import DeviceCheck

router = APIRouter(prefix="/api", tags=["diagnóstico de equipos"])

Label = Field(default=None, max_length=60)


class DeviceCheckIn(BaseModel):
    room: str | None = Label
    station: str | None = Label
    verdict: Literal["ok", "warn", "fail"]
    browser: str | None = Field(default=None, max_length=60)
    os: str | None = Field(default=None, max_length=40)
    camera: Literal["ok", "denied", "missing", "busy", "insecure", "error"]
    camera_res: str | None = Field(default=None, max_length=16)
    engine: Literal["browser", "server", "none"] | None = None
    device: Literal["GPU", "CPU"] | None = None
    load_ms: int | None = Field(default=None, ge=0, le=600_000)
    fps: float | None = Field(default=None, ge=0, le=240)
    hand_seen: bool | None = None
    issues: list[str] = Field(default_factory=list, max_length=20)

    def clean(self) -> dict:
        data = self.model_dump()
        for key in ("room", "station", "browser", "os", "camera_res"):
            data[key] = (data[key] or "").strip() or None
        data["issues"] = sorted({i.strip()[:40] for i in self.issues if i and i.strip()})
        return data


@router.post("/diagnostics", status_code=status.HTTP_201_CREATED,
             summary="Guardar el resultado del diagnóstico de un equipo (sin datos del estudiante)")
def report(body: DeviceCheckIn, db: Session = Depends(get_db)):
    row = DeviceCheck(**body.clean())
    db.add(row)
    db.commit()
    return {"id": row.id}


def _iso(dt: datetime) -> str:
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


def summarize(checks: list[DeviceCheck]) -> dict:
    """Latest result per station (room + station label), plus lab-wide figures."""
    by_station: dict[tuple, list[DeviceCheck]] = {}
    for c in sorted(checks, key=lambda c: (c.created_at, c.id)):
        key = (c.room or "", c.station) if c.station else ("#", c.id)   # unnamed: one row per check
        by_station.setdefault(key, []).append(c)
    stations, issues = [], {}
    for runs in by_station.values():
        last = runs[-1]
        for code in last.issues or []:
            issues[code] = issues.get(code, 0) + 1
        stations.append({
            "room": last.room, "station": last.station, "verdict": last.verdict, "browser": last.browser,
            "os": last.os, "camera": last.camera, "camera_res": last.camera_res, "engine": last.engine,
            "device": last.device, "fps": last.fps, "load_ms": last.load_ms, "hand_seen": last.hand_seen,
            "issues": last.issues or [], "created_at": _iso(last.created_at), "attempts": len(runs),
            "camera_first_try": runs[0].camera == "ok",
        })
    order = {"fail": 0, "warn": 1, "ok": 2}
    stations.sort(key=lambda s: (order[s["verdict"]], s["room"] or "", s["station"] or ""))
    fps = [s["fps"] for s in stations if s["fps"] is not None]
    return {
        "stations": stations,
        "total": len(stations),
        "checks": len(checks),
        "ok": sum(s["verdict"] == "ok" for s in stations),
        "warn": sum(s["verdict"] == "warn" for s in stations),
        "fail": sum(s["verdict"] == "fail" for s in stations),
        "camera_first_try": sum(s["camera_first_try"] for s in stations),
        "median_fps": round(statistics.median(fps), 1) if fps else None,
        "issues": dict(sorted(issues.items(), key=lambda kv: -kv[1])),
    }


@router.get("/panel/devices", summary="Equipos probados con /diagnostico en los últimos días")
def devices(days: int = Query(7, ge=1, le=90), room: str | None = Query(None, max_length=60),
            db: Session = Depends(get_db), _scope: Scope = Depends(panel_scope)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    q = select(DeviceCheck).where(DeviceCheck.created_at >= since)
    if room and room.strip():
        q = q.where(DeviceCheck.room == room.strip())
    checks = list(db.scalars(q))
    rooms = sorted({r for (r,) in db.execute(select(DeviceCheck.room).where(
        DeviceCheck.created_at >= since, DeviceCheck.room.is_not(None)).distinct())})
    return {"days": days, "room": room, "rooms": rooms, **summarize(checks)}
