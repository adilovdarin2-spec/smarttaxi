# BaiSapar post-Claude release audit — 2026-09-15

## Scope and execution plan

This pass audits the 45 local `dev` commits that were ahead of `origin/dev`
after the latest Claude work. It preserves those commits and checks the locally
controllable release surface in this order:

1. inspect the handoffs, branch state, deployment configuration and rebrand;
2. rebuild the isolated Docker QA stack without deleting volumes;
3. verify readiness, development seed, addresses and routing in every region;
4. run API, web, Flutter and Docker gates;
5. build a fresh Android debug candidate;
6. record remaining external and physical-device acceptance separately;
7. commit and push only confirmed fixes.

The public product name is **BaiSapar**. The Android namespace/application ID is
`kz.baisapar.app`. Internal database keys, storage keys and migration identifiers
that still contain `smarttaxi` are implementation identifiers, not visible brand
copy, and were intentionally not rewritten during the release audit.

## Confirmed fixes

### Development seed no longer corrupts region ownership

`apps/api/src/seeds/seed.js` contained an older hand-written Atameken boundary.
Running the documented local development seed therefore overwrote the corrected
canonical region geometry from migrations, causing a point in Zhana Zhol to be
priced as Atameken. The seed now reconciles every mutable region field from the
shared `REGION_SEED` source before tariff and approval data is generated. A
static regression check prevents a second region-geometry source of truth from
returning.

After rebuilding and reseeding the local API, Atameken is centred at
`40.8155, 68.5488` and its east boundary ends at longitude `68.562`. The complete
regional routing check then passed all 34 Economy/Delivery previews across 13
regions and four intercity directions, including Zhana Zhol.

### Map requests identify the current application

All native `flutter_map` tile requests now use `kz.baisapar.app` as their user
agent package name. The retired `com.smarttaxi.app` value was removed from the
passenger, driver and taxi-stand maps, with an Android policy regression test.

### Driver navigation no longer covers the shift action

The new taxi-stand destination increased the driver bottom navigation to six
items, but the compact web grid still reserved only five columns. At 360 px,
Income wrapped onto a second row and covered most of the primary "go online"
button. The grid now reserves six equal columns. The browser QA asserts that all
destinations share one row and that the shift action ends above the navigation.

### Source hygiene

The two whitespace defects found by `git diff --check` were removed. No user or
Claude changes were reset, cleaned or rewritten.

## Verification evidence

| Gate | Result |
|---|---|
| Local Docker rebuild | API and web images rebuilt; existing volumes preserved |
| Local API readiness | healthy: PostgreSQL, Redis and OSRM ready; development SMS mode |
| Docker QA smoke | passed, including minimum-ETA route candidate selection |
| Regional route/pricing smoke | 34/34 tariff previews passed |
| API test suite | passed; 121,361 address rows checked across all 13 regions |
| Web tests | 166/166 passed |
| Web production build | passed; bundled MapLibre worker/map checks passed |
| Local web visual smoke | passenger home/address/tariff/payment and driver line/orders/income passed at 360/390 px |
| Flutter analysis | no issues found |
| Flutter tests | 325/325 passed |
| Android debug APK | built; package/label `kz.baisapar.app` / `BaiSapar`; target SDK 36; APK Signature Scheme v2 verified with one debug signer |
| Docker Compose validation | passed |

The web build still reports the known large MapLibre chunk warning. Flutter also
warns that future SDK versions will require newer Gradle, Android Gradle Plugin
and Kotlin versions. Neither warning fails the current verified build; upgrades
remain compatibility work and require their own device regression pass.

## Deployment observations

The public web URL returned HTTP 200. The public API reported the BaiSapar app,
working database, Redis and private OSRM dependencies, but readiness was
`degraded` because production SMS is intentionally not configured. That is a
correct fail-closed readiness signal, not evidence that SMS exists.

The fresh debug candidate is
`apps/mobile/smarttaxi_app/build/app/outputs/flutter-apk/app-debug.apk`
(262,396,056 bytes; SHA-256
`502d98c6b28dc88cc158f0a0ff102c237d2cda99cbdc6579c541c6e7f2078fef`).
It is a debug-signed QA artifact, not a store release.

The current machine exposed no Android device through ADB during this pass, so
the new APK was not installed and fresh physical screenshots must not be
claimed. The Windows visual helper timed out twice while acquiring the open
tabs, so the repository's local-only Playwright harness was used instead. Its
fresh screenshots under `qa_screenshots/post-claude-2026-09-15` were inspected;
that inspection found and verified the six-tab driver navigation fix above.

## Work that cannot be closed by code alone

- Official per-region address exports containing `rka`, `label`, `lat`, `lng`
  and a separate checksum `meta.json`; the Pavlodar spreadsheet is ineligible.
- Infobip/SMS sender approval and production credentials.
- Merchant approval, production payment credentials and settlement acceptance.
- Firebase Android configuration for `kz.baisapar.app` and a server-side service
  account for push delivery.
- Legal entity, contracts, policy decisions, domains, store accounts, release
  signing custody and iOS/macOS/App Store work.
- Moving-GPS, permission revocation, resume/background behavior and spoken
  navigation on a physical phone and a controlled route.
- Real taxi-stand lines for every region and a multi-driver operational day.
- Maktaaral's provider detour and other road-access/safety facts that require
  on-road or authoritative-provider validation.
- Calibration of cancellation thresholds using real operational history.
- Live traffic and authoritative speed-limit data; the current routing stack
  must not be represented as providing either.

These items remain explicit external or field-acceptance blockers. They must not
be simulated to make a release report look complete.
