# Booking and trip presentation — 2026-09-09

## Result and scope

Continues the account/driver presentation pass from `03a6c6a`. Reference boards
1 and 3 were visually reviewed again: map-first booking, clearly comparable
tariffs, recognizable assigned vehicle, compact trip details. SmartTaxi's own
vehicle artwork, supported tariffs, real prices in KZT and business actions
are preserved. This is not a declaration that every screen is ideal or that
all release gates are closed.

### Web

- Tariff cards now separate the vehicle, title/description, price and selection
  control. The price no longer competes with the title for a narrow column.
  Removed the unsupported “Оптимальный” badge and mixed clock glyph.
- Shared `TripDriverCard` shows the actual driver, available avatar/rating,
  phone action, model/color and registration number during assignment, travel
  and trip details. Missing data never becomes a fabricated car or plate.
- Removed hardcoded fallback vehicle/plate, two-minute ETA, 0.4 km distance,
  default city and invented/truncated order ID from trip details. The public
  ID is retained when supplied by the server; otherwise the full ID is shown.
- Pickup information uses the actual pickup route, labels a fallback estimate
  approximately, and distinguishes arrival and a completed pickup leg.
- Trip details use calmer typography, wrapped addresses, compact label/value
  rows and clear secondary/cancel actions. Added Escape, focus trapping and
  restoration. Price/payment is a consistent two-column summary in live trips.
- Details/contact actions appear ahead of optional quick-message chips in the
  found-driver state. Secondary details no longer looks like a second primary
  call-to-action.

### Flutter Android

- New shared `TariffChoiceCard` keeps vehicle art, name, real fare and selected
  radio readable. Six new widget cases cover 280/320dp and text scales 1/1.5/2.
- Compact active-trip contact card retains vehicle model/color, not only the
  name and plate. Rating stars use the shared star color.
- Physical phone QA revealed pickup/route geometry obscured by the tariff
  sheet after a post-bounds-fit camera tilt. Removed that second camera update
  so the bounds fit can retain its measured sheet insets. This is a **candidate
  camera correction awaiting device confirmation**, not a verified map fix.
  Home/address exploration retains its pitched view. Route geometry, route
  layer, buildings and marker artwork were not modified.

## Files changed

- Web: `apps/web/src/features/client/ClientApp.jsx`,
  `TripDriverCard.jsx`, `tripPresentation.mjs`; `apps/web/src/presentation.css`.
- Web checks: `apps/web/tools/smoke-client-ui.mjs`,
  `smoke-driver-ui.mjs`, `trip-presentation.test.mjs`.
- Mobile: `apps/mobile/smarttaxi_app/lib/features/passenger/passenger_shell.dart`,
  `lib/core/widgets/tariff_choice_card.dart`, `test/tariff_choice_card_test.dart`.
- This report and the selected screenshots/lifecycle evidence below.

## Verification

- Web unit tests: **53 passed**.
- Web production build and local Docker web rebuild passed. Existing bundle
  size warning remains; it was not suppressed.
- Client browser smoke passed at 390×844 and 360×740: home, search, map point,
  region movement, stale reverse-response protection, tariffs, on-screen order
  action, no clipped tariff labels, payment keyboard behavior, unresolved-address
  recovery. Two stale baseline checks were corrected to current shared accent
  color and the existing consolidated marker SVG; the marker was not changed.
- Driver/passenger browser smoke passed on the local **built nginx web**, with
  authenticated seed driver and separately registered local dev-SMS passenger.
  Real incoming order → accepted → going → arrived → waiting → trip → complete
  → paid; failed actions preserve state; unpaid recovery; GPS denial/retry;
  actual pickup/dropoff routing and loaded map car/finish flag; current driver
  plate/model and public order ID; details keyboard focus. Test GPS is simulated
  browser input, **not a physical drive**. No production accounts or payments.
- Flutter analyze: no issues; Flutter tests: **142 passed**, including existing
  viewport tests and the six new tariff cases.
- Android debug APK build passed. Existing Gradle/AGP/Kotlin future-support
  warnings remain; no validation checks were bypassed.
- Docker Compose config and `git diff --check` passed.
- API code/schema/migrations were not changed; the full API unit suite was not
  rerun for this presentation pass. The real local API was exercised by QA.

## Physical phone: what actually happened

ADB detected the connected Xiaomi device. The first rebuilt APK installed with
`Success`. Through normal UI login to the seeded local client, checked:
login, detected region, home/GPS-derived pickup, address-search screen, map-point
selection, routed tariff comparison with both bundled v3 vehicles, and payment
selection. No order was submitted on this phone during this pass.

On this physical screen the 420 m route was partially hidden beneath the tariff
sheet. After making the camera change, a second APK was built, but reinstall
returned **INSTALL_FAILED_USER_RESTRICTED: Install canceled by user**. The
restriction was not bypassed. User confirmation has been requested.

Therefore the phone has the **new tariff/driver presentation but the previous
camera behavior**, not the final APK below. Do not use its screenshots as proof
that the final camera correction passed. Native active-trip contact changes
are analyzed/tested but have not yet received physical lifecycle visual QA.

Latest candidate APK:
`apps/mobile/smarttaxi_app/build/app/outputs/flutter-apk/app-debug.apk`

- 288,740,280 bytes
- SHA256 `91c76d9c852075ea387d3e8f931832a2d32dc044327a463631966906a871a079`
- API/socket `http://192.168.8.135:4001`, web `http://192.168.8.135:5175`
- Local QA debug build, **not production/release-signed**.

## Evidence

- [Web tariffs, 360px](evidence/booking-design-2026-09-09/web-tariffs-360.png)
- [Web driver found, 360px](evidence/booking-design-2026-09-09/web-driver-found-360.png)
- [Web active trip, 360px](evidence/booking-design-2026-09-09/web-active-trip-360.png)
- [Web trip details, 360px](evidence/booking-design-2026-09-09/web-trip-details-360.png)
- [Local web lifecycle evidence](evidence/booking-design-2026-09-09/web-lifecycle-result.json)
- [Phone home](evidence/booking-design-2026-09-09/android-home.png)
- [Phone address-search screen](evidence/booking-design-2026-09-09/android-search.png)
- [Phone map-point selection](evidence/booking-design-2026-09-09/android-map-point.png)
- [Phone tariffs — before camera correction](evidence/booking-design-2026-09-09/android-tariffs-before-camera-fix.png)
- [Phone payment selection](evidence/booking-design-2026-09-09/android-payment.png)

## Next acceptance work

1. Confirm the normal Android install prompt, install the latest APK and repeat
   the same physical route. Both endpoint markers and all route bends must be
   above the expanded tariff sheet; then verify collapsed sheet and rotation.
2. Physical local passenger/driver lifecycle, including the compact contact card,
   navigation, arrival, completion, errors and large text. Browser lifecycle
   coverage does not replace this device check.
3. Continue full state-by-state web/mobile visual acceptance, including dark
   mode, long localized labels and supplementary account states. Consolidate
   legacy CSS only with visual regression coverage.

Existing external blockers remain: valid regional RKA coordinate datasets with
checksummed metadata, business/legal decisions, merchant and SMS sender setup,
iOS signing/distribution, external licenses and exact building facade data.
No unavailable dependencies have been represented as completed.
