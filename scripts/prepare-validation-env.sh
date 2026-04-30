#!/usr/bin/env bash
set -euo pipefail
FORCE="${1:-}"
TARGET=".env.validation"
SOURCE=".env.production.example"
if [[ ! -f "$SOURCE" ]]; then
  echo "[prepare-validation-env] missing source: $SOURCE"
  exit 1
fi
if [[ -f ".env.production" && "$FORCE" != "--force" ]]; then
  echo "[prepare-validation-env] real .env.production detected; keeping it as primary."
  echo "[prepare-validation-env] env file in use: .env.production"
  exit 0
fi
cp "$SOURCE" "$TARGET"
# safe dummy values for structural checks only
sed -i 's|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=dummy_token|' "$TARGET"
sed -i 's|^TELEGRAM_CHAT_ID=.*|TELEGRAM_CHAT_ID=123456789|' "$TARGET"
sed -i 's|^DATABASE_URL=.*|DATABASE_URL=postgresql://user:pass@localhost:5432/hashi|' "$TARGET"
sed -i 's|^REDIS_URL=.*|REDIS_URL=redis://localhost:6379|' "$TARGET"
sed -i 's|^APP_DOMAIN=.*|APP_DOMAIN=http://localhost:3000|' "$TARGET"
sed -i 's|^DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=validation-password|' "$TARGET"
echo "[prepare-validation-env] generated $TARGET from $SOURCE"
echo "[prepare-validation-env] env file in use: $TARGET"
