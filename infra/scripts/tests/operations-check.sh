#!/usr/bin/env bash
set -euo pipefail

# No real Docker, database, curl request, credentials or deployment is used.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
for helper in backup-db restore-db health-check deploy; do
  bash -n "$SCRIPT_DIR/$helper.sh"
done
bash -n "${BASH_SOURCE[0]}"
TEST_PARENT="$(cd -- "${TMPDIR:-/tmp}" && pwd)"
TEST_DIR="$(mktemp -d "$TEST_PARENT/smarttaxi-infra-test.XXXXXX")"
TEST_DIR="$(cd -- "$TEST_DIR" && pwd)"
cleanup() {
  case "$TEST_DIR" in
    "$TEST_PARENT"/smarttaxi-infra-test.??????) rm -rf -- "$TEST_DIR" ;;
    *) printf 'Unexpected test path; keeping it: %s\n' "$TEST_DIR" >&2 ;;
  esac
}
trap cleanup EXIT
export APP_DIR="$TEST_DIR/project"
export BACKUP_DIR="$TEST_DIR/backups"
export MOCK_LOG="$TEST_DIR/commands.log"
mkdir -p -- "$APP_DIR"
touch "$APP_DIR/.env" "$MOCK_LOG"

docker() {
  printf '%s\n' "$*" >> "$MOCK_LOG"
  [ "${1:-}" = "compose" ] || return 90
  case "${2:-}" in
    exec)
      [ "${3:-}" = "-T" ] && [ "${4:-}" = "postgres" ] || return 91
      if [[ "$*" == *pg_dump* ]]; then
        printf 'CREATE TABLE recovery_probe (id integer);\n'
        [ "${MOCK_FAIL_DUMP:-0}" = "0" ]
      elif [[ "$*" == *createdb* ]]; then
        [ "${MOCK_TARGET_EXISTS:-0}" = "0" ]
      elif [[ "$*" == *psql* ]]; then
        while IFS= read -r line; do :; done
        [ "${MOCK_FAIL_RESTORE:-0}" = "0" ]
      else
        return 92
      fi
      ;;
    ps)
      if [ "${MOCK_FAIL_PS:-0}" = "1" ]; then return 1; fi
      if [ "${MOCK_POSTGRES_EXISTS:-0}" = "1" ]; then printf 'postgres-container\n'; fi
      ;;
    port)
      case "${3:-}" in
        api) printf '0.0.0.0:4012\n' ;;
        web) printf '127.0.0.1:5186\n' ;;
        *) return 93 ;;
      esac
      ;;
    pull) [ "${MOCK_FAIL_PULL:-0}" = "0" ] ;;
    config|up) return 0 ;;
    *) return 94 ;;
  esac
}
curl() {
  printf 'curl %s\n' "$*" >> "$MOCK_LOG"
  [ "${MOCK_FAIL_HEALTH:-0}" = "0" ]
}
export -f docker curl

expect_failure() {
  if "$@" > "$TEST_DIR/last-output.log" 2>&1; then
    printf 'Expected failure: %s\n' "$*" >&2
    exit 1
  fi
}
require_log() {
  [[ "$(< "$MOCK_LOG")" == *"$1"* ]] || { printf 'Missing command: %s\n' "$1" >&2; exit 1; }
}
reject_log() {
  [[ "$(< "$MOCK_LOG")" != *"$1"* ]] || { printf 'Unexpected command: %s\n' "$1" >&2; exit 1; }
}
reset_log() { : > "$MOCK_LOG"; }

# Call from outside the checkout: helpers must locate their Compose project.
cd -- "$TEST_DIR"
bash "$SCRIPT_DIR/backup-db.sh"
bash "$SCRIPT_DIR/backup-db.sh"
shopt -s nullglob
BACKUPS=("$BACKUP_DIR"/*.sql.gz)
[ "${#BACKUPS[@]}" -eq 2 ]
[ "$(gzip -dc -- "${BACKUPS[0]}")" = 'CREATE TABLE recovery_probe (id integer);' ]
require_log 'compose exec -T postgres'
require_log 'pg_dump --no-owner --no-acl'
expect_failure env MOCK_FAIL_DUMP=1 BACKUP_DIR="$TEST_DIR/failed-backup" bash "$SCRIPT_DIR/backup-db.sh"
FAILED_FILES=("$TEST_DIR/failed-backup"/* "$TEST_DIR/failed-backup"/.*.partial)
[ "${#FAILED_FILES[@]}" -eq 0 ]
printf 'PASS backup: service resolution, unique complete dumps, failure cleanup\n'

reset_log
expect_failure bash "$SCRIPT_DIR/restore-db.sh" "${BACKUPS[0]}"
expect_failure bash "$SCRIPT_DIR/restore-db.sh" "${BACKUPS[0]}" 'unsafe; DROP DATABASE smarttaxi'
expect_failure bash "$SCRIPT_DIR/restore-db.sh" "${BACKUPS[0]}" postgres
printf 'not a gzip dump' > "$TEST_DIR/corrupt.sql.gz"
expect_failure bash "$SCRIPT_DIR/restore-db.sh" "$TEST_DIR/corrupt.sql.gz" recovery_check
[ ! -s "$MOCK_LOG" ]
expect_failure env MOCK_TARGET_EXISTS=1 bash "$SCRIPT_DIR/restore-db.sh" "${BACKUPS[0]}" smarttaxi
reject_log psql
reset_log
bash "$SCRIPT_DIR/restore-db.sh" "${BACKUPS[0]}" recovery_check
require_log 'createdb'
require_log '--template=template0'
require_log '-d "$1" --single-transaction -v ON_ERROR_STOP=1'
require_log 'sh recovery_check'
expect_failure env MOCK_FAIL_RESTORE=1 bash "$SCRIPT_DIR/restore-db.sh" "${BACKUPS[0]}" failed_recovery
reject_log dropdb
printf 'PASS restore: explicit new target, gzip validation, existing-target refusal, atomic SQL/error propagation\n'

reset_log
env -u API_URL -u WEB_URL -u SMARTTAXI_API_PORT -u SMARTTAXI_WEB_PORT bash "$SCRIPT_DIR/health-check.sh"
require_log 'http://127.0.0.1:4001/api/health/ready'
require_log 'http://127.0.0.1:5175'
reset_log
env -u API_URL -u WEB_URL SMARTTAXI_API_PORT=4100 SMARTTAXI_WEB_PORT=5200 bash "$SCRIPT_DIR/health-check.sh"
require_log 'http://127.0.0.1:4100/api/health/ready'
require_log 'http://127.0.0.1:5200'
expect_failure env MOCK_FAIL_HEALTH=1 bash "$SCRIPT_DIR/health-check.sh"
printf 'PASS health: Compose defaults, explicit port overrides, bounded failing requests\n'

reset_log
expect_failure env MOCK_FAIL_DUMP=1 bash "$SCRIPT_DIR/deploy.sh"
reject_log 'compose pull'
reject_log 'compose up'
reset_log
expect_failure env MOCK_FAIL_PULL=1 bash "$SCRIPT_DIR/deploy.sh"
reject_log 'compose up'
reset_log
expect_failure env MOCK_POSTGRES_EXISTS=1 bash "$SCRIPT_DIR/deploy.sh" --first-deploy
reject_log 'compose up'
reset_log
expect_failure env MOCK_FAIL_PS=1 bash "$SCRIPT_DIR/deploy.sh" --first-deploy
reject_log 'compose up'
reset_log
env -u API_URL -u WEB_URL bash "$SCRIPT_DIR/deploy.sh" --first-deploy
require_log 'compose up -d --no-deps --wait --wait-timeout 120 postgres'
require_log 'compose up -d --build --wait --wait-timeout 120'
require_log 'http://127.0.0.1:4012/api/health/ready'
require_log 'http://127.0.0.1:5186'
reject_log 'npm run seed'
[[ "$(< "$MOCK_LOG")" == *pg_dump*'compose pull'*'compose up -d --build'* ]]
printf 'PASS deploy: backup/pull fail closed, explicit bootstrap, no seed, real published ports\n'
