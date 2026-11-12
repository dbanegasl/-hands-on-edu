#!/usr/bin/env bash
# End-to-end test of deploy/deploy.sh against a locally built image (REQ-011).
# Used by CI; runnable locally:
#
#   docker build -t handsonedu:ci . && scripts/test-deploy.sh handsonedu:ci
#
# Checks: fresh install → healthy with the expected version and migrated schema,
# running as the unprivileged app user;
# update → hot backup of the SQLite DB; a version that does not come up as itself
# → automatic rollback, keeping the database if the schema is unchanged and
# restoring the pre-update backup if that version had migrated it.
set -euo pipefail

IMAGE="${1:-handsonedu:ci}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(python3 "$ROOT/scripts/release.py" version)"
TEST_IMAGE=handsonedu-deploytest
WORK="$(mktemp -d)"
export COMPOSE_PROJECT_NAME=handsonedu-deploytest PULL=0 HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-90}"

cleanup() {
  (cd "$WORK" && docker compose down -v --remove-orphans >/dev/null 2>&1) || true
  # data/ is written by the container (root): remove it from inside one.
  docker run --rm -v "$WORK:/w" --entrypoint rm "$IMAGE" -rf /w/data >/dev/null 2>&1 || true
  rm -rf "$WORK"
  docker rmi "$TEST_IMAGE:$VERSION" "$TEST_IMAGE:9.9.9" "$TEST_IMAGE:9.9.8" >/dev/null 2>&1 || true
}
trap cleanup EXIT
fail() { echo "✗ $*" >&2; exit 1; }

cp "$ROOT/deploy/docker-compose.yml" "$ROOT/deploy/deploy.sh" "$WORK/"
cat > "$WORK/.env" <<EOF
HANDSONEDU_IMAGE=$TEST_IMAGE
HANDSONEDU_VERSION=latest
HOST_PORT=${TEST_PORT:-19876}
PUBLIC_BASE_URL=http://localhost:${TEST_PORT:-19876}
ADMIN_TOKEN=deploy-test
WEB_CONCURRENCY=1
PRIVACY_CONTROLLER=Unidad Educativa de Prueba
PRIVACY_CONTACT=datos@prueba.test
EOF
docker tag "$IMAGE" "$TEST_IMAGE:$VERSION"
docker tag "$IMAGE" "$TEST_IMAGE:9.9.9"     # reports $VERSION, not 9.9.9 → must roll back

# 9.9.8: same app plus a schema migration, and also reports the wrong version.
HEAD="$(docker run --rm --entrypoint python "$IMAGE" -m app.migrate head | tail -n1)"
mkdir -p "$WORK/img"
cat > "$WORK/img/9998_deploy_test.py" <<MIGRATION
from alembic import op
import sqlalchemy as sa
revision = "9998"
down_revision = "$HEAD"
branch_labels = depends_on = None
def upgrade():
    op.create_table("deploy_test_marker", sa.Column("id", sa.Integer, primary_key=True))
def downgrade():
    op.drop_table("deploy_test_marker")
MIGRATION
printf 'FROM %s\nCOPY 9998_deploy_test.py /app/app/migrations/versions/\n' "$IMAGE" > "$WORK/img/Dockerfile"
docker build -q -t "$TEST_IMAGE:9.9.8" "$WORK/img" >/dev/null

cd "$WORK"
env_version() { sed -n 's/^HANDSONEDU_VERSION=//p' .env; }
sql() { docker compose exec -T hands-on-edu python -c "import sqlite3,sys; c=sqlite3.connect('/app/data/handsonedu.db'); r=c.execute(sys.argv[1]).fetchall(); c.commit(); print(r[0][0] if r else '')" "$1"; }

echo "── 1. fresh install of $VERSION"
./deploy.sh "v$VERSION" || fail "install failed"
[ "$(env_version)" = "$VERSION" ] || fail ".env not updated"
docker compose exec -T hands-on-edu test -f /app/data/handsonedu.db || fail "database not created"
docker compose exec -T hands-on-edu sh -c 'cat /proc/1/cmdline | tr "\0" " "' | grep -q -- --reload \
  && fail "production image runs with --reload"
[ "$(sql 'SELECT version_num FROM alembic_version')" = "$HEAD" ] || fail "schema not migrated to $HEAD"
[ "$(docker compose exec -T hands-on-edu awk '/^Uid:/{print $2}' /proc/1/status)" != 0 ] || fail "the app runs as root"
[ -z "$(docker compose exec -T hands-on-edu find /app/data \! -user app)" ] || fail "data/ not owned by the app user"
echo "── 1b. deploy/check-install.py against the running install"
check_out=$(python3 "$ROOT/deploy/check-install.py" "http://localhost:${TEST_PORT:-19876}" --allow-http --admin-token deploy-test) \
  || { echo "$check_out"; fail "check-install reports failures on a correct install"; }
echo "$check_out"
grep -q "Aviso de privacidad con responsable" <<<"$check_out" || fail "PRIVACY_* from .env did not reach the app"
if python3 "$ROOT/deploy/check-install.py" "http://localhost:${TEST_PORT:-19876}" --allow-http --admin-token wrong >/dev/null; then
  fail "check-install accepted a wrong ADMIN_TOKEN"
fi
sql "INSERT INTO learners (id, display_name, created_at) VALUES ('deploytest', 'Ana', '2026-01-01')" >/dev/null
echo "── 1c. privacy CLI (REQ-021) in the image"
docker compose exec -T hands-on-edu python -m app.privacy find Ana | grep -q deploytest || fail "privacy find"
docker compose exec -T hands-on-edu python -m app.privacy export deploytest | grep -q '"display_name": "Ana"' || fail "privacy export"

echo "── 2. update (same version) makes a backup"
./deploy.sh "$VERSION" || fail "update failed"
docker compose exec -T hands-on-edu sh -c 'ls /app/data/backups/handsonedu-*-before-'"$VERSION"'.db' >/dev/null \
  || fail "no backup before update"

echo "── 3. unhealthy target rolls back"
if HEALTH_TIMEOUT=30 ./deploy.sh 9.9.9; then fail "9.9.9 should not deploy"; fi
[ "$(env_version)" = "$VERSION" ] || fail "rollback did not restore HANDSONEDU_VERSION"
docker compose exec -T hands-on-edu python -c "import json,urllib.request; assert json.load(urllib.request.urlopen('http://localhost:8000/health'))['version'] == '$VERSION'" \
  || fail "service not healthy after rollback"
[ "$(sql "SELECT display_name FROM learners WHERE id='deploytest'")" = Ana ] || fail "data lost on rollback"

echo "── 3b. failed version that had migrated the schema → backup restored"
if HEALTH_TIMEOUT=30 ./deploy.sh 9.9.8; then fail "9.9.8 should not deploy"; fi
[ "$(sql 'SELECT version_num FROM alembic_version')" = "$HEAD" ] || fail "schema not restored to $HEAD"
[ -z "$(sql "SELECT name FROM sqlite_master WHERE name='deploy_test_marker'")" ] || fail "migrated table still present"
[ "$(sql "SELECT display_name FROM learners WHERE id='deploytest'")" = Ana ] || fail "data lost on restore"

echo "── 4. bad input is rejected before touching anything"
if ./deploy.sh 'latest; true' 2>/dev/null; then fail "unvalidated version accepted"; fi

echo "✔ deploy.sh: install, migrations, backup, rollback (with schema restore) and input validation OK"
