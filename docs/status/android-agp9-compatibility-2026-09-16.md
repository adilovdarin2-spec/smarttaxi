# BaiSapar Android AGP 9 compatibility pass — 2026-09-16

## Result

The Android build was moved from the soon-to-be-unsupported Gradle 8.14,
Android Gradle Plugin 8.11.1 and Kotlin 2.2.20 set to the verified compatible
set below:

- Gradle 9.6.0;
- Android Gradle Plugin 9.4.0;
- Kotlin Gradle Plugin 2.3.20;
- Java/Kotlin target 17;
- target/compile SDK 36 remains unchanged.

The migration follows the official AGP compatibility matrix and Flutter 3.47
AGP 9 migration guidance:

- https://developer.android.com/build/releases/about-agp
- https://developer.android.com/build/releases/agp-9-4-0-release-notes
- https://docs.flutter.dev/release/breaking-changes/migrate-to-built-in-kotlin/for-app-developers

## Dependency compatibility work

`file_picker` 8 compiled its Android module against SDK 34 and therefore failed
AGP 9 metadata validation after the toolchain update. It was updated to 13.1.0
and the owned document picker was migrated to the current static API.

That package's current Windows support requires `win32` 6, so the directly
conflicting packages were updated as one bounded compatibility set:

- `share_plus` 10.1.4 -> 13.3.0, with the three call sites migrated to
  `SharePlus.instance.share(ShareParams(...))`;
- `flutter_secure_storage` 9.2.4 -> 11.2.0; the existing constructor/read/write
  surface remains source-compatible;
- lockfile-selected platform packages changed only as required by those direct
  dependencies.

No unrelated package-major sweep was performed.

## Verified evidence

- `flutter analyze`: no issues;
- `flutter test`: 368/368 passed, including the new exact-version and
  compatibility-mode guard;
- the focused `android_release_policy_test.dart` run also passed 7/7;
- `flutter build apk --profile`: passed on AGP 9.4/Gradle 9.6;
- `android/gradlew.bat help`: passed on Gradle 9.6;
- generated profile APK: 159,355,871 bytes, SHA-256
  `a6c1eec712287337fa8f4aef0589fcdcc6f89328e82c8e5ab8a874966fc50cf8`;
- APK signature verification: v2 signature valid, one Android Debug signer.

The profile APK is a local QA artifact, not an owner-signed store release.

## Physical-device QA follow-up

The local profile build was installed on a connected `2409BRN2CY` Android
device with ADB reverse to the isolated development API and web services. The
following owned flows were exercised on the device without production
accounts, SMS or payment providers:

- local client login and session restoration;
- region confirmation and passenger home map;
- real building selection (`Бектасова 66`) and road-shaped route preview;
- both passenger tariffs and the payment-method sheet;
- Android system share sheet after the `share_plus` upgrade;
- Android system document picker after the `file_picker` upgrade;
- passenger stand list and stand detail.

The second cold profile launch completed in 2.245 seconds. The rebuilt local
QA APK is 192,179,183 bytes with SHA-256
`6d6803ef79b72ca3054c65cf0d8529246257e9e4a7bb9f07f84e9ab804198dfc`.

Physical QA exposed one bounded stand UX defect: an empty stand still told the
rider to call a driver. `PassengerStandSheet` now renders that instruction only
when a `BOARDING` vehicle is actually offered. Widget coverage verifies both
the populated and empty queue states, and the corrected empty state was
rechecked on the profile build installed on the phone.

## Remaining upstream migration risk

Flutter 3.47 and AGP 9 support built-in Kotlin, but the currently resolved
published versions of `flutter_tts`, `image_picker_android`, `maplibre_gl`,
`sentry_flutter` and `url_launcher_android` still apply the legacy Kotlin
Gradle Plugin. The application therefore deliberately remains in Flutter's
documented compatibility mode:

- `android.builtInKotlin=false`;
- `android.newDsl=false`;
- the app continues to apply `kotlin-android`.

This configuration builds now, but AGP 10/future Flutter versions will remove
the compatibility path. The flags must be removed together only after every
resolved Android plugin has migrated. Forking or silently patching third-party
plugins was not used as a substitute for an upstream release.

## Acceptance still outside this pass

Moving GPS/navigation, audible TTS, background behavior across OEM power
management and the complete two-phone rider/driver lifecycle remain physical
field acceptance items. Production Firebase, owner release signing, SMS,
payments, legal/store inputs and official regional address exports remain
external blockers described in the main release audit.
