#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR="/opt/smarttaxi/backups"
mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/smarttaxi_$(date +%Y%m%d_%H%M%S).sql.gz"
docker exec smarttaxi-postgres pg_dump -U "${POSTGRES_USER:-smarttaxi}" "${POSTGRES_DB:-smarttaxi}" | gzip > "$FILE"
test -s "$FILE"
find "$BACKUP_DIR" -type f -name "smarttaxi_*.sql.gz" -mtime +7 -delete
echo "Backup created: $FILE"
