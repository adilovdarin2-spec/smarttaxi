# SmartTaxi admin session and access QA — 2026-09-10

## Scope

This pass closes a web parity and privacy gap in the owner/finance console. The
pass was performed against the local development Docker stack only.

## Confirmed defects

- A role login or logout in another browser tab did not immediately invalidate
  the admin view. Previously loaded private dashboard data could remain visible.
- Slow dashboard, list, detail, pagination, or mutation responses could repaint
  an admin screen after the browser session had been replaced.
- The desktop access/login screen inherited the permanent admin sidebar column,
  leaving the login card offset to the left and its controls unnecessarily narrow.

## Changes

- Admin now subscribes to same-document and cross-tab token changes through the
  shared browser-session channel.
- A session reset clears dashboard, list, modal, action, driver-detail, query,
  navigation, and loading state before the replacement account is checked.
- Async admin reads and actions use a captured token/mount guard, so a response
  from an old account cannot update a replacement session.
- Loading and access views use a dedicated single-column, centered layout. The
  login form remains responsive and is capped at 360 px.
- Added regression coverage for session snapshots and for the admin access-shell
  markup/CSS contract.

## Live QA evidence

- Logged into `/owner` with the local development OWNER account and confirmed the
  real dashboard loaded.
- Logged into `/order` as the local CLIENT account in a second tab. Without
  reloading `/owner`, the dashboard was removed and the access view appeared.
- Rebuilt the web Docker service and visually confirmed at 1280x720 that the
  access card and form are centered and evenly sized.
- No production account, production SMS flow, or production payment flow was used.

## Verification

- `npm --prefix apps/web test`: 121/121 passed.
- `npm --prefix apps/web run build`: passed, including the map build check.
- `docker compose config -q`: passed.
- Docker services `api`, `web`, `postgres`, and `redis`: healthy.
- `GET http://127.0.0.1:4001/api/health/ready`: `ok`; DB, Redis, and OSRM healthy.
- `git diff --check`: passed.

## Remaining external/release gates

- Official regional RKA datasets with `rka`, `label`, `lat`, and `lng`, plus a
  checksummed `meta.json` for each region.
- Production SMS/Infobip sender, payment merchant, legal decisions/texts, secrets,
  deployment infrastructure, and map/routing provider SLA.
- Physical-device road QA for live GPS, background behavior, voice navigation,
  and route quality in real traffic; iOS remains outside the available toolchain.
