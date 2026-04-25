#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${HASHI_ENV_FILE:-.env.production}"
COMPOSE_ENV_ARGS=()
if [[ -f "$ENV_FILE" ]]; then
  export HASHI_ENV_FILE="$ENV_FILE"
  COMPOSE_ENV_ARGS=(--env-file "$ENV_FILE")
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="backups"
OUT_FILE="$OUT_DIR/postgres_${STAMP}.sql"
mkdir -p "$OUT_DIR"

docker compose "${COMPOSE_ENV_ARGS[@]}" exec -T postgres pg_dump -U postgres -d hashi_bot2 > "$OUT_FILE"

echo "[backup-db] wrote $OUT_FILE"
