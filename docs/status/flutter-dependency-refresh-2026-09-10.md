# SmartTaxi Flutter compatible dependency refresh — 2026-09-10

## Result

The Android client dependency lock was refreshed within the versions already
allowed by `pubspec.yaml`. No major map, Firebase, permission, location or
Android toolchain migration was mixed into the release-gate build.

## Updated packages

- `dio`: 5.9.2 → 5.11.1
- `path_provider`: 2.1.5 → 2.1.6
- `sentry` / `sentry_flutter`: 9.24.0 → 9.29.0
- `socket_io_client`: 3.1.4 → 3.1.6
- `uuid`: 4.5.3 → 4.6.0
- `web_socket` 1.0.1 was added as the resolved transitive transport.

## Verification

- `flutter analyze`: no issues.
- `flutter test`: 272/272 passed.
- A fresh debug APK built successfully against local API/socket
  `http://127.0.0.1:4001` and web `http://127.0.0.1:5175`.
- `apksigner` verified APK Signature Scheme v2 with one Android Debug signer.
- Artifact: `C:/dev/smarttaxi/SmartTaxi-release-gate-2026-09-10-USB.apk`
- The same post-refresh artifact was rebuilt after the native address-input
  parity fix (street-address keyboard, full-address autofill hint, and spoken
  close/clear icon tooltips).
- Size: 288,883,364 bytes.
- SHA-256: `ccd1f253826271ca88509355c3eec611b057b40f34eb33926f72a7d2c263078d`.

## Deferred compatibility work

Flutter 3.47.2 warns that future Flutter releases will require Gradle 9.1,
Android Gradle Plugin 9.0.1 and Kotlin 2.3.20. The current Gradle 8.14, AGP
8.11.1 and Kotlin 2.2.20 build is successful. That coordinated major toolchain
migration remains separate because it needs a clean build plus physical-device
regression QA and is not required by the installed stable Flutter SDK.

Both available ADB binaries still returned an empty device list after the new
build, so install, port reverse and physical-device screenshots remain an
explicit device gate rather than a claimed result.
