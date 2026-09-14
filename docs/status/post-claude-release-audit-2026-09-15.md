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

### Driver trip actions are unambiguous and every stage opens at the top

The server quick-message vocabulary was previously displayed at every driving
stage. Before pickup this put a message called "Я приехал" beside the separate
state-changing action with the same label. Web and Flutter now share the same
stage policy: before pickup only "Уже еду" and "Опаздываю" are offered; arrival
messages appear only after arrival is recorded; pickup messages disappear once
the trip starts.

The built web lifecycle also exposed retained document/sheet scroll after a
stage transition. That could open "На месте" or "Ожидание" with the heading
above the visible sheet. The driver surface now resets both scroll containers
when the tab, order or status changes. The end-to-end assertion verifies that
the next heading is fully inside both the viewport and its sheet.

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
| Web tests | 167/167 passed |
| Web production build | passed; bundled MapLibre worker/map checks passed |
| Local web visual smoke | passenger home/address/tariff/payment plus complete driver/passenger order lifecycle passed at 360/390 px |
| Flutter analysis | no issues found |
| Flutter tests | 328/328 passed |
| Android debug APK | built; package/label `kz.baisapar.app` / `BaiSapar`; target SDK 36; APK Signature Scheme v2 verified with one debug signer |
| Docker Compose validation | passed |

## Local completion audit against the requested scope

| Requested area | Authoritative local evidence | Assessment |
|---|---|---|
| Backend | Complete API suite, full guarded Docker smoke, readiness and API CI job | Locally complete |
| Web | 167 tests, production bundle, MapLibre build guard and paired lifecycle screenshots at 360/390 px | Locally complete |
| Flutter Android | Clean analysis, 328 tests, compiled debug APK, manifest/signature checks and mobile CI job | Source/build complete; current physical install remains unavailable |
| Docker | Clean image rebuild without removing volumes, valid Compose config and four healthy services | Locally complete |
| Addresses | 121,361-row/13-region invariant check, strict address/POI confirmation and live local search/picker coverage | Implementation complete; official house-level coverage needs the external RKA exports below |
| Maps and markers | Label/building layer guards, real rendered route/car/finish assertions and inspected lifecycle captures | Locally complete; current native-device rendering remains a field gate |
| Routes and navigation | Minimum-duration OSRM candidate guard, 34 regional/intercity previews and live pickup/drop-off route lifecycle | Locally complete within the stated no-live-traffic/public-provider boundary |
| UI/UX and parity | Complete passenger/driver browser lifecycle, six driver destinations, matching web/Flutter quick-message policy and compact-layout tests | Locally complete; moving-device/background/TTS comparison remains a field gate |
| BaiSapar identity | Visible-copy tests, Android package/label verification and readiness identity | Complete |

This table deliberately separates source/build completion from facts that only
an attached phone, an authorized production environment or owner-supplied data
can prove. A green unit test is not used as evidence for physical GPS, TTS,
production traffic or complete official address coverage.

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
(262,396,410 bytes; SHA-256
`bb3e59eef01aa2918b0ba531a10cf07cfc361e4d34ceb060717902dbeccfd79c`).
It is a debug-signed QA artifact, not a store release.

The current machine exposed no Android device through ADB during this pass, so
the new APK was not installed and fresh physical screenshots must not be
claimed. The Windows visual helper timed out twice while acquiring the open
tabs, so the repository's local-only Playwright harness was used instead. Its
fresh screenshots under `qa_screenshots/post-claude-2026-09-15` were inspected;
that inspection found and verified the six-tab navigation, stage-scroll and
quick-message fixes above. The full built-web lifecycle used authenticated local
development APIs and OSRM for incoming order, accept, pickup route, arrival,
waiting, trip route, completion, payment and reload recovery. Browser GPS was
simulated; API responses, state transitions and routes were not stubbed.

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
