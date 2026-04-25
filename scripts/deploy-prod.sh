#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${HASHI_ENV_FILE:-.env.production}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[deploy-prod] Missing env file: $ENV_FILE"
  echo "[deploy-prod] Copy .env.production.example -> .env.production and fill secrets first."
  exit 1
fi

export HASHI_ENV_FILE="$ENV_FILE"

pnpm install

if [[ "${SKIP_WEB_BUILD:-0}" != "1" ]]; then
  pnpm --filter @hashi/web build
fi

docker compose --env-file "$ENV_FILE" up -d --build

echo "[deploy-prod] services status"
docker compose --env-file "$ENV_FILE" ps
