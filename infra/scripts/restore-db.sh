#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: ./infra/scripts/restore-db.sh /path/to/smarttaxi_backup.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "Restoring from $BACKUP_FILE"
echo "Current database will be overwritten. Press Ctrl+C within 5 seconds to cancel."
sleep 5

gunzip -c "$BACKUP_FILE" | docker exec -i smarttaxi-postgres psql -U "${POSTGRES_USER:-smarttaxi}" "${POSTGRES_DB:-smarttaxi}"
echo "Restore completed"
