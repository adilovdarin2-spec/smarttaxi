# Backup and restore

Existing scripts:

- `infra/scripts/backup-db.sh`
- `infra/scripts/restore-db.sh`

## Backup

On VPS:

```bash
POSTGRES_USER=smarttaxi POSTGRES_DB=smarttaxi ./infra/scripts/backup-db.sh
```

The script writes gzipped SQL dumps to `/opt/smarttaxi/backups` and deletes backups older than 7 days.

Production rule: copy backups outside the VPS as well. A VPS-local backup is not enough.

## Restore

Restoring is destructive. Use only with a verified backup.

```bash
POSTGRES_USER=smarttaxi POSTGRES_DB=smarttaxi ./infra/scripts/restore-db.sh /opt/smarttaxi/backups/smarttaxi_YYYYMMDD_HHMMSS.sql.gz
```

## Test restore locally

1. Create a fresh local Docker database.
2. Restore the dump.
3. Run:

```bash
npm --prefix apps/api run smoke:health
npm --prefix apps/api run smoke:maps
npm --prefix apps/api run smoke:stage3
```
