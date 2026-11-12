"""
ORM models.

- Learner          — a person practising (local profile now; LTI `sub` later).
- ActivitySession  — one run of a module (lesson, challenge, quiz…).
- SignAttempt      — one attempt at one sign inside a session (the unit of
                     learning analytics and mastery).
- SignTemplate     — reference recording of a sign made by a teacher. Raw
                     landmarks are stored (not features) so the feature
                     extractor can evolve without migrating data.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from app.db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    """
    Timezone-aware UTC datetimes on every backend. SQLite drops tzinfo, which
    made API timestamps naive and browsers rendered them as local time.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None and value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value


class Learner(Base):
    __tablename__ = "learners"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    display_name: Mapped[str] = mapped_column(String(120))
    # Identity in an external system (e.g. LTI issuer + sub). Null for local profiles.
    external_id: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=_now)

    sessions: Mapped[list["ActivitySession"]] = relationship(back_populates="learner")


class ActivitySession(Base):
    __tablename__ = "activity_sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    learner_id: Mapped[str] = mapped_column(ForeignKey("learners.id", ondelete="CASCADE"), index=True)
    module: Mapped[str] = mapped_column(String(40), index=True)
    activity: Mapped[str | None] = mapped_column(String(120))
    language: Mapped[str | None] = mapped_column(String(16))
    started_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=_now)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    score: Mapped[float | None] = mapped_column(Float)
    max_score: Mapped[float | None] = mapped_column(Float)
    details: Mapped[dict | None] = mapped_column(JSON)

    learner: Mapped[Learner] = relationship(back_populates="sessions")
    attempts: Mapped[list["SignAttempt"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class SignAttempt(Base):
    __tablename__ = "sign_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("activity_sessions.id", ondelete="CASCADE"), index=True)
    learner_id: Mapped[str] = mapped_column(ForeignKey("learners.id", ondelete="CASCADE"), index=True)
    language: Mapped[str] = mapped_column(String(16))
    sign_id: Mapped[str] = mapped_column(String(64), index=True)
    correct: Mapped[bool] = mapped_column(Boolean)
    confidence: Mapped[float | None] = mapped_column(Float)
    response_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=_now)

    session: Mapped[ActivitySession] = relationship(back_populates="attempts")


class SignTemplate(Base):
    __tablename__ = "sign_templates"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    language: Mapped[str] = mapped_column(String(16), index=True)
    sign_id: Mapped[str] = mapped_column(String(64), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # "static" | "dynamic"
    hands: Mapped[int] = mapped_column(Integer, default=1)
    # [{t: ms, hands: [{handedness, landmarks: [[x,y,z]*21], world: [[x,y,z]*21] | null}]}]
    frames: Mapped[list] = mapped_column(JSON)
    author: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=_now)
