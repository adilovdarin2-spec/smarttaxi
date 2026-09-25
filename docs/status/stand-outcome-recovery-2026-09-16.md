# Stand outcome recovery — 2026-09-16

## Confirmed and fixed

- Web and Flutter now explain a lost live queue place/reservation using a small authenticated, actor-scoped status endpoint. Reasons include owner closure, expiry, decline, departure, stale GPS, leaving the area, handover and taking an order. Unknown history uses neutral wording, never an invented cause.
- Recovery works through polling after a missed personal socket event. Notices are announced accessibly and clear when a new live place/booking appears. This is recovery of an item seen by the open screen, not persistent historical notifications after restarting the app.
- Reservation expiry is projected without waiting for a sweeper. A rider's earlier self-cancellation is not incorrectly attributed to a later stand closure; only matching cancellation/entry transition timestamps identify that cause. Ambiguous historical data gets neutral wording.
- Driver GET/me no longer resurrects a stale entry when closure commits between initial lookup and queue snapshot.
- Flutter closes its owned car/seat-picker modal routes when a selected stand disappears, without popping the passenger screen or issuing a reservation from the removed sheet.
- New 320px widget tests exposed real horizontal overflows (6.8px and 134px at enlarged text). Stand seat badges now sit under their title; phone/reserve/cancel actions stack when width or text scale requires it. No font shrinking or hidden overflow.

## Files

API: `stands.routes.js`, `stands.service.js`, `stands-check.js`, new `stands-outcome-db-check.js`.
Web: passenger/driver stand panels, `mvpApi.js`, `styles.css`, new `standOutcome.mjs` and its tests, strengthened `smoke-stand-recovery.mjs`.
Flutter: API client, passenger/driver stand screens, shared outcome model, RU/KK/UZ/ZH localizations and generated code, outcome/API/live-recovery/GPS tests.

## Verification

- API test suite and syntax: pass. The existing no-DB routing fallback check logs a connection warning while passing; no production DB is used.
- Web: 179/179 tests; production build and map-build check pass. Existing large MapLibre chunk warning remains.
- Flutter: 353/353 tests; analyze has no issues. Widget map HTTP 400 messages are Flutter test binding's disabled network, not a live tile-provider check.
- Docker Compose config and local rebuild: pass, existing volumes preserved.
- Local PostgreSQL outcome checks: actor isolation using another UUID, read-only expiry projection before sweep, closure, prior cancellation, departed/boarded distinctions. Fixtures are contained in a rolled-back transaction, explicit loopback QA DB required.
- Local concurrency regression: five rounds each of six simultaneous joins, departure/leave/join, owner close/join, sweep/leave/join; atomic closure barrier and boarding-slot resize pass.
- Real browser/HTTP flow at 320px and 390px: GPS gate, lost acknowledgement after actual seat write, failed reconciliation, retry without replay, pending holds, confirmed APP seat protection, cancellation, owner closure, both audience-specific explanations; unauthenticated 401, wrong-role 403, missing-resource 404. Earlier rider cancellation retains no false closure reason. No browser/React exceptions.
- Screenshots inspected at `%TEMP%/baisapar-stand-recovery-qa/320` and `/390`, including rider closure and narrow driver closure screens.

## Android candidate

`apps/mobile/smarttaxi_app/build/app/outputs/flutter-apk/app-profile.apk`

Built with the existing temporary Railway API configuration; 191130461 bytes.
SHA-256: `c320706266ecc9158797ea7c68fa2b197c89d9f3f3b762f03b4c58ea988be02f`.
APK signature verifies (v2, one signer). Profile QA candidate only; no phone used, no installation or store release claimed. Existing Gradle/AGP/Kotlin future-compatibility warnings remain.

## Remaining

Continue release verification outside this stand recovery slice, including driver shift/order state races and full end-to-end device/field scenarios. SMS, payment merchant, legal/store decisions, official coordinate-bearing address registries and licensed/live traffic data remain external gates. No universal address coverage, traffic-optimal routing or zero-bug claim follows from these checks.

Next concrete code audit: `driver-core.routes.js` online/offline currently reads availability before a standalone update; reproduce contention against order acceptance. Also compare `respondToDriverPriceOffer` and `respondToClientCounterOffer` with `acceptOrderForDriver`: the latter releases a stand place inside its transaction, while the former paths currently return no stand release. Reproduce with local fixtures before making this a separate correction. Neither issue is marked fixed by this stage.

## Publication receipt

Code/documentation commit `33aa241` pushed to `origin/dev`.
Railway deployments both report `SUCCESS`:

- API: `1f811dc2-20a2-45df-b1cb-7cbf24caa170`.
- Web: `b23bc8f8-abe4-4584-8440-ed886cef1af4`.

Public `/order` returns 200 with `index-CJvyKzqS.js`. The deployed `standOutcome-uYfVD8WF.js` returns 200 and contains the new closure/expiry explanations. Public readiness remains 503/degraded with SMS not configured; database, Redis and OSRM are healthy. Read-only production stand accounting reports zero live entries, zero counter mismatches and zero overcommitted entries. No production account/order/stand mutations were used for QA.
