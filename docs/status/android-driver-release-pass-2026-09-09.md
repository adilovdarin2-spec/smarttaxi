# Android driver: physical QA, trip controls and daily statistics — 2026-09-09

## Verified on the physical phone

Device: 2409BRN2CY, Android 16, 720×1640. No emulator, no injected GPS.
Only local Docker development API `127.0.0.1:4001` over ADB reverse was used.
Readiness reported `env=development`, DB/Redis/OSRM healthy. No production
accounts, external SMS, merchant, money transfers or migrations were involved.

Successfully installed `SmartTaxi-navigator-USB.apk` (SHA-256
`5db1ac62e926695e05be79b193de00061e2a94207cf9da6c4cf2d83e7ca77389`).
The expired previous session recovered to login without a private-page/runtime
fallback remaining above it. Signed in through the normal seeded driver login.
Real GPS selected Мырзакент and the driver region was synchronized to the API.

Created one separate local client using the guarded `physical-device-qa.js`
dev-SMS workflow. Order `f9012863-8140-4407-bfe1-1b07092c32f5` was accepted
from the phone, driven through departure → arrival → waiting → trip → completion
→ cash confirmation in the actual UI. Final DB status: `PAID`. Driver was taken
offline through the UI; no active QA order was left behind. This is a stationary
workflow test, **not a road test or proof of live traffic-aware navigation**.

Native navigator displayed the real pickup leg (8–9 m near the test pickup),
then the destination leg (~411 m along streets, right turn in 100 m). The car
used actual phone GPS, not a fabricated position on the road. Native annotation
route layering, car assets and building geometry were not modified in this pass.

## Confirmed defects fixed in source

- Android stats omitted `RATED` rides: 10 / 7,000 ₸ versus web 13 / 9,100 ₸.
  Both endpoints now use the same injectable daily aggregation. Rating does not
  reduce totals; legacy completed states remain. After this QA ride, the phone
  visibly showed **14 rides / 9,800 ₸** from the updated local API.
- A valid 8 m / 3 s pickup route displayed `0.0 km · 0 min` in the trip card.
  Short routes now use metres and round time upward to at least one minute.
  Invalid/negative/non-finite totals are not rendered as driving estimates.
- The native fullscreen navigator had no trip action. It now uses the existing
  authorized state-machine action, keeps that button outside the scrollable
  information panel, shows saving/errors and guards order/status replacement.
- Arriving, completion, cancellation or replacement of the opened order closes
  the driving navigator back to the active trip. A standalone map preview is
  unaffected. Stale pickup ETA is hidden after arrival/waiting.
- Before pickup, the navigator no longer draws the unrelated dropoff pin.
  Fallback straight geometry is not drawn as a navigable road.

Files: `drivers.routes.js`, `driver-core.routes.js`, new
`driver-daily-stats.service.js`/check; Flutter `driver_shell.dart`,
`driver_shell_helpers.dart`, `navigator_panels.dart` and their tests.
No pricing, ledger, commission, daily time-boundary policy or source statuses changed.

## Candidate APK and remaining device gate

`C:/dev/smarttaxi/tmp-customer-handoff-2026-09-09/SmartTaxi-driver-actions-USB.apk`

SHA-256: `08ada09055843351d6a3dad25b35d58d9fa5ae6b943916c20bf8af3dd581f80a`

Debug/USB-local build; API/socket `http://127.0.0.1:4001`, web `http://127.0.0.1:5175`.
The second installation was **rejected by the phone**:
`INSTALL_FAILED_USER_RESTRICTED: Install canceled by user`. No bypass, uninstall
or repeat attempt was made. The candidate contains all source fixes above but
is **not yet installed or visually verified on the physical phone**. Confirmation
on the phone and another active-order walkthrough remain necessary.

Validation on final source: API full test chain passed without DB; Flutter
analyze clean; **210/210 tests passed**; format check unchanged; debug APK built;
Docker rebuilt/readiness healthy; `docker compose config -q` and diff checks passed.
New widget checks cover the action at 320/390 px and text scale 1/1.6, including
overflow, visibility and duplicate-tap suppression while saving.

Screenshots: [evidence/android-driver-release-2026-09-09](evidence/android-driver-release-2026-09-09).
Navigator screenshots show the **previous installed APK**, not the uninstalled
action-button candidate. The stats screenshot does demonstrate the live API fix.

## Release limits retained

This is not public-release approval. Physical QA of the new APK, safe real-road
GPS/rerouting/background-resume tests and full device coverage remain. Official
regional RKA data with coordinates/checksummed metadata, SMS sender/provider,
merchant/payment verification, legal/store/signing decisions and external
provider arrangements remain the previously documented gates. They are not
simulated or described as complete.
