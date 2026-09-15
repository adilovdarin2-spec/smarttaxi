# Local operations helper hardening — 2026-09-05

Read-only release preparation found a mismatch between the current Compose
stack and its older operations scripts. No deployment, backup, restore,
production connection or account seed was executed during this pass.

## Confirmed defects and changes

- Backup/restore used the fixed container name `smarttaxi-postgres`, which
  is not specified in `docker-compose.yml`. They now address the Compose
  `postgres` service and read database/user values inside that container.
- Backup now writes a private, unique partial file and publishes it only
  after the dump pipeline succeeds and gzip integrity is checked. A failed
  dump cannot leave a final-looking recovery file. Earlier backups are kept.
- Restore previously announced overwrite, waited five seconds, and continued
  without explicit target selection or SQL error handling. It now requires a
  new named database, rejects existing targets, validates the archive first,
  and imports in one transaction with `ON_ERROR_STOP`. It never changes the
  running application's connection.
- Health defaults were host ports `4000`/`5173`; they now match Compose's
  `4001`/`5175`, accept explicit overrides, and have bounded request times.
- Deploy no longer continues after backup/pull failures or automatically
  seeds test accounts. First deployment is explicit, provisions only Postgres
  initially, and still backs up that baseline. Post-build health uses the
  actual Compose bindings, including port overrides present only in `.env`.

## Verification and limits

`bash infra/scripts/tests/operations-check.sh` passed: syntax for all four
helpers; backup success/uniqueness/failure cleanup; required restore target;
invalid name/corrupt archive/existing database refusal; SQL failure; default
and overridden health ports; deployment backup/pull failures; first-deploy
refusal on an existing database container or failed Docker lookup; and no
automatic seed.

Docker and curl were shell stubs in a temporary fixture checkout, so these
checks had no effect on running containers or network services. A real
backup-and-restore rehearsal into a separately named local QA database is
still required to claim verified data recovery. Off-host backup storage and
production promotion remain operational inputs for the eventual deployment.
