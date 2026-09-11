# Backup and restore

The helpers use the `postgres` Compose service, so they work with the current
project name and with isolated QA projects. They locate the checkout from their
own path; `APP_DIR` can explicitly select another checkout. Database/user values
come from the Postgres container's environment, including Compose `.env` values
that were not exported in the calling shell.

Scripts:

- `infra/scripts/backup-db.sh`
- `infra/scripts/restore-db.sh`

## Backup

From a checkout with its local Compose database running:

```bash
bash infra/scripts/backup-db.sh
```

By default, dumps go to `<checkout>/backups/` (git-ignored). Set `BACKUP_DIR` to
use another explicit directory, for example `/opt/smarttaxi/backups`. Files are
private to the creating user (`umask 077`). Each dump uses a unique name; only a
successful `pg_dump` pipeline and a valid gzip archive are published as a final
`.sql.gz` file. Failed partial files are removed.

The helper never deletes previous backups. Apply a reviewed retention policy
after recovery verification and off-host copies are established.

Production rule: copy backups outside the VPS as well. A VPS-local backup is not enough.

## Restore

Restoration requires an explicit **new database name**. An existing target is
rejected by PostgreSQL before any SQL is imported; the helper never drops a
database, cleans existing tables, or changes the API's database connection.
Restore only a trusted dump made by `pg_dump`.

```bash
bash infra/scripts/restore-db.sh /path/to/smarttaxi_backup.sql.gz smarttaxi_restore_check
```

The archive is checked before creating the target. SQL imports use
`ON_ERROR_STOP=1` and one transaction. An import error fails the script and
leaves the newly created target for inspection; it does not affect the running
application database. Promoting a verified recovery database is a separate,
explicit operational action.

## Local recovery rehearsal

1. Back up the local development database.
2. Restore it to a new named database with the command above.
3. Inspect schema, row counts and representative orders in that database.
4. Point a **separate local QA API** at the restored target before running
   business-flow smokes. Running a smoke against the existing API would test
   the original database and would not prove recovery.

Do not substitute production accounts or the active deployment for this
rehearsal. No real restore is implied by the script tests below.

## Script checks without Docker or network access

```bash
bash infra/scripts/tests/operations-check.sh
```

This checks syntax and uses exported shell stubs for Docker/curl. It covers
backup failures and unique completed files, corrupt archives, required/new
restore targets, SQL error propagation, health ports, and deployment stopping
on a failed backup. It does not contact a daemon, database or HTTP endpoint.
