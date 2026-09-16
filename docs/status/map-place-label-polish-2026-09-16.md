# BaiSapar — settlement label polish, September 16

## Confirmed visual defect

The current real browser capture showed Liberty's settlement label behind the
pickup marker as two nearly identical lines: `Atakent` and `Атакент`. This is
the style's default `name:latin + name:nonlatin` expression. The values are
different Unicode strings, so equality-only deduplication still looked like a
duplicate to a rider.

For the known OpenFreeMap Liberty style, web and Flutter now render one local
settlement name (`name:nonlatin`) with Latin, English and generic-name fallbacks.
Only `label_*` layers sourced from `place` are changed on web; the native helper
uses the same expression only after recognizing Liberty's style signature.
Custom MapTiler/styles are not mutated. Street names, POI labels, label order,
road geometry, building footprints/heights, route geometry and markers are not
changed.

## Verification

- Web map-presentation regression verifies the exact expression, limits it to
  Liberty place labels and proves a custom style is untouched.
- Web 187/187 tests and production Docker build passed.
- Real local browser smoke passed the start/map picker/region switch/stale
  reverse response/tariffs/route/payment flow. Before and after captures were
  visually inspected at 390 px. The final `home.png` and `address-map.png` in
  `%TEMP%/smarttaxi-web-ui-qa` show a single `Атакент`; the selected real
  building, street/POI labels, route and address markers remain visible.
- Flutter map-presentation test serializes the matching MapLibre expression;
  366/366 tests and analyzer passed. Native runtime appearance still requires
  the next physical-device pass because this stage intentionally used no phone.
- Compose API/web rebuild passed. Existing large lazy MapLibre chunk and
  Gradle/AGP/Kotlin future-support warnings remain visible; no blind dependency
  upgrade was made.

## APK

Fresh Railway-default profile artifact:
`apps/mobile/smarttaxi_app/build/app/outputs/flutter-apk/app-profile.apk`

- 191163229 bytes
- SHA-256 `e0b37c979cf456420a8a9c9edceb7f6bd970cc4a671bf4c108981cc3f4843075`
- APK Signature Scheme v2 verified, one signer
- not installed on a phone; not a store-release claim

This change removes a confirmed map-label defect. It does not add missing
official addresses, certify every building, validate moving navigation or
establish provider/production capacity.
