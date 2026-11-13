#!/usr/bin/env python3
"""
Apply an interpreter review (/validacion → «Para el catálogo (JSON)») to a
sign catalog (REQ-023). Stdlib only.

For the latest review of each sign:
- content right (and decision ≠ corregir) → `validated: true`, `validated_by`,
  `validated_at`; content wrong → `validated: false` (by/at removed);
- decision `retirar`, or accepted done wrong without the interpreter overriding
  to `ok` → `assess: false` (out of unit evaluations, still in lessons);
  otherwise `assess` is removed (default: assessed).

Without --write it only prints what would change. Afterwards regenerate the
video prompt document (`python3 scripts/gen_video_prompts.py`) and open a PR.

    python3 scripts/apply-sign-reviews.py revision-senas-lsec-2026-11-20.json
    python3 scripts/apply-sign-reviews.py revision.json --write
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def latest_reviews(reviews: list[dict]) -> dict[str, dict]:
    """Latest review per sign (by created_at, then id)."""
    out: dict[str, dict] = {}
    for r in sorted(reviews, key=lambda r: (str(r.get("created_at") or ""), r.get("id") or 0)):
        out[r["sign_id"]] = r
    return out


def target_flags(review: dict) -> dict:
    """What the catalog entry should say after this review."""
    validated = review.get("content_ok") is True and review.get("decision") != "corregir"
    wrong_accepted = (review.get("bad_ok") or 0) > 0 and review.get("decision") != "ok"
    flags = {"validated": validated, "assess": not (review.get("decision") == "retirar" or wrong_accepted)}
    if validated:
        flags["validated_by"] = str(review.get("reviewer") or "").strip()
        flags["validated_at"] = str(review.get("created_at") or "")[:10]
    return flags


def apply(catalog: dict, reviews: list[dict]) -> list[str]:
    """Update `catalog` in place; return one human line per change."""
    by_id = {s["id"]: s for s in catalog.get("signs", [])}
    changes: list[str] = []
    for sign_id, review in latest_reviews(reviews).items():
        sign = by_id.get(sign_id)
        if sign is None:
            changes.append(f"⚠ {sign_id}: no está en el catálogo (se ignora)")
            continue
        flags = target_flags(review)
        before = {k: sign.get(k) for k in ("validated", "validated_by", "validated_at", "assess")}
        sign["validated"] = flags["validated"]
        if flags["validated"]:
            sign["validated_by"] = flags["validated_by"]
            sign["validated_at"] = flags["validated_at"]
        else:
            sign.pop("validated_by", None)
            sign.pop("validated_at", None)
        if flags["assess"]:
            sign.pop("assess", None)
        else:
            sign["assess"] = False
        after = {k: sign.get(k) for k in before}
        if after != before:
            parts = []
            if before["validated"] != after["validated"] or before["validated_by"] != after["validated_by"]:
                parts.append("validada por " + after["validated_by"] if after["validated"] else "NO validada")
            if (before["assess"] is False) != (after["assess"] is False):
                parts.append("fuera de la evaluación" if after["assess"] is False else "vuelve a la evaluación")
            changes.append(f"{sign_id} ({sign.get('gloss', sign_id)}): " + (", ".join(parts) or "fecha actualizada"))
    return changes


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("review", type=Path, help="JSON exportado desde /validacion")
    p.add_argument("--catalog", type=Path, help="catálogo (por defecto app/content/<lengua>/catalog.json)")
    p.add_argument("--write", action="store_true", help="guardar los cambios en el catálogo")
    args = p.parse_args(argv)

    data = json.loads(args.review.read_text(encoding="utf-8"))
    reviews = data["reviews"] if isinstance(data, dict) else data
    language = data.get("language", "lsec") if isinstance(data, dict) else "lsec"
    path = args.catalog or ROOT / "app" / "content" / language / "catalog.json"
    catalog = json.loads(path.read_text(encoding="utf-8"))
    if catalog.get("language", {}).get("code") != language:
        print(f"✗ El catálogo {path} no es de la lengua {language!r}", file=sys.stderr)
        return 2

    changes = apply(catalog, reviews)
    for line in changes:
        print("  " + line)
    validated = sum(1 for s in catalog.get("signs", []) if s.get("validated"))
    print(f"{len(changes)} cambio(s). Señas validadas en el catálogo: {validated} de {len(catalog.get('signs', []))}.")
    if not changes:
        return 0
    if not args.write:
        print("Nada guardado: repite con --write para aplicarlo.")
        return 0
    path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✔ Guardado en {path}. Ahora: python3 scripts/gen_video_prompts.py y revisa el diff antes del PR.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
