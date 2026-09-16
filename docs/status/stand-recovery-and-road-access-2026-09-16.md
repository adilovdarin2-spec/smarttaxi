# BaiSapar: stand recovery and road-access review — 2026-09-16

## Confirmed fixes

The web and Flutter stand screens previously refreshed only after a successful
write response. If the server recorded a seat but the response was lost, the
screen retained the old count and immediately offered another seat write.
Polling responses could also overwrite newer action results.

- Stand actions are single-flight and never automatically replay a write.
- Both success and failure trigger a fresh authoritative read. A failed
  read-back blocks further mutations until a successful refresh; the current
  queue remains visible and a refresh action explains the recovery path.
- Pre-write polls and superseded reads cannot replace the reconciliation
  snapshot. Disposed screens ignore outstanding responses. Web also rejects
  responses belonging to a replaced session and handles StrictMode remounts.
- A passenger booking found in the authoritative response appears as a real
  pending reservation even when its original acknowledgement was lost.
- Flutter's open stand bottom sheet now rebuilds on live data and operation
  state changes. The previous StatefulBuilder never received these changes.
  Completing a delayed reservation closes only its own open sheet, not a
  passenger page the user has since returned to.
- Malformed mobile account/queue snapshots no longer masquerade as an empty
  reservation or queue. A disposed driver bootstrap no longer installs timers.
- Web connection errors are readable Russian text; driver recovery feedback
  scrolls into view instead of staying above an off-screen counter.

These changes do not claim exactly-once semantics for arbitrary distributed
failures: they prohibit automatic replay and require refreshed queue data
before another explicit user action. They do not invent whether a timed-out
operation committed, nor alter capacity/geofence/business rules.

## Verification

- API test suite: passed, including routing, address selection and stands.
- Web unit tests: 175 passed; production build and bundled map checks passed.
- Flutter: 341 tests passed; analyzer reported no issues.
- New full-screen Flutter test: the already-open sheet updates from four to
  two free seats after a simulated socket event, then restores a committed
  reservation with a lost acknowledgement after exactly one write. Its API
  is a fixture; Flutter's test binding blocks network tile requests (HTTP 400),
  so this test is not evidence of map-provider availability or physical GPS.
- Real local Docker/browser: create a QA stand through owner API, join through
  driver UI, commit a seat through the actual backend, drop that response,
  deny browser reads, verify blocked actions, refresh and observe exactly one
  taken seat. Then add/release normally, recover a passenger reservation whose
  response was lost, and cancel it normally. Passed at 320/360/390 px.
- Browser screenshots were inspected. Test-created stands/queue entries were
  cleaned up; no production account, order or queue was used.
- Docker Compose validation and `git diff --check`: passed.

Reusable tests/tools: `standSync.mjs`, `stand-sync.test.mjs`,
`smoke-stand-recovery.mjs`, Flutter `stand_sync_test.dart`,
`stand_api_snapshot_test.dart`, and `stand_live_recovery_test.dart`.
Browser evidence: `%TEMP%/baisapar-stand-recovery-qa`.

## Android candidate

`apps/mobile/smarttaxi_app/build/app/outputs/flutter-apk/app-profile.apk`
was rebuilt with the temporary public Railway API configuration. Size:
191,048,541 bytes; SHA-256:
`633d4d02cfc8688772a6c351bdfe0842bb2aef1d7fb17c155622ec5915628b11`.
This is a profile QA candidate, not a store-signed release. No phone was used.
The existing future Gradle/AGP/Kotlin compatibility warnings remain non-fatal.

## Maktaaral detour — not silently changed

The bounded `inspect-road-access.js` tool reproduced OSRM's single candidate:
2,568.7 m / 340.1 s. The pickup building is snapped to an unnamed road 60 m
away. The named Жумабеков street appears among nearest candidates at 79.6 m.
Starting at that street as a diagnostic still gives 1,575.5 m / 278 s; this
does not prove a legal short connection or the building's entrance.

OSM's map API returned HTTP 429; no retry loop or source edit was attempted.
The diagnostic JSON, including partial evidence, is under
`%TEMP%/baisapar-road-access-qa/road-access.json`.
No house was moved, no road was invented, and no public map was edited.
Road connectivity/access and actual entrances still need source/field
verification. OSRM snapping/alternatives semantics were checked against the
[official API documentation](https://project-osrm.org/docs/v5.24.0/api/).

SMS, merchant/legal setup, complete authoritative house data, moving-device
navigation and release signing remain the existing external acceptance gates.
