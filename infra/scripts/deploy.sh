#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/smarttaxi/app}"
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo ".env is missing. Copy .env.example to .env and fill production secrets first."
  exit 1
fi

./infra/scripts/backup-db.sh || echo "Backup skipped or failed; continue only if this is first deploy."
docker compose pull || true
docker compose up -d --build
docker compose exec -T api npm run seed || true
./infra/scripts/health-check.sh
docker compose ps
