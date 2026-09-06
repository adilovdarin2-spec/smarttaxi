#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != "--first-deploy" ]; }; then
  echo "Usage: ./infra/scripts/deploy.sh [--first-deploy]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd -- "$SCRIPT_DIR/../.." && pwd)}"
cd -- "$APP_DIR"
APP_DIR="$(pwd)"
export APP_DIR

if [ ! -f .env ]; then
  echo ".env is missing. Copy .env.example to .env and fill production secrets first."
  exit 1
fi

docker compose config -q
if [ "${1:-}" = "--first-deploy" ]; then
  EXISTING_POSTGRES="$(docker compose ps -a -q postgres)"
  if [ -n "$EXISTING_POSTGRES" ]; then
    echo "Postgres already exists in this Compose project. Run without --first-deploy." >&2
    exit 1
  fi
  # Provision only the database, then back up its baseline before the app starts.
  # Existing volumes, if any, are retained and backed up in the same way.
  docker compose up -d --no-deps --wait --wait-timeout 120 postgres
fi

# A failed backup stops deployment. Test-account seeding is a separate, explicit
# local-development action, never part of an operational deployment.
bash "$SCRIPT_DIR/backup-db.sh"
docker compose pull --ignore-buildable
docker compose up -d --build --wait --wait-timeout 120

# Read the real published ports, including values set only in Compose's .env.
API_BINDING="$(docker compose port api 4000)"
WEB_BINDING="$(docker compose port web 80)"
if [[ ! "${API_BINDING##*:}" =~ ^[0-9]+$ ]] || [[ ! "${WEB_BINDING##*:}" =~ ^[0-9]+$ ]]; then
  echo "Cannot resolve the API/web published ports." >&2
  exit 1
fi
export API_URL="${API_URL:-http://127.0.0.1:${API_BINDING##*:}}"
export WEB_URL="${WEB_URL:-http://127.0.0.1:${WEB_BINDING##*:}}"
bash "$SCRIPT_DIR/health-check.sh"
docker compose ps
