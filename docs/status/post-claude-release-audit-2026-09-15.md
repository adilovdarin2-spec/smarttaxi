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

### The driver shift summary remains readable at 320 px

The final narrow-screen pass found the debt total clipped inside the three-column
shift summary at 320×568. The compact breakpoint now reduces only the metric
cell padding and number size; labels, six navigation destinations and the primary
shift action keep their existing hierarchy. The reusable presentation smoke now
asserts each metric value directly, and the complete local driver/passenger
lifecycle covers 320, 360 and 390 px.

### Exact catalogued POIs now survive reverse geocoding

A live 13-region database audit found that Атамекен, Бирлик, Жана Жол, Киров
and Ынтымак currently contain real mapped POIs but no house-number rows. Before
this pass, a pin placed exactly on a catalogued school in Бирлик or Ынтымак
could be replaced by a provider's bare street and end as "Адрес не определён".
Reverse lookup now accepts a real local POI only within a strict three-metre
match, after checking for a house number. A POI five metres away still cannot
name an unrelated building. Live rebuilt-API checks returned the catalogued
school/customs POI with `fallback:false` in all five affected regions; the
eight regions with house-number data returned an exact local house at zero
metres. The repeatable local check is `npm --prefix apps/api run
smoke:regional-reverse` (run inside the API container or with equivalent local
development environment variables).

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
| Regional reverse-address smoke | 13/13 exact catalogue points passed: 8 houses and 5 real POIs |
| API test suite | passed; 121,361 address rows checked across all 13 regions |
| Web tests | 167/167 passed |
| Web production build | passed; bundled MapLibre worker/map checks passed |
| Local web visual smoke | passenger home/address/tariff/payment plus complete driver/passenger order lifecycle passed at 320/360/390 px |
| Flutter analysis | no issues found |
| Flutter tests | 328/328 passed |
| Android debug APK | built; package/label `kz.baisapar.app` / `BaiSapar`; target SDK 36; APK Signature Scheme v2 verified with one debug signer |
| Docker Compose validation | passed |

## Local completion audit against the requested scope

| Requested area | Authoritative local evidence | Assessment |
|---|---|---|
| Backend | Complete API suite, full guarded Docker smoke, readiness and API CI job | Locally complete |
| Web | 167 tests, production bundle, MapLibre build guard and paired lifecycle smoke at 320/360/390 px | Locally complete |
| Flutter Android | Clean analysis, 328 tests, compiled debug APK, manifest/signature checks, mobile CI job and current-package physical driver lifecycle | Locally complete; moving/on-road GPS, audible TTS and external release inputs remain |
| Docker | Clean image rebuild without removing volumes, valid Compose config and four healthy services | Locally complete |
| Addresses | 121,361-row/13-region invariant check, strict address/POI confirmation, exact local-POI recovery and live reverse checks in every region | Implementation complete; five regions still need official house-level RKA coverage below |
| Maps and markers | Label/building layer guards, real rendered route/car/finish assertions, browser lifecycle captures and current native navigator inspection | Locally complete; real moving/on-road visibility remains a field gate |
| Routes and navigation | Minimum-duration OSRM candidate guard, 34 regional/intercity previews and live pickup/drop-off route lifecycle | Locally complete within the stated no-live-traffic/public-provider boundary |
| UI/UX and parity | Complete passenger/driver browser lifecycle at 320/360/390 px, six driver destinations, matching web/Flutter quick-message policy, compact-layout tests and current native driver lifecycle | Locally complete; moving-device/TTS comparison remains a field gate |
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

On September 15 the Railway web origin was reachable, but its downloadable APK
was an older artifact. `api.smarttaxi.kz` and `www.smarttaxi.kz` returned 502,
while `smarttaxi.kz` and the future `baisapar.kz` name had no usable DNS result.
Those custom-domain states are deployment/ownership inputs, not gaps that can be
fixed by changing local application code. No production deployment was made.

The fresh debug candidate is
`apps/mobile/smarttaxi_app/build/app/outputs/flutter-apk/app-debug.apk`
(233,210,724 bytes; SHA-256
`6d0787b14c58468670ffd14a41f48e3c210f634a584d9e401efe1866ed3ddb6d`,
Android `1.0.0+2`).
It is a debug-signed QA artifact, not a store release.

The initial audit snapshot had no Android device, but a phone was connected later
the same day. BaiSapar `1.0.0+2` was installed and the complete native driver
lifecycle, background/resume and forced network-loss recovery were exercised
against the local Docker API. See
[physical Android QA](physical-android-baisapar-qa-2026-09-15.md). The Windows
visual helper timed out twice while acquiring the open tabs, so the repository's
local-only Playwright harness was used for the browser pass. Its fresh
screenshots under `qa_screenshots/post-claude-2026-09-15` were inspected;
that inspection found and verified the six-tab navigation, stage-scroll and
quick-message fixes above. The full built-web lifecycle used authenticated local
development APIs and OSRM for incoming order, accept, pickup route, arrival,
waiting, trip route, completion, payment and reload recovery. Browser GPS was
simulated; API responses, state transitions and routes were not stubbed.

## Work that cannot be closed by code alone

- Official per-region address exports containing `rka`, `label`, `lat`, `lng`
  and a separate checksum `meta.json`; the Pavlodar spreadsheet is ineligible.
  The current catalogue has no house-number rows for Атамекен, Бирлик,
  Жана Жол, Киров and Ынтымак, so code cannot honestly invent their houses.
- Infobip/SMS sender approval and production credentials.
- Merchant approval, production payment credentials and settlement acceptance.
- Firebase Android configuration for `kz.baisapar.app` and a server-side service
  account for push delivery.
- Legal entity, contracts, policy decisions, domains, store accounts, release
  signing custody and iOS/macOS/App Store work.
- Moving-GPS, denied-forever permission recovery, extended background tracking
  and audible spoken navigation on a controlled route. Stationary publication
  recovery and active-trip background/resume passed on the current phone build.
- Real taxi-stand lines for every region and a multi-driver operational day.
- Maktaaral's provider detour and other road-access/safety facts that require
  on-road or authoritative-provider validation.
- Calibration of cancellation thresholds using real operational history.
- Live traffic and authoritative speed-limit data; the current routing stack
  must not be represented as providing either.

These items remain explicit external or field-acceptance blockers. They must not
be simulated to make a release report look complete.
