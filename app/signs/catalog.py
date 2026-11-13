"""
Sign-language content catalogs.

Each language lives in `app/content/<code>/catalog.json` (content as data, so
teachers/linguists can review it without touching code). The schema is
documented in `docs/sign-engine.md`.
"""
import json
from datetime import date
from functools import lru_cache
from pathlib import Path

from app.config import settings

REQUIRED_SIGN_KEYS = {"id", "gloss", "category", "kind"}

# Handshape spec vocabulary understood by app/static/js/ho-signs.js (scoreSpec).
FINGER_VALUES = {"extended", "bent", "curled", "not_extended", "any"}
THUMB_VALUES = {"extended", "side", "across", "folded", "any"}
PALM_VALUES = {"forward", "back", "side", "up", "down", "any"}
FINGERS_DIR_VALUES = {"up", "down", "side", "forward", "any"}
POINT_NAMES = {
    "wrist", "thumb_tip", "thumb_ip", "thumb_mcp", "index_mcp", "index_pip", "index_tip",
    "middle_mcp", "middle_pip", "middle_tip", "ring_mcp", "ring_pip", "ring_tip",
    "pinky_mcp", "pinky_pip", "pinky_tip",
}
DIGITS = {"thumb", "index", "middle", "ring", "pinky"}


class CatalogError(ValueError):
    pass


MEDIA_STR_KEYS = {"video", "poster", "avatar", "validated_by", "validated_at"}


def _validate_media(code: str, sign_id: str, media) -> None:
    """Reference video metadata. `ai_generated` is mandatory so the UI can always
    disclose AI-generated content; `validated_at` needs `validated_by`."""
    where = f"{code}: sign {sign_id!r} media"
    if not isinstance(media, dict):
        raise CatalogError(f"{where} must be an object")
    unknown = set(media) - MEDIA_STR_KEYS - {"ai_generated"}
    if unknown:
        raise CatalogError(f"{where}: unknown keys {sorted(unknown)}")
    for key in MEDIA_STR_KEYS & set(media):
        if not isinstance(media[key], str) or not media[key].strip():
            raise CatalogError(f"{where}: {key} must be a non-empty string")
    if "video" not in media:
        raise CatalogError(f"{where}: video is required")
    if not isinstance(media.get("ai_generated"), bool):
        raise CatalogError(f"{where}: ai_generated (true/false) is required")
    if "validated_at" in media:
        if "validated_by" not in media:
            raise CatalogError(f"{where}: validated_at requires validated_by")
        try:
            date.fromisoformat(media["validated_at"])
        except ValueError as exc:
            raise CatalogError(f"{where}: validated_at must be YYYY-MM-DD") from exc


def validate_handshape(sign_id: str, spec: dict) -> None:
    """Reject handshape specs the JS engine would silently ignore."""
    for key, value in spec.items():
        if key in ("index", "middle", "ring", "pinky"):
            ok = value in FINGER_VALUES
        elif key == "thumb":
            ok = value in THUMB_VALUES
        elif key == "palm":
            ok = value in PALM_VALUES
        elif key == "fingers":
            ok = value in FINGERS_DIR_VALUES
        elif key in ("touch", "together", "apart"):
            ok = isinstance(value, list) and all(
                isinstance(p, list) and len(p) == 2 and set(p) <= POINT_NAMES for p in value
            )
        elif key == "crossed":
            ok = isinstance(value, list) and len(value) == 2 and set(value) <= DIGITS
        else:
            raise CatalogError(f"{sign_id}: unknown handshape key {key!r}")
        if not ok:
            raise CatalogError(f"{sign_id}: invalid handshape value {key}={value!r}")


def _validate_review_fields(code: str, sign: dict) -> None:
    """Interpreter review (REQ-023): `validated` is a bool; `validated_by` and
    `validated_at` (YYYY-MM-DD) go together and only on a validated sign;
    `assess: false` keeps a sign out of unit evaluations."""
    where = f"{code}: sign {sign['id']!r}"
    if not isinstance(sign.get("validated", False), bool):
        raise CatalogError(f"{where}: validated must be true or false")
    if not isinstance(sign.get("assess", True), bool):
        raise CatalogError(f"{where}: assess must be true or false")
    by, at = sign.get("validated_by"), sign.get("validated_at")
    if (by is None) != (at is None):
        raise CatalogError(f"{where}: validated_by and validated_at go together")
    if by is not None:
        if not sign.get("validated"):
            raise CatalogError(f"{where}: validated_by on a sign that is not validated")
        if not isinstance(by, str) or not by.strip():
            raise CatalogError(f"{where}: validated_by must be a name")
        try:
            date.fromisoformat(at)
        except (TypeError, ValueError) as exc:
            raise CatalogError(f"{where}: validated_at must be YYYY-MM-DD") from exc


def _validate(code: str, data: dict) -> dict:
    meta = data.get("language") or {}
    if meta.get("code") != code:
        raise CatalogError(f"{code}: language.code mismatch ({meta.get('code')!r})")
    seen = set()
    categories = {c["id"] for c in data.get("categories", [])}
    for sign in data.get("signs", []):
        missing = REQUIRED_SIGN_KEYS - sign.keys()
        if missing:
            raise CatalogError(f"{code}: sign {sign.get('id')!r} missing {sorted(missing)}")
        if sign["id"] in seen:
            raise CatalogError(f"{code}: duplicate sign id {sign['id']!r}")
        if sign["category"] not in categories:
            raise CatalogError(f"{code}: sign {sign['id']!r} has unknown category {sign['category']!r}")
        if sign["kind"] not in ("static", "dynamic"):
            raise CatalogError(f"{code}: sign {sign['id']!r} has invalid kind {sign['kind']!r}")
        if "handshape" in sign:
            if sign["kind"] != "static":
                raise CatalogError(f"{code}: handshape specs apply to static signs only ({sign['id']!r})")
            validate_handshape(sign["id"], sign["handshape"])
        _validate_review_fields(code, sign)
        seen.add(sign["id"])
    for sign in data.get("signs", []):
        for other in sign.get("confusable", []):
            if other not in seen:
                raise CatalogError(f"{code}: {sign['id']!r} lists unknown confusable {other!r}")
    for sign in data.get("signs", []):
        if sign.get("media") is not None:
            _validate_media(code, sign["id"], sign["media"])
    words = data.get("spelling_words", [])
    if not isinstance(words, list) or not all(isinstance(w, str) and w.strip() for w in words):
        raise CatalogError(f"{code}: spelling_words must be a list of non-empty strings")
    for unit in data.get("units", []):
        unknown = set(unit.get("signs", [])) - seen
        if unknown:
            raise CatalogError(f"{code}: unit {unit.get('id')!r} references unknown signs {sorted(unknown)}")
    return data


@lru_cache(maxsize=None)
def _load(content_dir: Path, code: str) -> dict:
    path = content_dir / code / "catalog.json"
    if not path.is_file():
        raise KeyError(code)
    with path.open(encoding="utf-8") as fh:
        return _validate(code, json.load(fh))


def available_languages(content_dir: Path | None = None) -> list[dict]:
    root = content_dir or settings.content_dir
    out = []
    for path in sorted(root.glob("*/catalog.json")):
        data = _load(root, path.parent.name)
        meta = dict(data["language"])
        meta["sign_count"] = len(data.get("signs", []))
        out.append(meta)
    return out


def get_catalog(code: str, content_dir: Path | None = None) -> dict:
    """Return the catalog for `code`; raises KeyError if it does not exist."""
    return _load(content_dir or settings.content_dir, code)


def sign_ids(code: str) -> set[str]:
    return {s["id"] for s in get_catalog(code).get("signs", [])}
