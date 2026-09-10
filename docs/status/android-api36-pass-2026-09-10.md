# SmartTaxi Android API 36 release pass — 2026-09-10

## Result

The Android application now compiles and targets Android 16 / API 36. This is
the target required for new applications and application updates submitted to
Google Play after 31 August 2026. The requirement is documented by the
[official Android Developers release guidance](https://developer.android.com/google/play/requirements/target-sdk).

## Changes

- `android/app/build.gradle.kts`: `targetSdk` 35 → 36.
- `test/android_release_policy_test.dart`: source guard for API 36, encrypted
  release traffic and owner-controlled release signing.
- Physical-device documentation now prefers loopback-only Docker plus ADB
  reverse over exposing the development API to the LAN.

## Verification

- Flutter analyze: no issues.
- Full Flutter suite: 276/276 passed, including the 4 Android release policy
  assertions.
- Debug APK build: successful with local API/socket `127.0.0.1:4001` and web
  `127.0.0.1:5175`.
- APK manifest: `compileSdkVersion=36`, `targetSdkVersion=36`, min SDK 24.
- APK Signature Scheme v2: verified with one Android Debug signer.
- USB QA artifact:
  `C:/dev/smarttaxi/SmartTaxi-release-gate-2026-09-10-USB.apk`.
- Size: 288,883,364 bytes.
- SHA-256: `8f70fc9c6a8c737ad82fb613fb40c93b4c1e757a38f1653226300619a0780399`.

This remains a development/demo artifact. Store publication still requires the
owner to verify custody and backup of the existing private upload key, plus
Play Console acceptance. No store upload was performed.

## Release bundle

- After pointing Flutter and the ignored Gradle `local.properties` at the
  existing complete SDK in `C:/dev/tools/android-sdk`, `flutter build appbundle
  --release --no-pub` succeeded. The earlier verification failure was caused by
  Flutter selecting a second SDK copy without `cmdline-tools`; the generated
  bundle itself already contained all native libraries.
- The bundle contains stripped `libapp.so` / `libflutter.so` debug-symbol
  metadata for `arm64-v8a`, `armeabi-v7a` and `x86_64`.
- `jarsigner -verify` reports `jar verified`.
- Artifact:
  `C:/dev/smarttaxi/SmartTaxi-release-candidate-2026-09-10-api36.aab`.
- Size: 102,624,707 bytes.
- SHA-256: `60a7e50aba6c8b0b42287e730d254aa9787c4f1a2d952bb8170d00c1bb1d60d3`.
- It uses the production defaults `https://api.smarttaxi.kz` and
  `https://www.smarttaxi.kz`; card payments remain fail-closed.

The signing properties and keystore remain ignored local secrets. Their
contents were not printed, copied into the repository or modified.

The `mobile` GitHub Actions job now also runs a real debug APK compilation after
analyze/tests, so a clean runner must resolve and compile the Android 16 target.
