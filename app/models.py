"""
ORM models.

- Learner          — a person practising (local profile now; LTI `sub` later).
- ActivitySession  — one run of a module (lesson, challenge, quiz…).
- SignAttempt      — one attempt at one sign inside a session (the unit of
                     learning analytics and mastery).
- SignTemplate     — reference recording of a sign made by a teacher. Raw
                     landmarks are stored (not features) so the feature
                     extractor can evolve without migrating data.
- Lti*             — LTI 1.3 (REQ-019): tool keys, registered platforms and
                     deployments, one-time OIDC login states, launches, the
                     launch a session belongs to, and AGS score submissions.
                     New tables only, so create_all works on existing DBs.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
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

    sessions: Mapped[list["ActivitySession"]] = relationship(
        back_populates="learner", cascade="all, delete-orphan", passive_deletes=True
    )


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
        back_populates="session", cascade="all, delete-orphan", passive_deletes=True
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


class SignModel(Base):
    """Classifier trained in the browser on the templates (REQ-010); at most one active per language."""

    __tablename__ = "sign_models"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    language: Mapped[str] = mapped_column(String(16), index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    author: Mapped[str | None] = mapped_column(String(120))
    classes: Mapped[list] = mapped_column(JSON)          # sign ids
    template_count: Mapped[int] = mapped_column(Integer, default=0)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)   # cross-validation report
    model: Mapped[dict] = mapped_column(JSON)            # weights (handsonedu.sign-model/v1)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=_now)


# ── LTI 1.3 ─────────────────────────────────────────────────────────────────


class LtiKey(Base):
    """RSA key pair of the tool: signs client assertions, deep-linking
    responses and the app's own launch tokens; published at /lti/jwks."""

    __tablename__ = "lti_keys"

    kid: Mapped[str] = mapped_column(String(64), primary_key=True)
    private_pem: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=_now)


class LtiPlatform(Base):
    """A registered LMS (e.g. one Moodle site) — one row per issuer + client_id."""

    __tablename__ = "lti_platforms"
    __table_args__ = (UniqueConstraint("issuer", "client_id"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120))
    issuer: Mapped[str] = mapped_column(String(255), index=True)
    client_id: Mapped[str] = mapped_column(String(255))
    auth_login_url: Mapped[str] = mapped_column(String(500))
    auth_token_url: Mapped[str] = mapped_column(String(500))
    jwks_url: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=_now)

    deployments: Mapped[list["LtiDeployment"]] = relationship(
        back_populates="platform", cascade="all, delete-orphan", passive_deletes=True
    )


class LtiDeployment(Base):
    __tablename__ = "lti_deployments"
    __table_args__ = (UniqueConstraint("platform_id", "deployment_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    platform_id: Mapped[str] = mapped_column(ForeignKey("lti_platforms.id", ondelete="CASCADE"), index=True)
    deployment_id: Mapped[str] = mapped_column(String(255))

    platform: Mapped[LtiPlatform] = relationship(back_populates="deployments")


class LtiLoginState(Base):
    """OIDC third-party login: one-time `state` + `nonce`, short-lived."""

    __tablename__ = "lti_login_states"

    state: Mapped[str] = mapped_column(String(64), primary_key=True)
    nonce: Mapped[str] = mapped_column(String(64))
    platform_id: Mapped[str] = mapped_column(ForeignKey("lti_platforms.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=_now)


class LtiLaunch(Base):
    """One validated launch: who, from which course/activity, with which grading endpoint."""

    __tablename__ = "lti_launches"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    platform_id: Mapped[str] = mapped_column(ForeignKey("lti_platforms.id", ondelete="CASCADE"), index=True)
    learner_id: Mapped[str] = mapped_column(ForeignKey("learners.id", ondelete="CASCADE"), index=True)
    user_sub: Mapped[str] = mapped_column(String(255))
    deployment_id: Mapped[str] = mapped_column(String(255))
    message_type: Mapped[str] = mapped_column(String(40))
    roles: Mapped[list] = mapped_column(JSON, default=list)
    is_instructor: Mapped[bool] = mapped_column(Boolean, default=False)
    context_id: Mapped[str | None] = mapped_column(String(255))
    context_title: Mapped[str | None] = mapped_column(String(255))
    resource_link_id: Mapped[str | None] = mapped_column(String(255))
    resource_link_title: Mapped[str | None] = mapped_column(String(255))
    custom: Mapped[dict | None] = mapped_column(JSON)
    ags_lineitem: Mapped[str | None] = mapped_column(String(500))
    ags_scopes: Mapped[list | None] = mapped_column(JSON)
    # Deep linking request settings (return URL + opaque data), when applicable.
    deep_linking: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=_now)


class LtiContext(Base):
    """An LMS course seen in launches, with its roster service (NRPS) endpoint."""

    __tablename__ = "lti_contexts"
    __table_args__ = (UniqueConstraint("platform_id", "context_id"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    platform_id: Mapped[str] = mapped_column(ForeignKey("lti_platforms.id", ondelete="CASCADE"), index=True)
    context_id: Mapped[str] = mapped_column(String(255))
    title: Mapped[str | None] = mapped_column(String(255))
    label: Mapped[str | None] = mapped_column(String(120))
    memberships_url: Mapped[str | None] = mapped_column(String(500))
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=_now, onupdate=_now)


class LtiSessionLink(Base):
    """Activity session started inside an LTI launch (its grade goes back to the LMS)."""

    __tablename__ = "lti_session_links"

    session_id: Mapped[str] = mapped_column(ForeignKey("activity_sessions.id", ondelete="CASCADE"), primary_key=True)
    launch_id: Mapped[str] = mapped_column(ForeignKey("lti_launches.id", ondelete="CASCADE"), index=True)


class LtiScoreSubmission(Base):
    """Audit of every AGS score publish (status: sent | skipped | failed)."""

    __tablename__ = "lti_score_submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("activity_sessions.id", ondelete="CASCADE"), index=True)
    launch_id: Mapped[str] = mapped_column(ForeignKey("lti_launches.id", ondelete="CASCADE"), index=True)
    score_given: Mapped[float] = mapped_column(Float)
    score_maximum: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(10))
    http_status: Mapped[int | None] = mapped_column(Integer)
    detail: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=_now)


# ── AttendEye (REQ-005): class attendance and participation ────────────────────

class AttendanceSession(Base):
    """One roll call or participation session of a class (names typed by the teacher, not learner profiles)."""

    __tablename__ = "attendance_sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    mode: Mapped[str] = mapped_column(String(20))            # "rollcall" | "participation"
    class_name: Mapped[str] = mapped_column(String(120), index=True)
    started_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=_now)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=_now, index=True)

    records: Mapped[list["AttendanceRecord"]] = relationship(
        back_populates="attendance", cascade="all, delete-orphan", passive_deletes=True,
        order_by="AttendanceRecord.position",
    )


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    attendance_id: Mapped[str] = mapped_column(ForeignKey("attendance_sessions.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    student_name: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(12))          # present | absent | skipped | pending
    marked_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    method: Mapped[str | None] = mapped_column(String(10))   # gesture | manual
    participations: Mapped[int] = mapped_column(Integer, default=0)

    attendance: Mapped[AttendanceSession] = relationship(back_populates="records")
