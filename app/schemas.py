"""Pydantic request/response models for the REST API."""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Vec3 = Annotated[list[float], Field(min_length=3, max_length=3)]
Landmarks21 = Annotated[list[Vec3], Field(min_length=21, max_length=21)]

MAX_TEMPLATE_FRAMES = 150  # ≈ 5 s at 30 fps


# ── Learners / sessions / attempts ────────────────────────────────────────────

class LearnerCreate(BaseModel):
    display_name: Annotated[str, Field(min_length=1, max_length=120)]


class LearnerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    display_name: str
    created_at: datetime


class LearnerCreated(LearnerOut):
    token: str          # only returned here: the browser stores it (X-Learner-Token)


class LearnerClaimed(BaseModel):
    id: str
    token: str


class SessionCreate(BaseModel):
    learner_id: str
    module: Annotated[str, Field(min_length=1, max_length=40)]
    activity: Annotated[str | None, Field(max_length=120)] = None
    language: Annotated[str | None, Field(max_length=16)] = None


class SessionFinish(BaseModel):
    score: float | None = None
    max_score: float | None = None
    details: dict | None = None


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    learner_id: str
    module: str
    activity: str | None
    language: str | None
    started_at: datetime
    ended_at: datetime | None
    score: float | None
    max_score: float | None
    details: dict | None = None


class AttemptIn(BaseModel):
    sign_id: Annotated[str, Field(min_length=1, max_length=64)]
    correct: bool
    confidence: Annotated[float | None, Field(ge=0, le=1)] = None
    response_ms: Annotated[int | None, Field(ge=0)] = None


class AttemptsBatch(BaseModel):
    attempts: Annotated[list[AttemptIn], Field(min_length=1, max_length=500)]


class SignProgress(BaseModel):
    sign_id: str
    attempts: int
    correct: int
    accuracy: float
    mastery: float
    last_attempt_at: datetime


class ProgressOut(BaseModel):
    learner_id: str
    language: str
    total_attempts: int
    signs_practiced: int
    signs_mastered: int
    signs: list[SignProgress]


# ── Sign templates ────────────────────────────────────────────────────────────

class TemplateHand(BaseModel):
    handedness: Annotated[str, Field(max_length=16)] = "Unknown"
    landmarks: Landmarks21
    world: Landmarks21 | None = None
    aspect: Annotated[float | None, Field(gt=0, le=10)] = None


class TemplateFrame(BaseModel):
    t: Annotated[int, Field(ge=0)] = 0
    aspect: Annotated[float | None, Field(gt=0, le=10)] = None
    hands: Annotated[list[TemplateHand], Field(min_length=1, max_length=2)]


class TemplateCreate(BaseModel):
    sign_id: Annotated[str, Field(min_length=1, max_length=64)]
    kind: Literal["static", "dynamic"]
    frames: Annotated[list[TemplateFrame], Field(min_length=1, max_length=MAX_TEMPLATE_FRAMES)]
    author: Annotated[str | None, Field(max_length=120)] = None


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    language: str
    sign_id: str
    kind: str
    hands: int
    frames: list[TemplateFrame]
    author: str | None
    created_at: datetime


class TemplateImport(BaseModel):
    templates: Annotated[list[TemplateCreate], Field(min_length=1, max_length=2000)]


# ── Trained sign classifier (REQ-010) ─────────────────────────────────────────

SIGN_MODEL_FORMAT = "handsonedu.sign-model/v1"
FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]
MAX_MODEL_PARAMS = 200_000


class SignModelWeights(BaseModel):
    """Network exported by HO.SignModel (app/static/js/ho-signs-model.js)."""

    model_config = ConfigDict(extra="allow")  # trained_on and future metadata are kept as-is

    format: Literal["handsonedu.sign-model/v1"]
    feature_version: Annotated[str, Field(min_length=1, max_length=40)]
    classes: Annotated[list[Annotated[str, Field(min_length=1, max_length=64)]], Field(min_length=2, max_length=500)]
    hidden: Annotated[int, Field(ge=2, le=256)]
    inputs: Annotated[int, Field(ge=1, le=512)]
    mean: list[FiniteFloat]
    std: list[FiniteFloat]
    W1: list[FiniteFloat]
    b1: list[FiniteFloat]
    W2: list[FiniteFloat]
    b2: list[FiniteFloat]
    weight: Annotated[float, Field(ge=0, le=1)] = 0.5


class SignModelIn(BaseModel):
    model: SignModelWeights
    metrics: dict = Field(default_factory=dict)
    author: Annotated[str | None, Field(max_length=120)] = None
    activate: bool = True


class SignModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    language: str
    active: bool
    author: str | None
    classes: list[str]
    template_count: int
    metrics: dict
    created_at: datetime


# ── LTI 1.3 ─────────────────────────────────────────────────────────────────

HttpUrl = Annotated[str, Field(min_length=8, max_length=500, pattern=r"^https?://\S+$")]


class LtiPlatformIn(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    issuer: Annotated[str, Field(min_length=1, max_length=255)]
    client_id: Annotated[str, Field(min_length=1, max_length=255)]
    auth_login_url: HttpUrl
    auth_token_url: HttpUrl
    jwks_url: HttpUrl
    deployment_ids: Annotated[list[Annotated[str, Field(min_length=1, max_length=255)]], Field(max_length=50)] = []


class LtiPlatformOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    issuer: str
    client_id: str
    auth_login_url: str
    auth_token_url: str
    jwks_url: str
    deployment_ids: list[str]
    created_at: datetime


class LtiDeploymentIn(BaseModel):
    deployment_id: Annotated[str, Field(min_length=1, max_length=255)]


class DeepLinkIn(BaseModel):
    language: Annotated[str, Field(min_length=2, max_length=16)] = "lsec"
    units: Annotated[list[str], Field(max_length=20)] = []
    course: bool = False
    graded: bool = True


class DeepLinkOut(BaseModel):
    return_url: str
    jwt: str


class GradeSyncOut(BaseModel):
    status: str  # none | sent | skipped | failed | not_graded
    score_given: float | None = None
    score_maximum: float | None = None
    detail: str | None = None


# ── AttendEye (REQ-005) ──────────────────────────────────────────────────────

AttendanceStatus = Literal["present", "absent", "skipped", "pending"]


class AttendanceRecordIn(BaseModel):
    student_name: Annotated[str, Field(min_length=1, max_length=120)]
    status: AttendanceStatus = "pending"
    marked_at: datetime | None = None
    method: Literal["gesture", "manual"] | None = None
    participations: Annotated[int, Field(ge=0, le=10000)] = 0


class AttendanceIn(BaseModel):
    mode: Literal["rollcall", "participation"]
    class_name: Annotated[str, Field(min_length=1, max_length=120)]
    started_at: datetime | None = None
    ended_at: datetime | None = None
    records: Annotated[list[AttendanceRecordIn], Field(min_length=1, max_length=300)]


class AttendanceRecordOut(AttendanceRecordIn):
    model_config = ConfigDict(from_attributes=True)


class AttendanceSummary(BaseModel):
    id: str
    mode: str
    class_name: str
    started_at: datetime
    ended_at: datetime | None
    total: int
    present: int
    absent: int
    skipped: int
    rate: float | None          # present / (present + absent + skipped); None in participation mode
    participations: int
    duration_min: float | None


class AttendanceOut(AttendanceSummary):
    records: list[AttendanceRecordOut]


class AttendanceClass(BaseModel):
    class_name: str
    sessions: int
    last_at: datetime
    roster: list[str]           # names of the most recent session, in order
