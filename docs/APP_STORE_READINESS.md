# App Store readiness

This repo is closer to Android pilot readiness than iOS store readiness.

## Android

Current Android hardening:

- package id is `kz.smarttaxi.app`;
- target SDK is set to `35`;
- app is portrait-locked in `AndroidManifest.xml`;
- release cleartext HTTP is disabled;
- release signing reads ignored `android/key.properties` when present;
- production API default is `https://api.smarttaxi.kz`.

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

Build AAB:

```bash
cd apps/mobile/smarttaxi_app
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.smarttaxi.kz --dart-define=SOCKET_URL=https://api.smarttaxi.kz
```

**QA note (2026-07-15)**: the `--dart-define=API_BASE_URL=...` flag above
is required, not optional. If a release build is run without it,
[app_config.dart](../apps/mobile/smarttaxi_app/lib/core/config/app_config.dart)
falls back to `https://smarttaxi-api-production.up.railway.app` — a
Railway backend, not `api.smarttaxi.kz` — so "release builds should use
https://api.smarttaxi.kz" (per `SECURITY_CHECKLIST.md`) is only true when
this exact command is used. Worth double-checking the actual build script/CI
step passes both `--dart-define` flags before any Play submission.

Still needed before Play submission:

- real launcher icon/adaptive icon;
- production upload keystore;
- Play Console app listing;
- screenshots;
- privacy policy URL;
- data safety form;
- location permission disclosure;
- test login account for review if required;
- real SMS provider enabled on VPS.

## iOS

Hard blocker: the current Flutter app folder does not contain an `ios/` project. App Store release requires a generated iOS runner, macOS, Xcode, Apple Developer account, bundle id, signing, privacy strings, and TestFlight QA.

Recommended next step for iOS:

```bash
cd apps/mobile/smarttaxi_app
flutter create --platforms=ios .
```

Run this on macOS or review the generated project on macOS before committing.
