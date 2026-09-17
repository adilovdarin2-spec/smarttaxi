# BaiSapar: stand seat accounting — 2026-09-16

## Reproduced before the fix

The local development API accepted this sequence, using owner/driver login
and a passenger registered through local dev SMS:

1. A four-seat car received a pending app reservation for three seats. Both
   the passenger car card and the stand map/list still reported four free.
2. Adding two manual/phone seats succeeded despite only one unheld seat.
3. Shrinking the car to two seats succeeded despite three pending holds.
4. After confirming the three app seats, manual minus returned success and
   reduced the counter to two while the app reservation stayed CONFIRMED.

`stands-capacity-smoke.js --observe` recorded these results before changes.
The exact test stand/entries were cleaned up; no production data was used.

## Changes

- Queue entries expose aggregate `pendingSeats` and derive free seats from
  total minus confirmed/taken minus active pending holds. Stand lists and map
  counts use the same calculation. Passenger projections still exclude
  reservation identities and driver-only bookkeeping.
- Driver-only `manualSeats` identifies confirmed PHONE/WALK_IN seats. Manual
  minus cannot decrement an app reservation or mutate a closed queue entry.
  It refuses a request exceeding the manual count without partially changing
  records. No existing historical counter is automatically rewritten.
- Manual additions, capacity reduction and giving away a turn now respect
  pending holds, not just confirmed seats. Existing row locking serializes
  competing additions against the same capacity.
- Acceptance cannot confirm an expired pending request or consume another
  passenger's held capacity. Expired pending requests are omitted from live
  reads. A new reservation resolves that passenger's expired pending row so
  the unique-live-reservation index does not force a wait for the sweeper.
- Accept/cancel use entry-before-reservation lock ordering, matching departure
  and manual release. This removes their previous opposite lock order.
- Flutter derives availability using pending holds too. Web/native driver
  counters explain pending seats, disable addition when all capacity is held,
  restrict capacity choices, and disable manual minus when only app seats
  remain. The explanation is localized in RU/KK/UZ/ZH on Flutter.

## Evidence

- API full suite passed, including projection assertions for held seats and
  passenger privacy; web unit tests 178/178; web production build/map checks.
- Flutter 348/348 tests, analyzer clean, including native held-capacity and
  protected-app-seat controls at 320 px, large text, light/dark themes.
- Real local HTTP regression passes: three pending holds leave one available;
  overfilling and shrinking return 409; two concurrent requests for the last
  unheld seat yield one 200 and one 409; manual minus cannot change confirmed
  app seats; ordinary manual addition/release still works; departure clears
  the live queue and reservation; late release of the departed entry fails.
- Optional `--check-expiry` backdates only this run's own reservation using an
  explicitly loopback `STAND_QA_DATABASE_URL`. Late confirmation fails, live
  state excludes the expired hold, and the same passenger can immediately
  reserve again. It neither changes system time nor invokes a global sweeper.
- Three concurrent cancellation/departure passes returned two successful
  acknowledgements each and no live stranded reservation. This is bounded
  race coverage, not proof against every possible concurrency pattern.
- Real local web flow at 320 and 390 px: reserve all three remaining seats
  with a lost response, show pending holds and disabled addition, confirm in
  the driver UI, remove the one manual seat, verify minus disabled for the
  three app seats, then cancel from passenger UI and see the counter reach
  zero. The earlier GPS/network-recovery scenarios still pass.
- Screenshots inspected under `%TEMP%/baisapar-stand-recovery-qa/{320,390}`:
  `driver-all-capacity-held.png`, `driver-app-seats-protected.png`.
- Compose config, local rebuild without volume deletion, `git diff --check`
  passed. Test stands/entries were cleaned up.

## Aggregate integrity report

`apps/api/src/tools/stand-accounting-report.js` runs a read-only transaction
with a 15-second statement timeout. It prints only aggregate live-entry,
counter-mismatch and overcommitment counts, never personal data or row IDs.
Local post-cleanup report: zero live entries and zero mismatches. This is an
empty-state audit, not proof that historical records elsewhere were repaired.

## Published and read-only production verification

Commit `05549cf` pushed to `origin/dev`. Both Railway deployments completed
with `SUCCESS` using existing root Dockerfiles and unchanged service settings:

- API `5164747b-985f-4fd0-a27a-74bf720486f3`.
- Web `9af7ffce-f6df-486b-9987-2858f8081df8`.

Public `/order`, `index-DtxNf6vQ.js` and `DriverApp-DUaX9WB5.js` returned HTTP
200, with pending/manual seat guards present in the served driver bundle.
Readiness remains 503 solely for the existing unconfigured SMS gate; DB,
Redis and OSRM checks are healthy. No gate was relaxed.

The aggregate accounting report was also run in the deployed API container
using the existing Railway SSH access: zero live entries, zero mismatches,
zero overcommitted entries. It used a READ ONLY transaction, emitted no
personal data, and made no production reservation/account/queue writes.
An empty live queue is not a claim that all historical records were checked.

## Android candidate and remaining gates

Fresh profile QA APK:
`apps/mobile/smarttaxi_app/build/app/outputs/flutter-apk/app-profile.apk`.
Size 191,130,461 bytes; SHA-256
`0c3ab289cf347ae87cbe41ca85632a279e68ca7227847f2db16851199c2f0798`.
APK signature v2 verified with one signer. This is not a store release and
was not installed on a phone. Existing Gradle/AGP/Kotlin compatibility
warnings were not suppressed.

Unchanged gates: real-device/background/road QA, full authoritative house
and entrance data, SMS, merchant/legal setup and store signing. This pass
does not certify every queue handover/promotion/closure interleaving or
historical accounting; these must not be inferred from green unit tests.

Next queue review: receiving a transferred turn currently follows a separate
path from ordinary join. Inspect receiver online/busy status, freshness of
stored coordinates, and multi-driver promotion/swap concurrency with isolated
local fixtures before calling the full stand lifecycle verified.
