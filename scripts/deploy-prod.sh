#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=".env.production"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[deploy-prod] Missing env file: $ENV_FILE"
  echo "[deploy-prod] Copy .env.production.example -> .env.production and fill secrets first."
  exit 1
fi

./scripts/validate-env.sh "$ENV_FILE"
./scripts/sync-env.sh

pnpm install
pnpm --filter @hashi/web build
pnpm --filter @hashi/worker build
docker compose --env-file "$ENV_FILE" build
docker compose --env-file "$ENV_FILE" up -d
docker compose --env-file "$ENV_FILE" exec -T worker sh -lc 'pnpm prisma migrate deploy'
docker compose --env-file "$ENV_FILE" restart web worker

echo "[deploy-prod] services status"
docker compose --env-file "$ENV_FILE" ps
./scripts/check-prod-health.sh
