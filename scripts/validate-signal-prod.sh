#!/usr/bin/env bash
set -euo pipefail
if [[ -f .env.production ]]; then
  ENV_FILE=.env.production
else
  ./scripts/prepare-validation-env.sh
  ENV_FILE=.env.validation
fi
echo "[validate-signal-prod] using env: $ENV_FILE"
./scripts/validate-env.sh "$ENV_FILE"
tsx scripts/validate-signal-prod.ts
