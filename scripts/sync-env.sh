#!/usr/bin/env bash
set -euo pipefail
cp .env.production .env
echo "synced .env.production -> .env"
