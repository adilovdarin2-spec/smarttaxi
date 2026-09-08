# Local release QA pass — 2026-09-08

This is evidence from an isolated local Docker development stack only. It
does not authorise or imply a production deployment.

## Environment and seed

- Started the existing local stack with `docker compose up -d --build`;
  no volumes were removed.
- `api`, `web`, `postgres`, and `redis` were healthy.
- `GET /api/health/ready` on `127.0.0.1:4001` reported development mode,
  database `ok`, Redis `PONG`, and OSRM `ok`.
- Ran the development seed inside the local API container. It created only
  local test roles and approved the seeded test driver for all 13 active
  regions.

## Full live smoke result

`API_URL=http://127.0.0.1:4001 npm --prefix apps/api run smoke:full` passed:

- health, map diagnostics, address search/reverse lookup, OSRM route, and
  backend fare estimate;
- local dev-SMS registration and authenticated client flow;
- dispatch, driver discovery, all driver trip transitions, completion,
  payment, and rating;
- driver availability, incoming-order, rejection, active-order protection,
  earnings, and driver documents.

The first run revealed that the smoke test treated a bare settlement name
(`Бирлик`) as a valid selectable address. That contradicts the product rule:
a rider may only confirm a street with a house number or a real POI. The
smoke assertion now verifies the public search endpoint never offers the
bare settlement itself. Address completeness remains governed by the
separate official-registry audit rather than inventing a town-centre address.

## Regression checks

- `npm --prefix apps/api test` — passed, including address data and address
  selection checks for all 13 regions.
- `npm --prefix apps/web run build` — passed. Vite reports the existing
  large MapLibre chunk warning; it does not fail the build.
- `C:\dev\flutter-sdk\bin\flutter.bat analyze` — no issues.
- `C:\dev\flutter-sdk\bin\flutter.bat test` — 131 tests passed.
- `docker compose config -q` — passed.

## Remaining external release blockers

1. The approved regional address registry is still missing. It must provide
   `rka`, `label`, `lat`, and `lng` plus a separately versioned `meta.json`
   checksum for every region. The supplied Pavlodar spreadsheet is not a
   substitute and was not imported.
2. Production SMS sender configuration, merchant/payment activation, legal
   decisions, external licences/contracts, and platform-store credentials are
   intentionally outside this repository and this QA pass.
3. A physical-device visual QA pass remains required for the native map's
   style layers, labels, markers, camera pitch, and route annotation. It was
   not claimed here because no authorised, stable Android device session was
   available during this pass.
