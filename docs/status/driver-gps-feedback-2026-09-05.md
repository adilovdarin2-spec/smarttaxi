# Driver GPS failure feedback — 2026-09-05

Follow-up to `57b4b7b`, local development only on `dev`.

## Confirmed issue and change

The old driver screen displayed "Готов к заказам" with no explanation when
Chromium's actual geolocation permission was denied. Its GPS error callback was
empty; publication failures were also silently swallowed. The baseline browser
regression failed with permission state `denied`, one attempted watcher and no
location writes. Baseline captures remain in ignored
`tmp-2026-09-05-captures/gps-feedback-before/`.

- Added a blue/white operational notice in the scrollable driver sheet, not
  over the road geometry. Permission denial, unavailable GPS, timeout and
  publication failure have distinct recovery guidance and a "Повторить GPS"
  action. Region/status rejection messages retain their specific meaning.
- A GPS error disposes pending publication and removes the raw local car fix;
  it does not keep retrying an obsolete fix after permission loss. A new valid
  GPS event can resume publication. A retry replaces, rather than duplicates,
  the watcher. Offline/logout removes the pending work and notice.
- Successful publication clears its warning. It still gates route updates on
  the real server acknowledgement. A failed/missing acknowledgement does not
  become an invented success. The map's idle status no longer claims readiness
  while initial location is unknown or GPS needs attention.
- No order, server availability/status, tariff, account, map renderer, car/pin
  asset or Flutter source changed. A GPS problem must not cancel a trip or
  change a BUSY driver to FREE.

## Verification

- API: dependency policy and all 36 checks passed.
- Web: 31 unit tests passed (five new feedback/error-lifetime checks).
- Normal root-context Docker web build passed; web alone was recreated from
  `smarttaxi-web`. API/PostgreSQL/Redis and volumes were retained.
- Client address/tariff/payment UI smoke passed again at 390px/360px.
- New GPS browser smoke passed: real permission denial, all five tabs' warning
  and retry visibility, blocked road-event submission without GPS, actual
  permission recovery, injected local GPS 503, real recovery at the latest
  coordinate, a single watcher and clean offline disposal.
- Full paired driver/passenger lifecycle passed with real permission revocation
  during an accepted trip, BUSY/assignment/action preservation, retry, delayed
  GPS publication, trailing route refresh and complete cash/manual payment.
  Final local test order: `2be723f4-0b2a-4fba-a06e-cf80d788bc8a`.
- Screenshots visually inspected at 360px. No uncaught browser errors. Sanitized
  JSON was scanned for token/password patterns before staging.

The first lifecycle permission-revocation attempt did not clear Playwright's
existing permission grant. The test was corrected to clear the isolated
context's permissions before denying geolocation and to assert the browser's
actual `denied` state. Its unsuccessful run remains in ignored
`gps-feedback-lifecycle/`; final evidence comes from the complete corrected run
in `gps-feedback-lifecycle-final/`. No assertion timeout was increased.

Flutter was unchanged; its last verified baseline remains 62 tests, clean
analysis and a local debug APK. This browser-only pass cannot replace physical
Android GPS/resume/navigation acceptance; the existing device install restriction
and commercial/registry/SMS/merchant/license/iOS blockers remain unchanged.

## Evidence

- [Permission denied](screenshots/2026-09-05-gps-feedback/gps-denied.png)
- [Road tab without GPS](screenshots/2026-09-05-gps-feedback/gps-denied-road.png)
- [Location publication failed](screenshots/2026-09-05-gps-feedback/gps-publication-failed.png)
- [Location recovered](screenshots/2026-09-05-gps-feedback/gps-recovered.png)
- [GPS loss during an active trip](screenshots/2026-09-05-gps-feedback/lifecycle/driver-gps-denied-active.png)
- [GPS assertions](screenshots/2026-09-05-gps-feedback/result.json)
- [Full lifecycle assertions](screenshots/2026-09-05-gps-feedback/lifecycle/result.json)
- [Real location/route responses](screenshots/2026-09-05-gps-feedback/lifecycle/network.json)

The accepted-trip screenshot also contains the existing deliberately injected
profile-refresh failure banner. It is not a real backend outage or a GPS message.
All permission changes were confined to disposable headless Chromium contexts,
not the user's browser profile or connected Android phone.
