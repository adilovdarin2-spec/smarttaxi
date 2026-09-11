# SmartTaxi — screen redesign and local visual acceptance, 2026-09-06

This is a verified redesign increment on `dev`, starting from `676622e`, not a claim that every possible screen/state is perfect or that production release is approved. Existing commits, legacy statuses, schema/migrations and address datasets were preserved.

## Design changes

- Shared premium blue/white treatment: quieter typography, neutral borders/backgrounds, compact white cards, reduced shadows, solid primary actions and restrained selected states.
- Passenger: home/address/search/route/tariff/payment surfaces, account lists, empty sections, header/back affordance and wallet controls. Economy and Delivery use matching original photographic vehicle illustrations on Android and web. Existing tariffs and KZT pricing remain authoritative.
- Driver: map-first Line screen; compact shift, statistics, incoming-order and account components. The primary next-trip action is fixed above bottom navigation, independent of scroll position. Completed-trip settlement no longer sits below an obsolete map.
- Web account/profile/settings/application styling follows the shared treatment. Settings account/notifications/safety rows now navigate; the header bell opens notifications. Payment descriptions list actual enabled options, not an unsupported Kaspi promise.
- Physical QA exposed and fixed: clipped Android price adjustment, a 29px driver button overflow at enlarged Russian text, home pickup hidden behind the sheet, main driver action below a long order card, English Economy/Delivery labels, and a pickup caption still shown on the destination leg.

The image assets and exact two-generation prompt set are documented in [vehicle artwork provenance](../../design-reference/vehicle-artwork-2026-09-06.md). Built-in ImageGen was used for these two original assets, not for screenshots or fake product evidence.

## Native camera correction

The installed app visibly hid the pickup on the home screen. `maplibre_gl` 0.21 Android forwards `scrollBy` to native map-content translation; the old helper used document-scroll sign semantics. The sign is corrected, with a generation guard preventing an older two-step fit from applying its second shift after a replacement fit. The actual phone subsequently displayed the pickup above the panel. Zoom/pitch, approved marker geometry, route endpoints and the driver annotation renderer were not replaced.

Implementation references: [native Android scrollBy](https://github.com/maplibre/maplibre-native/blob/main/platform/android/MapLibreAndroid/src/main/java/org/maplibre/android/maps/MapLibreMap.java), [native transform moveBy](https://github.com/maplibre/maplibre-native/blob/android-v11.7.1/src/mbgl/map/transform.cpp). Local pinned Flutter plugin source was also inspected. The regression test now models native content translation, not the previous incorrect assumption.

## Actual local checks

Only `http://127.0.0.1:4001` development API/socket and `http://127.0.0.1:5175` Docker web were used for authentication/orders. Phone: Xiaomi 2409BRN2CY, Android 16, 720×1640 physical / 360dp wide; no emulator. APK updates retained app data. Intermittent `INSTALL_FAILED_USER_RESTRICTED` failures were retried normally; no device security setting was bypassed.

| Surface | Evidence in this pass | Qualification |
|---|---|---|
| Android entry/location | Real local phone/password sign-in and GPS-region confirmation | No production account/SMS |
| Android home/search/tariffs/payment | Actual address/POI, route, two vehicle choices and payment sheet | Pickup visible; full price control/payment/CTA visible on 360dp |
| Android account sections | Profile, wallet, favorites, history, notifications, recurring, promo, drivers, support, FAQ, about, settings | Actual populated or empty local state; not all nested forms submitted |
| Web account sections | 15 sections at 390×844 and 360×740; settings navigation/bell verified | Fresh real development registration; no payment/legal writes |
| Web order preview | Existing client smoke passed: picker, region, tariff, payment and unresolved-address handling | Real local API; explicitly intercepted error case |
| Web paired trip | Incoming → accept → going → arrived → waiting → trip → complete → PAID | Local order `7017e5c1-03bd-40d6-83d5-9fc4a036798f`; browser GPS is an explicit fixture |
| Web recovery | Failed accept/reject/cancel/no-show, permission loss/retry, trailing/delayed GPS, unpaid reload recovery | Assertions on actual local API/UI state, not screenshots alone |
| Android driver | Line/online, incoming, accepted, going, arrived, waiting, trip, full-screen navigator and completed settlement | Local order `021fe5a2-931b-401f-a02a-223e6a9d559b`; UI-only test, not a real journey |
| Android fixed action | Arrived/wait/start/complete actions visible without scrolling; active order recovered across APK update | Same original state-machine callbacks, no status bypass |

The [evidence index](evidence/screen-redesign-2026-09-06/README.md) contains 64 actual screenshots and two non-secret browser result files. Final installed Android home, tariffs, payment and settlement were recaptured. Earlier account/lifecycle captures are labelled as intermediate in the index, not pixel-identical final goldens. The older `android-2026-09-06` evidence was not overwritten.

The native QA cash-receipt action was performed in the app; the rating/paid screen appeared, then Done dismissed it. The counterpart's active-order API returned `order: null`. The driver Line screen showed `Не на линии` / `Выйти на линию` before switching through the normal drawer to passenger mode. The phone was left on a local passenger tariff preview without placing another order. No real journey, payment or rating was submitted.

## Tests and builds

- API: dependency policy plus all 36 API checks passed without requiring the live database test executor.
- Web: 46/46 tests; Vite production build passed in the rebuilt Docker image and with `npm --prefix apps/web run build`.
- Flutter: 122/122 tests; `flutter analyze --no-pub` reports no issues.
- New real-widget tests cover driver cards (360/390, ru/kk, light/dark, enlarged text), empty states through 200% text, and a fixed trip action through 200% text. Source guards moved with the extracted route-caption helper; approved marker geometry checks remain.
- `docker compose config -q`: passed. Local readiness: development/ok; PostgreSQL, Redis and OSRM healthy. MapTiler remains unconfigured; no new contract/provider was invented.
- Final debug APK build flags: `API_BASE_URL=http://127.0.0.1:4001`, `SOCKET_URL=http://127.0.0.1:4001`, `WEB_BASE_URL=http://127.0.0.1:5175`. Card payments remain disabled.
- Final installed APK SHA-256: `2615e72f9a99764b730c6419ad0961d1c2be4cd70b10ffa2543f9864f6495b17`. The installed `base.apk` was pulled from the path returned by `pm path`; its hash exactly matches the final local build.

## Remaining acceptance — explicit, not hidden

- Full native passenger waiting/in-trip/receipt and nested account/editor/application/error states still need current-build paired visual coverage. Shared components and web coverage do not certify every native state.
- Native driver Line-map annotation route is still visually heavier than the passenger style-layer route. Its label/marker ordering needs the documented dedicated renderer pass; this redesign did not migrate it blindly. Full-screen navigator and overview also use different map presentations.
- Real movement, background/resume, GPS/speed accuracy, permission revocation and spoken navigation require controlled physical-device route testing. The local UI lifecycle is not evidence of a real drive or money received.
- Web/mobile settings functionality still differs (for example native language/dark-theme controls); a visual styling pass alone does not close this functional parity.
- Public OSRM capacity/live traffic, flagged regional road detours and authorized deployment/release-signing acceptance remain as listed in [release remaining](RELEASE-REMAINING-2026-09-05.md).
- External: eligible official regional RKA registry + checksum metadata, operator/legal approvals, SMS sender, merchant, licensing/contracts, iOS/Mac/store requirements. The ineligible Pavlodar XLSX was not imported. Wallet/card-binding scaffold was not treated as a live merchant.
- Non-blocking Gradle/AGP/Kotlin future-support warnings and the large web MapLibre chunk remain. An auxiliary Flutter-web build attempt failed in the current plugin stack; it was not used as evidence or confused with the shipping React web build.
