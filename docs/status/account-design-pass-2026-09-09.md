# Account and driver presentation pass — 2026-09-09

## Scope and result

This is a completed, bounded design/interaction pass, **not certification that
every SmartTaxi screen is ideal or that the product is release-ready**.
Reference: the user's second design board (profile, settings, support, history),
with SmartTaxi branding and real available actions. No new merchant methods,
invented ratings, subscriptions or support availability promises.

### Web

- Passenger profile: separate identity card and grouped, working navigation to
  history, favorites, payment selection, wallet, support and settings. Existing
  editable order contact fields remain in an expandable section; they are not
  presented as a server-backed account-edit operation.
- Payment selection reuses the existing real payment options and dialog,
  including Escape, focus restoration and keyboard trapping.
- Settings: separate account/application lists, quiet surfaces, consistent icon
  wells and an independent sign-out action.
- Support: topic list → compact selected topic → message and submit. Changing
  topic retains the draft. The configured support call remains available.
  No support message was submitted during presentation QA.
- Driver: calmer login typography, full-width shift action, distinct earnings
  hero and readable supporting totals. GPS recovery stays on map-related views.
- Confirmed visual defects repaired: the driver's summary strip collapsed under
  flex pressure; the sheet grip appeared below content; inherited top+bottom
  positioning stretched the map status and attribution into white rectangles
  over roads. The map container also retained an obsolete 360px height cap.
  Attribution remains visible. Geometry, routing and marker assets are unchanged.

### Flutter Android

- Passenger profile: quieter identity card, actual phone in the header,
  expandable account details, longer names supported.
- Passenger and driver settings share `AccountActionRow`: consistent icons,
  spacing, typography, dark palette and wrapping at enlarged text sizes.
- Passenger support uses topic rows and collapses them after selection, keeping
  the existing lost-item trip selection and submission flow.
- Driver history shows pickup and destination as separate rows instead of
  squeezing both into one truncated line; account values can wrap.
- **Packaging defect fixed:** v3 vehicle images existed and were referenced in
  code, but were absent from the explicit pubspec asset list. Both are now
  bundled, decoded in tests and verified inside the actual APK zip entries.

## Checks actually completed

- Flutter analyze: no issues.
- Flutter tests: 136 passed. Five new tests cover narrow/large-text light and
  dark rows, driver history/account layout, and decoding both bundled vehicles.
  The previous source assertion still expected v2 vehicle filenames; updated
  to the active v3 assets, with real bundle-loading tests added.
- Web unit tests: 50 passed.
- Web production build passed, including the final local Docker web rebuild.
- Account browser QA: 15 sections at 360×740 and 390×844; profile navigation,
  expandable contact fields, payment dialog focus, settings links, support topic
  switching/draft retention and visible submit action passed. No page errors.
- Driver browser QA: real local seeded login; login, line, orders and earnings
  screenshots. Checked full-width CTA, summary height, compact map labels and
  horizontal overflow at 360/390. No shift/order/payment changes by the test.
  This is not a physical GPS drive or a new trip-lifecycle acceptance test.
- Docker config valid; API readiness reports development, DB OK, Redis PONG,
  OSRM OK. MapTiler key remains unconfigured.
- `git diff --check` passed.

Selected real browser screenshots:

- [Profile](evidence/account-design-2026-09-09/profile-390.png)
- [Settings](evidence/account-design-2026-09-09/settings-390.png)
- [Support topics](evidence/account-design-2026-09-09/support-390.png)
- [Support composer at 360px](evidence/account-design-2026-09-09/support-selected-360.png)
- [Driver line](evidence/account-design-2026-09-09/line-390.png)
- [Driver earnings](evidence/account-design-2026-09-09/money-390.png)
- [Driver login](evidence/account-design-2026-09-09/login-390.png)

Reusable browser checks: `apps/web/tools/smoke-client-account-ui.mjs` and
`apps/web/tools/smoke-driver-presentation.mjs`. Both require local development
readiness and accept QA_PLAYWRIGHT_PACKAGE / QA_BROWSER_EXECUTABLE overrides.

## Android artifact and remaining work

Debug APK: `apps/mobile/smarttaxi_app/build/app/outputs/flutter-apk/app-debug.apk`
(288,743,845 bytes), SHA256:
`2bed36c0928f7b8fae362d3690af3b7d2c4b9c66f04c48916ca031b29bfa5758`.
Built for local LAN API/socket `http://192.168.8.135:4001`, web `:5175`.
This is **not** a production APK or release-signing artifact.

ADB returned no attached devices at both checks. The new APK was **not installed
or visually reviewed on a phone** in this pass. No emulator was started.

Still required: device review of these exact changes (profile, settings, support,
driver history, vehicle rendering), followed by a complete final web/mobile
state-by-state visual acceptance pass, including active trips, errors, keyboard,
small screens and dark mode. Browsing a section is not equivalent to fully
accepting all its business states. The large legacy CSS cascade still needs
careful consolidation with visual regression coverage, not blind deletion.

Official coordinate-bearing regional RKA datasets and checksummed metadata,
legal/business decisions, merchant/SMS sender setup, iOS signing/distribution,
external licenses and exact real-world building facade data remain outside
this local design work. Existing documented external blockers still apply.
