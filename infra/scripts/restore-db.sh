#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: ./infra/scripts/restore-db.sh /path/to/smarttaxi_backup.sql.gz NEW_DATABASE" >&2
  echo "The target must be a new database. Existing databases are never overwritten." >&2
  exit 1
fi

BACKUP_FILE="$1"
TARGET_DATABASE="$2"
if [ ! -f "$BACKUP_FILE" ] || [ ! -r "$BACKUP_FILE" ]; then
  echo "Backup file is not readable: $BACKUP_FILE" >&2
  exit 1
fi

if [[ ! "$TARGET_DATABASE" =~ ^[a-zA-Z_][a-zA-Z0-9_]{0,62}$ ]] ||
   [[ "$TARGET_DATABASE" == "postgres" || "$TARGET_DATABASE" == template* ]]; then
  echo "Choose a new, non-system database name (ASCII letters, digits and underscores; up to 63 characters)." >&2
  exit 1
fi

# Resolve relative input before switching to the Compose project directory.
BACKUP_FILE="$(cd -- "$(dirname -- "$BACKUP_FILE")" && pwd)/$(basename -- "$BACKUP_FILE")"
gzip -t -- "$BACKUP_FILE"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd -- "$SCRIPT_DIR/../.." && pwd)}"
cd -- "$APP_DIR"

# createdb refuses an existing target, including the running application DB.
# No drop/clean is attempted. A failed import leaves the new target for review.
docker compose exec -T postgres sh -c \
  'exec createdb -U "${POSTGRES_USER:-smarttaxi}" --template=template0 -- "$1"' \
  sh "$TARGET_DATABASE"

echo "Restoring $BACKUP_FILE into new database $TARGET_DATABASE"
if ! gzip -dc -- "$BACKUP_FILE" | docker compose exec -T postgres sh -c \
  'exec psql -X -U "${POSTGRES_USER:-smarttaxi}" -d "$1" --single-transaction -v ON_ERROR_STOP=1' \
  sh "$TARGET_DATABASE"; then
  echo "Restore failed; application database unchanged. Inspect the new target $TARGET_DATABASE before retrying." >&2
  exit 1
fi
echo "Restore completed in $TARGET_DATABASE. Application configuration is unchanged."
