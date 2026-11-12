#!/usr/bin/env bash
# DEV/TEST ONLY — wire the local Moodle (docker-compose.moodle.yml) and HandsOnEdu together.
#   docker compose -f docker-compose.yml -f docker-compose.moodle.yml up -d
#   ./scripts/moodle-dev-setup.sh
# Idempotent: re-running reuses the tool, course and users. Guide: docs/onboarding/02-moodle-local.md
set -euo pipefail
cd "$(dirname "$0")/.."

MOODLE_URL="${MOODLE_URL:-http://moodle.localtest.me:8080}"
HOE_URL="${HOE_URL:-http://handsonedu.localtest.me:${HOST_PORT:-9876}}"
ADMIN_TOKEN="${ADMIN_TOKEN:-$(grep -E '^ADMIN_TOKEN=' .env 2>/dev/null | cut -d= -f2- || true)}"

echo "⏳ Esperando a Moodle ($MOODLE_URL) — la primera instalación tarda varios minutos…"
for _ in $(seq 1 90); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$MOODLE_URL/login/index.php")" = "200" ] && break
  sleep 10
done
curl -sf -o /dev/null "$MOODLE_URL/login/index.php" || { echo "❌ Moodle no responde"; exit 1; }

echo "⚙️  Configurando la herramienta LTI 1.3, el curso y los usuarios en Moodle…"
platform=$(docker exec -i -u daemon -e HOE_URL="$HOE_URL" hoe_moodle /opt/bitnami/php/bin/php < scripts/moodle/setup-lti-tool.php | tail -1)
echo "$platform" | python3 -m json.tool >/dev/null || { echo "❌ Respuesta inesperada de Moodle: $platform"; exit 1; }

echo "🔌 Registrando Moodle en HandsOnEdu ($HOE_URL)…"
issuer=$(echo "$platform" | python3 -c 'import json,sys; print(json.load(sys.stdin)["issuer"])')
existing=$(curl -s -H "X-Admin-Token: $ADMIN_TOKEN" "$HOE_URL/api/lti/platforms" |
  python3 -c "import json,sys; print(next((p['id'] for p in json.load(sys.stdin) if p['issuer']=='$issuer'), ''))")
if [ -n "$existing" ]; then
  curl -sf -X DELETE -H "X-Admin-Token: $ADMIN_TOKEN" "$HOE_URL/api/lti/platforms/$existing" >/dev/null
fi
echo "$platform" | python3 -c 'import json,sys; d=json.load(sys.stdin); [d.pop(k) for k in ("course_id","type_id")]; print(json.dumps(d))' |
  curl -sf -X POST "$HOE_URL/api/lti/platforms" -H "Content-Type: application/json" -H "X-Admin-Token: $ADMIN_TOKEN" -d @- >/dev/null

course_id=$(echo "$platform" | python3 -c 'import json,sys; print(json.load(sys.stdin)["course_id"])')
cat <<EOF

✅ Listo.
   Moodle:      $MOODLE_URL   (admin / Admin1234!)
   Curso:       $MOODLE_URL/course/view.php?id=$course_id
   Docente:     docente / Docente123!
   Estudiantes: estudiante / Estudiante123!   ·   estudiante2 / Estudiante123!
   HandsOnEdu:  $HOE_URL/lti/setup

Siguiente: entra como docente, activa la edición del curso y agrega la actividad
«HandsOnEdu — Aula de Señas» → «Seleccionar contenido».
EOF
