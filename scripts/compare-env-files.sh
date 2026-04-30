#!/usr/bin/env bash
set -euo pipefail

PROD_FILE=".env.production"
SIGNAL_FILE=".env.signal"
EXAMPLE_FILE=".env.production.example"

parse_keys() {
  local file="$1"
  awk -F= '
    /^[[:space:]]*#/ {next}
    /^[[:space:]]*$/ {next}
    {
      key=$1
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
      if (key != "") print key
    }
  ' "$file" | sort -u
}

value_for() {
  local file="$1" key="$2"
  awk -F= -v k="$key" '
    $0 ~ /^[[:space:]]*#/ {next}
    $1==k {sub(/^[^=]*=/, "", $0); print $0; exit}
  ' "$file"
}

if [[ ! -f "$PROD_FILE" ]]; then
  echo "[compare-env] missing $PROD_FILE"
  exit 1
fi
if [[ ! -f "$EXAMPLE_FILE" ]]; then
  echo "[compare-env] missing $EXAMPLE_FILE"
  exit 1
fi

echo "[compare-env] Comparing env files"

tmp_required=$(mktemp)
tmp_prod=$(mktemp)
trap 'rm -f "$tmp_required" "$tmp_prod"' EXIT

parse_keys "$EXAMPLE_FILE" > "$tmp_required"
parse_keys "$PROD_FILE" > "$tmp_prod"

echo "\n[compare-env] Keys missing from $PROD_FILE (vs $EXAMPLE_FILE):"
comm -23 "$tmp_required" "$tmp_prod" | sed 's/^/  - /' || true

if [[ -f "$SIGNAL_FILE" ]]; then
  tmp_signal=$(mktemp)
  trap 'rm -f "$tmp_required" "$tmp_prod" "$tmp_signal"' EXIT
  parse_keys "$SIGNAL_FILE" > "$tmp_signal"
  echo "\n[compare-env] Keys extra in $SIGNAL_FILE (not in $PROD_FILE):"
  comm -13 "$tmp_prod" "$tmp_signal" | sed 's/^/  - /' || true
else
  echo "\n[compare-env] $SIGNAL_FILE not present; skipping extra-key check."
fi

echo "\n[compare-env] Dangerous/old value checks in $PROD_FILE:"
check_flag() {
  local key="$1" expected="$2"
  local value
  value=$(value_for "$PROD_FILE" "$key")
  if [[ -z "$value" ]]; then
    echo "  - $key is empty"
    return
  fi
  if [[ "$value" != "$expected" ]]; then
    echo "  - $key=$value (expected $expected)"
  fi
}

check_flag "SIGNAL_MIN_TIER" "A+"
check_flag "SIGNAL_ALLOW_A" "false"
check_flag "SIGNAL_ALLOW_B" "false"
check_flag "SIGNAL_SEND_ENTRY" "true"
check_flag "SIGNAL_SEND_RESULT" "true"

for key in TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID APP_DOMAIN; do
  value=$(value_for "$PROD_FILE" "$key")
  if [[ -z "$value" ]]; then
    echo "  - $key is empty"
  fi
done

db_value=$(value_for "$PROD_FILE" "DATABASE_URL")
if [[ "$db_value" == *"CHANGE_ME"* ]]; then
  echo "  - DATABASE_URL contains CHANGE_ME"
fi

echo "\n[compare-env] Done"
