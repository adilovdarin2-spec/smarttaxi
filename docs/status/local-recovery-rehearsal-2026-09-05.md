# Local recovery rehearsal — 2026-09-05

The actual `backup-db.sh` / `restore-db.sh` helpers were exercised against
the local development Docker stack, not merely command stubs.

- Backup: `backups/smarttaxi_20260905_160820_yde6lB.sql.gz` (git-ignored).
- Restore target: **new** `smarttaxi_qa_restore_20260905` database inside the
  local PostgreSQL container. The name was verified absent before creation.
- Gzip validation and the single-transaction SQL restore succeeded.
- Source and restored database counts matched: 40 public tables, 128 public
  indexes, 121,361 addresses, 13 regions and 52 tariffs.
- A second restore to that same target was correctly refused by `createdb`;
  no existing database was overwritten.
- The development API continues using `smarttaxi`; its readiness and web
  health checks passed after the rehearsal. No environment was switched.

Both the backup and separate restored database are retained for inspection.
No volume/database was deleted, and no production network or provider was
used. This verifies local restoration, not production backup scheduling,
off-site retention, disaster recovery time objectives, or an official address
registry import.
