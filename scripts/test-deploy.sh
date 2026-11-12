#!/usr/bin/env bash
# End-to-end test of deploy/deploy.sh against a locally built image (REQ-011).
# Used by CI; runnable locally:
#
#   docker build -t handsonedu:ci . && scripts/test-deploy.sh handsonedu:ci
#
# Checks: fresh install → healthy with the expected version; update → hot backup
# of the SQLite DB; a version that does not come up as itself → automatic rollback.
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
  docker rmi "$TEST_IMAGE:$VERSION" "$TEST_IMAGE:9.9.9" >/dev/null 2>&1 || true
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
EOF
docker tag "$IMAGE" "$TEST_IMAGE:$VERSION"
docker tag "$IMAGE" "$TEST_IMAGE:9.9.9"     # reports $VERSION, not 9.9.9 → must roll back
cd "$WORK"
env_version() { sed -n 's/^HANDSONEDU_VERSION=//p' .env; }

echo "── 1. fresh install of $VERSION"
./deploy.sh "v$VERSION" || fail "install failed"
[ "$(env_version)" = "$VERSION" ] || fail ".env not updated"
docker compose exec -T hands-on-edu test -f /app/data/handsonedu.db || fail "database not created"
docker compose exec -T hands-on-edu sh -c 'cat /proc/1/cmdline | tr "\0" " "' | grep -q -- --reload \
  && fail "production image runs with --reload"

echo "── 2. update (same version) makes a backup"
./deploy.sh "$VERSION" || fail "update failed"
docker compose exec -T hands-on-edu sh -c 'ls /app/data/backups/handsonedu-*-before-'"$VERSION"'.db' >/dev/null \
  || fail "no backup before update"

echo "── 3. unhealthy target rolls back"
if HEALTH_TIMEOUT=30 ./deploy.sh 9.9.9; then fail "9.9.9 should not deploy"; fi
[ "$(env_version)" = "$VERSION" ] || fail "rollback did not restore HANDSONEDU_VERSION"
docker compose exec -T hands-on-edu python -c "import json,urllib.request; assert json.load(urllib.request.urlopen('http://localhost:8000/health'))['version'] == '$VERSION'" \
  || fail "service not healthy after rollback"

echo "── 4. bad input is rejected before touching anything"
if ./deploy.sh 'latest; true' 2>/dev/null; then fail "unvalidated version accepted"; fi

echo "✔ deploy.sh: install, backup, rollback and input validation OK"
