#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=".env.production"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[deploy-prod] Missing env file: $ENV_FILE"
  echo "[deploy-prod] Copy .env.production.example -> .env.production and fill secrets first."
  exit 1
fi

branch=$(git rev-parse --abbrev-ref HEAD)
commit=$(git rev-parse --short HEAD)

env_value() {
  local key="$1"
  awk -F= -v k="$key" '
    $0 ~ /^[[:space:]]*#/ {next}
    $1==k {sub(/^[^=]*=/, "", $0); gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0); print $0; exit}
  ' "$ENV_FILE"
}

is_configured() {
  local key="$1"
  local value
  value=$(env_value "$key")
  if [[ -n "$value" ]]; then echo "yes"; else echo "no"; fi
}

echo "[deploy-prod] Preflight"
echo "  branch=$branch"
echo "  latest_commit=$commit"
echo "  env_file=$ENV_FILE"
for key in APP_DOMAIN SIGNAL_MIN_TIER SIGNAL_ALLOW_A SIGNAL_ALLOW_B SIGNAL_SEND_ENTRY SIGNAL_SEND_RESULT ENABLE_SIGNAL_MODE_OUTPUT SIGNAL_ENABLE_CRYPTO SIGNAL_ENABLE_FOREX ENGINE_PHASE_LOCK EXECUTION_MODE CAPITAL_MODE; do
  echo "  $key=$(env_value "$key")"
done
echo "  TELEGRAM_BOT_TOKEN_configured=$(is_configured TELEGRAM_BOT_TOKEN)"
echo "  TELEGRAM_CHAT_ID_configured=$(is_configured TELEGRAM_CHAT_ID)"

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
