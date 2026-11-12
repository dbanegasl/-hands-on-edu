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
