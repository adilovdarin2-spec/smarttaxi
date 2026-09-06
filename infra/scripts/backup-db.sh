#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd -- "$SCRIPT_DIR/../.." && pwd)}"
cd -- "$APP_DIR"
APP_DIR="$(pwd)"

BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
mkdir -p -- "$BACKUP_DIR"
BACKUP_DIR="$(cd -- "$BACKUP_DIR" && pwd)"
TEMP_FILE="$(mktemp "$BACKUP_DIR/.smarttaxi_$(date +%Y%m%d_%H%M%S)_XXXXXX.sql.gz.partial")"
trap 'rm -f -- "$TEMP_FILE"' EXIT

# Resolve the service through Compose and use its actual database environment.
# Host .env variables need not be exported, and container names vary by project.
docker compose exec -T postgres sh -c \
  'exec pg_dump --no-owner --no-acl -U "${POSTGRES_USER:-smarttaxi}" "${POSTGRES_DB:-smarttaxi}"' \
  | gzip > "$TEMP_FILE"
gzip -t -- "$TEMP_FILE"

# Publish only a complete dump, with a unique name. Retention is deliberate:
# this helper never removes earlier recovery points as a side effect.
FILE_NAME="${TEMP_FILE##*/}"
FILE="$BACKUP_DIR/${FILE_NAME#.}"
FILE="${FILE%.partial}"
mv -- "$TEMP_FILE" "$FILE"
trap - EXIT
echo "Backup created: $FILE"
