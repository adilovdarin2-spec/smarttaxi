# Cancellation and favorites recovery pass — 2026-09-09

## Scope

This pass closes two ambiguous-write gaps shared by the passenger web and
Android clients. All runtime checks used the local Docker development stack;
no production account, SMS provider or payment merchant was contacted.

## Confirmed fixes

- Repeating an already-applied client cancellation is now idempotent on the
  API. Ownership and rider-phone checks still run first, while a retry can no
  longer duplicate a cancellation fee, status-history row or audit entry.
- Web and Android cancellation accept only the exact order in
  `CANCELLED_BY_CLIENT`. A lost response, 5xx, or legacy transition conflict is
  reconciled with one authoritative status read; the cancellation POST is
  never replayed.
- Android now keeps the confirmed cancelled order and renders its explicit
  cancelled state instead of jumping directly to a blank new-order screen.
- Web favorite-address reads and writes are scoped to their original session.
  Late responses cannot populate a replacement account.
- Web and Android favorite creation validate the exact server acknowledgement.
  An ambiguous create is reconciled by exact label/title/address/coordinate
  match. If it still cannot be confirmed, writes stay locked until an explicit
  successful refresh, preventing duplicate saved addresses.
- Ambiguous favorite deletion is successful only when an authoritative read
  proves the exact id is absent. The UI keeps existing data visible and offers
  refresh/retry feedback instead of inventing success.
- `stage2-smoke.js` now explicitly selects the order's region for the reusable
  seeded driver. The full smoke is therefore independent of the region left by
  an earlier browser or physical-device QA session.

## Verification

- API test suite: passed, including order lifecycle, finance, favorites,
  routing, address-selection and 13-region catalogue checks.
- Web tests: **116/116 passed**.
- Web production build and map bundle check: passed.
- Flutter analyze: no issues.
- Flutter tests: **272/272 passed**, including 14 cancellation/favorite
  response-loss and session-replacement cases.
- Docker Compose config: valid.
- `docker compose up -d --build`: API/web rebuilt without deleting volumes;
  API, web, PostgreSQL and Redis healthy.
- Local readiness: development environment, DB `ok`, Redis `PONG`, OSRM `ok`.
- Full local smoke: health, 13-region maps, routing/estimate, client lifecycle,
  driver lifecycle, payment/rating and driver documents passed.
- Visual browser check: passenger home/map, authenticated favorites empty
  state, driver login and online/incoming-order layout render cleanly at the
  current compact viewport.

## Android artifact

- `C:\dev\smarttaxi\SmartTaxi-technical-readiness-2026-09-09-USB.apk`
- API/socket: `http://127.0.0.1:4001` via ADB reverse.
- Web: `http://127.0.0.1:5175` via ADB reverse.
- SHA-256: `92b7661cf015ce7b9fd54ae5f42cf94c84abe0dc07d4d386acce039a45677b8a`
- APK Signature Scheme v2 verification: passed.
- Installation was not attempted in this pass because `adb devices -l`
  returned no connected device. No device security setting was bypassed.

## External blockers unchanged

- Real regional address registries still require `rka`, `label`, `lat`, `lng`
  and a per-region checksum `meta.json`. The Pavlodar spreadsheet is not a
  valid source for the current regions and was not imported.
- Production SMS sender/Infobip, payment merchant credentials, legal/IP and
  store/iOS work remain external owner/vendor actions. The application keeps
  those integrations disabled rather than simulating production readiness.
