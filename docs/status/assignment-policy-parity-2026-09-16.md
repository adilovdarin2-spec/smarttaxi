# Assignment policy parity — 2026-09-16

## Confirmed defect and correction

The real, rollback-only local database check reproduced ten policy bypasses:
both price-negotiation acceptance paths assigned an order despite each of these
conditions, while direct acceptance correctly refused it:

- Driver debt above the existing 15,000 KZT limit.
- Driver's current region changed after the offer.
- This driver had previously cancelled this order.
- Passenger blocked the driver after the offer.
- Driver blocked the passenger after the offer.

`order-dispatch.service.js` now runs one assignment-policy check on all three
acceptance paths, after locking the current driver/order and before mutation.
It preserves destination-region approval checks, valid source statuses, debt
limit/boundary and the transactional stand release from the previous stage.
The passenger acceptance path also handles an order disappearing before its
second locked read with `ORDER_NOT_FOUND` rather than a null dereference.

Web and Flutter display audience-specific refusal copy instead of a generic
connection failure. Passenger copy does not describe driver debt or personal
blocks. Flutter adds RU/KK/UZ/ZH strings; existing driver debt/region strings
are reused. A real 320px browser screenshot revealed a detached currency sign
in the price-offer card: the formatted amount and KZT sign now stay together.
The offer error is announced as an alert.

## Verification

- API full test suite and syntax check passed. Optional local gazetteer lookup
  logged an unavailable port 5434 during the fallback unit test; exit was zero.
  This is not evidence of a functioning production registry or push service.
  Follow-up: supplied the already available injected empty gazetteer executor
  to that deduplication test. Targeted check and full API suite passed again
  without the accidental database connection or ECONNREFUSED warning. Runtime
  routing code is unchanged.
- Web: 180/180 tests; build/map build check passed; Docker API/web rebuilt.
- Flutter: analyzer clean; 354/354 tests; profile APK built and signature v2
  verified (one signer). Existing Gradle/AGP/Kotlin future-support warnings remain.
- Docker Compose config valid; no volume deletion or production QA writes.
- Extended `price-offer-check.js`: ten changed-after-offer refusals preserve all
  mock state; both negotiation paths accept the exact 15,000 debt boundary.
- `stands-negotiation-db-check.js`: all 15 policy refusals on three paths;
  permitted assignment, queue promotion, pending/confirmed reservation release,
  decline preservation and transaction rollback passed. Fixtures rolled back.
- `stands-negotiation-http-check.js`: actual development logins/SMS, confirmed
  stand booking and actual price offers. Blocking after the offer makes both
  acceptance routes return 403 without losing the booking. Unblocking permits
  acceptance, releases the stand and delivers the committed cancellation over
  the passenger's authenticated WebSocket. Scoped local QA cleanup completed.
- Optional real browser mode of that tool passed at 320 and 390px using actual
  local API state: correct refusal text, no horizontal overflow, both actions
  reachable by scrolling. Screenshots:
  `%TEMP%/baisapar-assignment-policy-qa/rider-refused-320.png` and
  `%TEMP%/baisapar-assignment-policy-qa/rider-refused-390.png`. Both inspected visually.
- `driver-shift-race-db-check.js`: seven driver lock races and three atomic
  driver/queue/confirmed-seat release barriers passed again.

## Android artifact

`apps/mobile/smarttaxi_app/build/app/outputs/flutter-apk/app-profile.apk`

- Bytes: 191163229.
- SHA-256: `4ca03733b13697c2e1ba382039b29f76260a47512ed67361695a3aa8aa11d7e3`.
- Temporary Railway API default; profile/QA artifact, not a store release.
- Not installed or exercised on a phone: this run remains without a phone.

## Release boundary

This stage fixes verified assignment-policy defects; it is not an all-screen,
all-region or zero-bug certification. SMS/payment/operational setup, official
address completeness, field navigation and physical-device performance QA
remain unclosed. Production rollout verification is recorded below after the
deployment finishes; no production account/order/stand mutations are used.

## Published and read-only verified

- Code commit `adbd715`, pushed to `origin/dev`.
- API deployment `f91001c3-decb-49b5-9903-66a4d690dc18`: SUCCESS.
- Web deployment `5fa4f78c-de5d-4ce1-a6df-b9f5c4997bf3`: SUCCESS.
- Remote dispatch service SHA-256 matches local:
  `f528338b24157d45a4a6da92547d893a9aa3c991b67f2cdfc0a9bb029428aa15`.
- Public web HTTP 200, entry `index-BhS1qZUo.js`, stylesheet
  `index-BaMO6TPp.css`. Public `standOutcome-ZjKrhID4.js` contains the new
  refusal copy and `ClientApp-ROp36mG7.js` the unbroken amount markup.
- Public `/api/health/live` HTTP 200. Readiness remains 503 with missing SMS;
  DB, Redis and OSRM are healthy. No gate or production setting was bypassed.
- Read-only stand accounting: 0 live entries, 0 counter mismatches,
  0 overcommitted entries, 0 counter-overcapacity entries. This verifies current
  stored consistency, not a real operating day's stand capacity.
- The final fixture-only routing test adjustment is not production runtime code
  and does not require another deployment.
