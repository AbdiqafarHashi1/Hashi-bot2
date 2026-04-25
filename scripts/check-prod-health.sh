#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${HASHI_ENV_FILE:-.env.production}"
COMPOSE_ENV_ARGS=()
if [[ -f "$ENV_FILE" ]]; then
  export HASHI_ENV_FILE="$ENV_FILE"
  COMPOSE_ENV_ARGS=(--env-file "$ENV_FILE")
fi

BASE_URL="${BASE_URL:-http://localhost}"

echo "[health] docker compose ps"
docker compose "${COMPOSE_ENV_ARGS[@]}" ps

echo "[health] web /api/health"
curl -fsS "$BASE_URL/api/health" | sed 's/^/[health] /'

echo "[health] protected endpoint auth gate (/api/signal-room expected 401/403 without cookie)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/signal-room")
echo "[health] /api/signal-room status=$STATUS"

if [[ "$STATUS" != "401" && "$STATUS" != "403" ]]; then
  echo "[health] warning: expected auth-protected status (401/403), got $STATUS"
fi

echo "[health] redis reachable from container"
docker compose "${COMPOSE_ENV_ARGS[@]}" exec -T redis redis-cli ping | sed 's/^/[health] /'

echo "[health] postgres ready"
docker compose "${COMPOSE_ENV_ARGS[@]}" exec -T postgres pg_isready -U postgres -d hashi_bot2 | sed 's/^/[health] /'

echo "[health] worker container status"
docker compose "${COMPOSE_ENV_ARGS[@]}" ps worker
