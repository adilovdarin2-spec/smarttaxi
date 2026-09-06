# SmartTaxi — composition, typography and map refinement, 2026-09-06

This is a verified local increment on `dev`, following the broader screen
redesign. It addresses visual issues confirmed in the real web and Android
products; it does not fabricate production readiness or external approvals.

## What changed

- Bundled the official Inter variable font for Flutter and web, included the SIL
  Open Font License, registered it with Flutter's license registry and documented
  the pinned source commit, checksums and Kazakh/Russian/tenge glyph coverage.
- Rebalanced the shared premium blue/white system: a neutral app background and
  borders, smaller headings, calmer status pills, reduced shadows, denser account
  rows and simpler primary actions.
- Rebuilt the passenger home composition as an edge-to-edge working sheet rather
  than a collection of floating marketing cards. Address, quick-action and tariff
  controls are more compact while preserving existing callbacks and KZT logic.
- Changed native address search from a cramped half-height overlay into a full
  white search surface with the existing region, query, result and selection
  semantics. A real local POI result was selected during physical QA.
- Applied the same restrained Liberty map palette on Android and web. Provider
  building extrusion is now hidden through the correct native visibility API and
  web source-layer lookup; the single SmartTaxi extrusion remains below labels,
  routes and markers with lighter blue-gray paint.
- Simplified Android startup from an oversized glowing mark to a 96dp centered
  brand icon and a quiet loading state. Driver chrome and bottom navigation now
  follow the same edge-to-edge hierarchy as the passenger UI.
- Preserved the existing native driver annotation route renderer pending its
  dedicated visual QA. No state-machine statuses, address validation, pricing or
  payment capabilities were removed or simulated.

The font artifacts and provenance are documented in
[design-reference/fonts.md](../../design-reference/fonts.md).

## Actual local QA

The Android candidate was installed on the connected physical phone, not an
emulator. The final passenger set covers startup/location-ready home, address
search, a populated result, map point selection, both tariffs, payment, wallet
and recurring-payment state. The route preview returned 1.7 km / 4 min with
Economy 700 ₸ and Delivery 800 ₸ for the selected local fixture; this is evidence
of the returned local preview, not proof of live-traffic optimality.

The web candidate was exercised at 390 and 360 CSS pixels. The passenger order
smoke, all 15 account/application sections and the paired driver/passenger trip
smoke passed against Docker development services. The trip exercised incoming,
accept, route, GPS loss/retry, going, arrived, waiting, started, completed,
unpaid-reload recovery and local CASH paid state. No production account, SMS,
merchant action or real journey was used.

The [evidence index](evidence/composition-redesign-2026-09-06/README.md) contains
110 captures/result files. It distinguishes the current Android candidate from
iteration and diagnostic captures instead of presenting every image as a final
golden.

## Verification

- API: 36/36 checks passed, including the existing 121,361 address rows across
  13 regions.
- Web: 49/49 tests and the Vite production build passed; the rebuilt Docker web
  image served the current CSS/map code.
- Flutter: 129/129 tests and clean `flutter analyze --no-pub`. New tests cover the
  startup variants and native/web map-presentation contracts.
- Docker: `docker compose config -q` passed; API, web, PostgreSQL and Redis were
  healthy, and development readiness returned `status: ok`.
- The installed debug `base.apk` matched the final local candidate at 288,722,870
  bytes, SHA-256
  `3b8b6b00c3313301b2d41ef92b24aaa62cc35d3e3cc8d533f68916dc50314846`.

## Remaining acceptance — explicit

- A DRIVER seed can enter passenger UI, but passenger wallet returns 403 and
  recurring payments return 404 because the API still enforces the account's
  driver role. Product role/switching semantics must be reconciled end-to-end;
  styling the error is not the fix.
- Current-build native passenger waiting/active/receipt and a paired native driver
  lifecycle still need fresh device captures. The complete web lifecycle and the
  prior Android pass do not certify the current APK for those states.
- Native driver route annotations remain visually heavier than the passenger
  style-layer route. Apply the documented renderer plan only after dedicated
  before/after device evidence.
- Real movement, background/resume, GPS accuracy, permission revocation and spoken
  navigation require controlled physical-route testing. Public OSRM does not
  provide production capacity or live-traffic guarantees.
- External blockers remain unchanged: eligible per-region RKA datasets with
  `rka,label,lat,lng` and checksum metadata; legal/operator decisions; merchant
  and SMS sender approval; provider contracts/licenses; iOS/Mac/store access and
  owner-controlled release signing. The ineligible Pavlodar XLSX was not imported.
