# BaiSapar: stand GPS freshness and screen lifecycle — 2026-09-16

## Confirmed problems and fixes

- API `touchPresence` previously updated `last_seen_at` for a heartbeat with
  null coordinates. An open app with no GPS could therefore retain a queue
  place indefinitely. Unknown/invalid coordinates now return `inside: null`
  without changing the last valid position, last-seen time or outside timer.
  Valid inside/outside fixes keep their existing behaviour; no schema or
  queue timeout changes were made.
- Flutter could use `initialPosition` (including a region centre), or a cached
  position after GPS failed, to join and renew a place. These coordinates now
  serve only as a list-sorting hint. Joining and presence use a finite device
  fix at most 30 seconds old, with reported accuracy at most 60 metres. Future
  timestamps beyond five seconds are rejected. Web uses the same bounds.
- The native offer submission rechecks GPS after the sheet closes and awaits
  an already-running location request. Losing permission during a sheet or
  concurrent refresh cannot fall through with the old fix.
- Browser watches can stop emitting when parked. The driver screen now asks
  for actual fresh device fixes while the stands tab is open, as it already
  does during navigation. It does not generate synthetic GPS timestamps.
- Presence publication is single-flight. The screens explain missing GPS;
  an old outside-zone warning is not shown as a current fact after GPS loss.
  No distance is shown from a cached region-centred list without fresh GPS.
  Both the initial join button and the open web form's submit are gated.
- Native stand socket subscriptions return exact-handler unsubscribe
  callbacks. Passenger and driver screens call them on disposal, avoiding
  abandoned callbacks accumulating every time a stand screen is reopened.

These checks prevent stale/unknown coordinates in our clients; they are not
GPS attestation or a claim that a legacy/malicious client cannot submit old
numeric coordinates. The API's existing coordinate protocol remains
compatible. Location uncertainty, background permissions and a moving real
device still require field acceptance. The existing queue grace periods
(six minutes outside / fifteen minutes without signal) were not changed.

## Verification

- API suite passed, including executable `touchPresence` executor tests:
  missing/partial/null/NaN/infinite/out-of-range coordinates make no write;
  valid inside/outside fixes do write and preserve the first outside time.
- Web: 178 unit tests passed; production build and bundled map checks passed.
- Flutter: 345 tests passed. Full-screen driver test proves a region-centre
  hint cannot join, a form awaits an in-flight failed GPS request, fresh GPS
  restores joining, lost GPS publishes null, and disposal releases listeners.
  Passenger recovery test also verifies listener disposal. Location channels
  and API are test fixtures, not evidence of physical-device GPS.
- Flutter analyzer reported no issues. Docker Compose config and
  `git diff --check` passed.
- Local Docker stack rebuilt without deleting volumes. Readiness confirmed
  `development` and dev SMS before every authenticated browser QA run.
- Real local driver/passenger browser flow passed at 320, 360 and 390 px:
  inaccurate GPS blocks an already-open offer, restored accuracy permits
  joining; actual seat write survives a dropped acknowledgement; failed
  read-back blocks another write; refresh recovers; passenger booking with
  lost acknowledgement is recovered then cancelled. Finally, an actual null
  heartbeat returns `inside: null` and GET/me proves `lastSeenAt` unchanged.
  Fixtures are created through local owner/dev authentication and their
  queue entries/stands are cleaned up. No production login or order is used.
- Screenshots: `%TEMP%/baisapar-stand-recovery-qa/{320,360,390}`. The missing
  GPS warning and disabled form were visually inspected at narrow widths.

## Android candidate

Rebuilt `apps/mobile/smarttaxi_app/build/app/outputs/flutter-apk/app-profile.apk`
with the existing temporary Railway API configuration: 191,130,461 bytes,
SHA-256 `c5c11b8b21f3a92c6ede96b92cc9ddcf0c22baec4247b2215c24eabbf74c8ca8`.
APK signature verification passed (v2, one signer). This is a profile QA
candidate, not a store-signed release; no phone was used or installation
claimed. The pre-existing Gradle/AGP/Kotlin future-compatibility warnings
remain non-fatal and were not suppressed.

## Publication

Code commit `b07a792` was pushed to `origin/dev`. Railway deployments using
the existing root Dockerfiles completed with `SUCCESS`:

- API: `1dab7637-65f8-4d73-9f3a-95114fcb50a2`.
- Web: `dbd6aaa1-e3ac-47fc-bcd5-811326d0c527`.

Read-only production checks: `/api/health/live` HTTP 200; database, Redis and
OSRM healthy. `/api/health/ready` remains HTTP 503 because SMS is not
configured; the release gate was not weakened. `/order` and the current
`index-Djn85lpY.js` / `DriverApp-BhGOJGC4.js` returned HTTP 200, with the GPS
warning/freshness guard present in the served driver chunk. No production
account/queue operation or environment-variable change was made.

## Scope still open

This stage is not an all-screen release certification. It does not resolve
SMS/merchant/legal setup, complete authoritative house/entrance data, the
Maktaaral road-access finding, physical-device/background navigation QA or
store signing. See `stand-recovery-and-road-access-2026-09-16.md` and
`regional-search-and-role-qa-2026-09-16.md` for the preceding stages.
