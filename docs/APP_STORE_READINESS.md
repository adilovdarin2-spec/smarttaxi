# App Store readiness

This repo is closer to Android pilot readiness than iOS store readiness.

Human-only actions (accounts, payments, physical signing) are tracked
separately in
[RELEASE_CHECKLIST_HUMAN_ACTIONS.md](RELEASE_CHECKLIST_HUMAN_ACTIONS.md) —
this document covers only what the code/config itself is ready for.

## Android

Current Android hardening (verified 2026-07-15 against
`apps/mobile/smarttaxi_app`, read-only):

- package id is `kz.smarttaxi.app`;
- target SDK is `35`, `minSdk` follows Flutter's own default
  (`flutter.minSdkVersion` in `build.gradle.kts`, not pinned separately);
- app is portrait-locked in `AndroidManifest.xml`;
- release cleartext HTTP is disabled (`network_security_config.xml`
  `cleartextTrafficPermitted="false"` + manifest placeholder);
- release signing reads `android/key.properties` when present, and
  **the release Gradle task now fails hard if that file is missing**
  (`build.gradle.kts` throws `GradleException` — stronger than just
  silently signing unsigned);
- production API default is `https://api.smarttaxi.kz` **only when
  explicitly passed via `--dart-define`** — see the build command and
  warning below;
- real, non-placeholder launcher icon/adaptive icon assets are in place
  (`assets/brand/smarttaxi_app_icon_2026.png`, wired into
  `mipmap-*/ic_launcher*.png`) — the "still needed" icon item from the
  previous revision of this doc is done;
- `google-services.json` (Firebase, for push) is present locally and
  correctly git-ignored — not itself a blocker, but see the human-actions
  doc for what governs its lifecycle;
- declared permissions (`AndroidManifest.xml`): `INTERNET`,
  `ACCESS_NETWORK_STATE`, `ACCESS_COARSE_LOCATION`,
  `ACCESS_FINE_LOCATION`, `POST_NOTIFICATIONS`. `image_picker`/
  `file_picker` (used for driver document upload —
  `driver_application_documents_screen.dart`,
  `driver_document_upload_sheet.dart`) additionally pull in
  camera/photo-library permissions via their own plugin manifests at
  build time — not visible in the app's own `AndroidManifest.xml`, but
  real and must be declared in the Play Data Safety form (see below).

Release key file location:

```text
apps/mobile/smarttaxi_app/android/key.properties
```

Example:

```properties
storePassword=CHANGE_ME
keyPassword=CHANGE_ME
keyAlias=upload
storeFile=C:/secure/smarttaxi-upload.jks
```

**Important (2026-07-15): a keystore already exists on this machine.**
`apps/mobile/smarttaxi_app/android/key.properties` and
`apps/mobile/smarttaxi_app/android/app/smarttaxi-upload.jks` are both
present in the working tree (dated 2026-07-05), correctly git-ignored,
and were not inspected further here (credential files aren't something
to read/print). This is good — release builds can already be signed —
but it also means **this keystore has no known backup outside this one
machine**. See the human-actions doc: back it up immediately, this isn't
something to defer.

Build AAB:

```bash
cd apps/mobile/smarttaxi_app
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.smarttaxi.kz --dart-define=SOCKET_URL=https://api.smarttaxi.kz
```

**QA note**: the `--dart-define=API_BASE_URL=...` flag above is
required, not optional. If a release build is run without it,
[app_config.dart](../apps/mobile/smarttaxi_app/lib/core/config/app_config.dart)
falls back to `https://smarttaxi-api-production.up.railway.app` — a
Railway backend, not `api.smarttaxi.kz`. As of this check, **`api.smarttaxi.kz`
itself doesn't currently resolve** (see `DEPLOYMENT_VPS.md`) — the
Railway URL is the only live backend right now. Don't submit a release
build pointed at a domain that doesn't answer; either finish standing up
`api.smarttaxi.kz` first, or deliberately release against the Railway URL
until it's ready, but pick one on purpose rather than by omitted flag.

**Payment methods — a review-honesty note, not a blocker (updated
2026-07-20, superseding the 2026-07-15 note below)**: `CASH` and `KASPI`
are both settled directly between rider and driver outside the app
(confirmed in
[payment-provider.js](../apps/api/src/modules/payments/payment-provider.js) —
`ManualPaymentProvider`). `CARD` routes to `KaspiPayProvider` — a **real**
implementation now exists (create payment, check status, refund, webhook
signature verification — see
[KASPI_PAY_READINESS_2026-07-15.md](status/KASPI_PAY_READINESS_2026-07-15.md)),
but it only activates once `KASPI_MERCHANT_ID`/`KASPI_API_KEY`/
`KASPI_API_BASE_URL` are set to real values from an approved Kaspi
partnership — none of which exist yet (no ИП, no partnership, all three
still unset). Until then, `getPaymentProvider("KASPI_PAY")` automatically
falls back to `MockKaspiPayProvider`, which fakes a `PROCESSING →
PAID/FAILED` transition after ~4s with no real gateway behind it — same
review-honesty concern as before: a reviewer or early tester could
complete a fake "successful" card payment (not fraudulent, no real charge
happens, but potentially confusing). The fix is the same either way:
hide/disable `CARD` until the real credentials are set, or surface the
mock's `note` field ("Kaspi Pay API is not connected yet...") in the UI so
it's never silently indistinguishable from a real payment. No code change
is needed to go live later — setting the 4 env vars is the entire
cutover.

Still needed before Play submission (code/config is not ready for these,
none of them are code changes I made here):

- Play Console app listing (see human-actions doc — requires the
  Console account itself);
- **proper store screenshots** — real on-device captures now exist
  (`docs/design/screenshots-real-device-driver-home-light.png`,
  `-passenger-home-light.png`, `-passenger-tariff-light.png`; taken
  2026-07-20 on a real Android device, light theme, at native device
  resolution — not the older 390px web-preview mockups, which are still
  present under `docs/design/screenshots-*.png` for reference but are
  not store-submission material). This is a real improvement but not
  full curation: only 3 of the ~5-8 screens Play/App Store listings
  typically want are covered, there's no dark-theme set, and neither
  store's exact required dimensions/aspect ratios (which vary by device
  category) have been produced — Play in particular wants at minimum a
  16:9 or 9:16 set per supported form factor. Treat this as raw source
  material a human/design pass should crop, caption, and complete rather
  than final submission assets;
- Data Safety form filled in Play Console, using the permission/data
  list above as the source (location, phone number, device identifiers,
  camera/photos for driver documents, push token);
- test account/credentials for the Play reviewer if the review flow
  requires login (register/OTP) to reach core functionality;
- real SMS provider enabled in production — `.env.example` still ships
  `SMS_PROVIDER=dev`; production needs `SMS_PROVIDER=infobip` with real
  `INFOBIP_BASE_URL`/`INFOBIP_API_KEY` (Infobip account is a human
  action, see the checklist doc).

Privacy policy / terms: already lawyer-drafted and current (see
`apps/mobile/smarttaxi_app/lib/core/legal/legal_content.dart`, dated
2026-07-06, 5 documents — terms of use, privacy policy, payment terms,
cancellation policy, safety rules) and publicly reachable at
`smarttaxi.kz/legal` via `apps/web/src/features/legal/LegalApp.jsx` —
satisfies both Play's and Apple's requirement for a live, public privacy
policy URL reachable before install. **One gap found and fixed this
pass**: the web app's `legal-content.json` (generated from the Dart file
by `apps/web/scripts/extract-legal-content.mjs`) was untracked in git —
regenerated and committed so the live site doesn't silently drift out of
sync with the source-of-truth Dart file the next time it changes. That
script isn't wired into the build (`npm run build` doesn't call it) —
worth remembering to re-run it by hand whenever `legal_content.dart`
changes, or wiring it into a prebuild step later.

## iOS

Hard blocker: the current Flutter app folder does not contain an `ios/` project. App Store release requires a generated iOS runner, macOS, Xcode, Apple Developer account, bundle id, signing, privacy strings, and TestFlight QA.

Recommended next step for iOS:

```bash
cd apps/mobile/smarttaxi_app
flutter create --platforms=ios .
```

Run this on macOS or review the generated project on macOS before committing.
