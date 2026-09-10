# SmartTaxi local release gate — 2026-09-10

## Result

All locally executable source, build and Docker gates passed on `dev`, including
the compatible Flutter and Node dependency refreshes. The local stack is
suitable for another customer/demo QA round.
This is not authorization for production publication and does not convert the
external prerequisites below into completed work.

## Verified

- API: complete `npm test` chain passed, including address invariants for
  121,361 catalogue rows across 13 regions.
- Web: 130/130 tests passed; Vite production build and bundled MapLibre worker
  check passed.
- Flutter: `flutter analyze` reported no issues; 277/277 tests passed. The
  suite includes a fail-closed Android API/signing/cleartext policy guard.
- Native pickup/destination search now requests the Android street-address
  keyboard and full-address autofill hint, matching the web search semantics.
- Native recurring-route close and address-search clear icons now expose
  localized spoken tooltips; the source guard covers both address clear paths.
- Compatible Flutter runtime dependencies were refreshed and the resulting
  local-endpoint APK passed a fresh build and signature verification.
- Docker: Compose configuration valid; API, web, PostgreSQL and Redis healthy.
  All host-published QA ports are loopback-only by default, including the API
  on `127.0.0.1:4001`; an automated source guard prevents silent regression.
- The local CI-equivalent operations gate passes on Windows/Git Bash again:
  shell scripts have consistent LF line endings, and `.gitattributes`
  preserves them across Windows checkouts.
- GitHub Actions uses the current Node 24-based `checkout@v7` and
  `setup-node@v7` actions with read-only repository permissions. A source guard
  rejects a regression to deprecated action runtimes.
- Remote GitHub Actions run
  [`#804`](https://github.com/adilovdarin2-spec/smarttaxi/actions/runs/34452223996)
  passed all four jobs (`api`, `web`, `operations`, `mobile`) with no workflow
  annotations after that migration.
- Remote GitHub Actions run
  [`#810`](https://github.com/adilovdarin2-spec/smarttaxi/actions/runs/34468012222)
  passed all four jobs after the mobile gate was strengthened to compile a real
  debug APK on a clean runner. The first strict run correctly exposed the
  absent ignored Firebase file; debug builds no longer fabricate or require
  owner credentials, while release builds fail closed without the real file.
- Production API dependency audit (`omit=dev,optional`): 0 vulnerabilities;
  Firebase Admin 14 modular Messaging is verified inside the minimal image at
  Docker build time.
- Compatible API/web runtime packages were refreshed; API and web production
  audits remain at 0 vulnerabilities and the rebuilt Compose services are
  healthy.
- Readiness: `env=development`; DB `ok`, Redis `PONG`, OSRM `ok`.
- Full local smoke: health/maps, local dev-SMS registration, region-scoped
  address selection, server route/fare, order create/reject/accept, arrival,
  waiting, trip, cash settlement, rating, protections and driver documents all
  completed. Final output: `Smoke full ok`.
- The cross-platform host command `npm --prefix apps/api run smoke:qa-docker`
  is fixed to the isolated Compose API on port 4001, so it cannot silently test
  the older local stack on port 4000. Full smoke now also runs the read-only
  minimum-ETA route-selection and departure-bearing checks before any order
  lifecycle mutation. A preflight now also requires development mode and the
  dev SMS provider before it creates any QA account or order. The read-only
  route probe tolerates two transient provider/network retries but still fails
  closed when routing stays unavailable.
- Stage 2/3/9/11 now assert their own final `OFFLINE` cleanup. Stage 3 also
  asserts driver-cancel reopen semantics before performing a terminal client
  cancellation, so smoke no longer leaves its order in dispatch.
- A guarded local-only cleanup moved 18 historical exact-match Stage 2/3 smoke
  orders to `CANCELLED_BY_OPERATOR` through the normal API (audit/history
  retained, no rows deleted). Postcondition: 0 such open orders and the reusable
  seed driver is `OFFLINE`.
- Web CLIENT/DRIVER and OWNER/CLIENT token replacement was visually verified in
  live tabs without reload; stale role data was not retained. Late admin data
  and authentication responses are guarded against replacement sessions.
- Admin access was visually verified centered at 1280x720. Passenger entry was
  visually verified at mobile width with the unified blue route/car hero, both
  empty and valid phone-number states, and intact legal links.
- An open stale web bundle was deliberately exercised after a Docker image
  replacement: the safe recovery screen appeared and its reload action restored
  the authenticated driver session without replaying or cancelling an order.
- Read-only route selection was repeated after the dependency refresh in
  Atakent, Zhetysay and Myrzakent. API geometry/metrics matched the minimum-ETA
  OSRM candidate, and moving-driver departure bearings stayed constrained.
- A second read-only route pass after the final Android CI fix again matched
  the provider's minimum-duration candidate in Atakent, Zhetysay and Myrzakent.
  Both 3° and 183° moving-driver fixtures departed on the requested bearing;
  no account, order or GPS row was written.
- A controlled local API outage was exercised in the real narrow driver web
  account. The profile showed the dedicated retry card without losing the
  account shell; after readiness returned (`db=ok`, `redis=PONG`, `osrm=ok`),
  the same `Повторить` action restored the profile and vehicle without a page
  reload. The API container was returned healthy and no volume was removed.
- The same outage exposed raw browser copy (`Failed to fetch`) and fabricated
  zero earnings/order totals on the first driver-line load. Driver errors now
  map to product copy, the map notice has a real single-flight retry action,
  and a first-load failure hides all unknown totals until the API responds.
  The live rebuilt Docker web showed the localized notice, `Проверяем…` state
  and successful in-place recovery to the real seeded-driver totals.
- Pickup and destination address-search inputs have distinct accessible names,
  plus mobile street-address/search keyboard hints; the new regression test is
  included in the web gate above.
- Driver offline, order, trip, road, earnings and account views were repeated in
  the live narrow web shell. The road-alert type and comment controls now have
  explicit accessible names; their regression check is included in the
  130-test web gate above.
- The physical-device helper now recognizes the exact fresh local CASH fixture
  created by its own client-order command. Strict environment, loopback, fixture,
  age and active-order guards remain in place; its policy and command guards
  pass 7/7 and 5/5 assertions respectively. A fresh fixture also completed the
  entire guarded lifecycle against Docker port 4001 and cleanup returned the
  seed driver to `OFFLINE`.
- A live passenger route/tariff pass exposed oversized endpoint markers on the
  shallow map preview. Only that preview now scales the pickup badge to 44x59
  and the finish flag to 40x52, leaving the approved 64x86 address-picker cursor
  unchanged. The short 0.7 km route remains readable between the markers.
- Address search no longer presents a transient false `0` while the remote
  catalogue request is still running: the result region is marked busy and
  displays `Ищем адреса …` until the resolved count is available.
- Parallel SSR presentation tests now disable Vite dependency discovery. All
  130 tests still execute concurrently, but the run no longer emits misleading
  `server is being restarted or closed` dep-scan errors after a sibling test
  closes its own middleware server.
- A fresh full regional route pass completed against the local Docker API on
  2026-09-10: 37 requests produced 34 Economy/Delivery previews across all 13
  regions plus intercity fixtures, with no failures. The only review item is
  Maktaaral: public OSRM returns one 2.569 km/340 s route for two points about
  255 m apart (endpoint snaps 60 m and 13 m). This is a provider road-graph/on-
  road verification boundary, not an alternative-selection defect; SmartTaxi
  must not invent an unverified shortcut.
- The passenger browser smoke was repeated against the rebuilt local stack:
  exact building/map selection, region recentering, two tariffs, payment sheet,
  responsive 390x844/360x740 layouts and lost-create-response recovery passed.
  The isolated local order was cancelled by the script after verification.
- Building reverse lookup now tolerates at most five metres between an
  address/entrance node and the selected vector-tile footprint. This covers
  real OSM tile-edge simplification without assigning an address from the next
  house: regression fixtures accept a 3-4 m edge gap and still reject a
  neighbouring address about 17 m away. API tests, 131 web tests and the web
  production build pass; the rebuilt local Docker API/web are healthy.
- A selected building can now use a real POI from the committed regional
  catalogue when providers return only a bare street. The POI must fall inside
  the exact footprint supplied by the map picker (with the same five-metre tile
  simplification tolerance); without a footprint, a nearby shop is still
  rejected. A house number inside that footprint remains higher priority than
  a POI. The rebuilt Docker API returned the catalogued `Заправка` in Бирлик as
  `selected-building`, while readiness was healthy and all 13 regions were
  available. The complete API regression suite passes.

## Fresh Android QA artifact

- File: `C:/dev/smarttaxi/SmartTaxi-release-gate-2026-09-10-USB.apk`
- Size: 288,883,364 bytes.
- SHA-256: `8f70fc9c6a8c737ad82fb613fb40c93b4c1e757a38f1653226300619a0780399`.
- Signature: APK Signature Scheme v2 verified; one signer.
- Manifest: compile/target SDK 36 (Android 16), minimum SDK 24.
- Endpoints: API/socket `http://127.0.0.1:4001`, web
  `http://127.0.0.1:5175`; requires ADB reverse and the local Docker stack.
- This debug APK is for USB QA/demo only, not a Play Store artifact.
- A production-default, API-36 release AAB also builds successfully with the
  existing ignored local signing configuration:
  `C:/dev/smarttaxi/SmartTaxi-release-candidate-2026-09-10-api36.aab`,
  102,624,707 bytes, SHA-256
  `60a7e50aba6c8b0b42287e730d254aa9787c4f1a2d952bb8170d00c1bb1d60d3`.
  `jarsigner -verify` reports `jar verified`; no Play upload was performed.

## Fresh physical-device install

The connected Android phone (`2409BRN2CY`) appeared in ADB on 2026-09-10. The
exact APK above was installed with `adb install -r` successfully; package
`kz.smarttaxi.app` reports version `1.0.0`, target SDK 36 and update time
2026-09-10 16:38 local. ADB reverse for ports 4001 and 5175 is active, the local
Docker stack is healthy, and `MainActivity` was launched and confirmed as the
foreground activity. A post-install screenshot confirms the native Russian
login screen renders without clipping. Full moving-road/background/TTS/push
coverage remains a separate physical acceptance gate; this install is local QA,
not a production publication.

The USB build deliberately depends on `adb reverse`; disconnecting the phone
removes that tunnel and produces one fallback region plus unavailable login and
address selection. For a cable-free local demonstration, the opt-in
`docker-compose.phone-qa.yml` override exposes only API/web on explicitly chosen
private-LAN ports. PostgreSQL and Redis remain loopback-only. A Wi-Fi APK must be
built with matching `API_BASE_URL`, `SOCKET_URL` and `WEB_BASE_URL`; this is
still a local development setup, not a production deployment.

The current cable-free artifact is
`C:/dev/smarttaxi/SmartTaxi-customer-WiFi-2026-09-10.apk` (288,886,709 bytes,
SHA-256 `a158079381c2eda56e3786a750454e26a5ec276a7877b161eb4585d10a70617b`).
It targets API/socket `http://192.168.8.135:4002` and web
`http://192.168.8.135:5176`; APK Signature Scheme v2 verifies with one Android
debug signer. The passenger home now exposes the current service region as a
compact switcher. If the initial region request failed, tapping it retries the
real API request; a failed refresh no longer destroys a previously loaded
catalogue. The real-browser account pass covers all 15 account sections and
asserts all 13 active regions are visible. Installation and physical-device
verification of this new artifact remain pending because the phone was not
connected during this pass.

## Remaining external/public-release gates

1. Official region exports with `rka,label,lat,lng` and an immutable,
   checksummed `.meta.json` for each region. The Pavlodar XLSX is not suitable.
2. Production SMS sender/provider credentials and successful delivery QA.
3. Merchant contract, production payment API/webhook and real settlement QA.
4. Authorized production deployment: DNS/TLS, secrets, monitoring, push
   credentials, backup/restore and capacity/load verification.
5. Contracted production map/routing capacity and maintained traffic/safety
   data. Public OSRM can choose the quickest returned route by estimated
   duration, but cannot guarantee the fastest current-traffic route.
6. Legal/entity decisions and approved translations; store-owner acceptance.
7. Real-road navigation, TTS, background GPS/push and battery/device-matrix QA.
8. Android signing custody and Play Console publication. An ignored local
   signing configuration exists and the API-36 AAB builds successfully, while
   Gradle still fails closed when `android/key.properties` is absent. The owner
   must confirm secure backup/ownership of that key and perform Play acceptance.
9. iOS/Mac signing, TestFlight and App Store work.

The application does not fabricate any of these integrations or datasets.
