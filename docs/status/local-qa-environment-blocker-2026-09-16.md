# Local QA environment blocker — 2026-09-16

## Observed state

The Windows Docker Desktop Linux-engine pipe `\\.\pipe\dockerDesktopLinuxEngine`
is absent. Docker Desktop's backend exits before the engine starts while trying
to recreate transient AF_UNIX runtime endpoints:

- `%LOCALAPPDATA%\Docker\run\dockerInference`
- `%LOCALAPPDATA%\docker-secrets-engine\engine.sock`

Windows reports that those stale reparse-point sockets cannot be accessed. This
is a workstation/Docker Desktop startup failure, not an API, Compose, database
or BaiSapar source failure.

The physical Android device was also not present in `flutter devices` at the
end of the pass, so installation or moving-device QA must not be claimed.

## Safe handling

- Do **not** run `docker compose down -v`, factory-reset Docker Desktop, or
  delete project volumes to work around this issue.
- The `Docker/run` and `docker-secrets-engine` runtime directories were moved
  aside only after their failed backend processes stopped; no project data or
  named volume was removed.
- Reboot Windows before attempting the next local Docker pass. The reboot
  releases the OS-held socket objects; then verify the engine pipe and run
  `docker compose up -d --build` followed by readiness and smoke checks.
- Reconnect the Android phone and confirm it appears in `flutter devices`
  before installing the already-built local QA APK.

## Checks that remain valid without Docker

On this pass, `npm --prefix apps/api test` completed successfully, including
the 13-region address invariants, and Flutter completed `analyze` without
issues plus `test --no-pub` with 330 passing tests. Web build/tests had already
passed after the current `dev` UI changes.
