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
- Web: 127/127 tests passed; Vite production build and bundled MapLibre worker
  check passed.
- Flutter: `flutter analyze` reported no issues; 272/272 tests passed.
- Native pickup/destination search now requests the Android street-address
  keyboard and full-address autofill hint, matching the web search semantics.
- Native recurring-route close and address-search clear icons now expose
  localized spoken tooltips; the source guard covers both address clear paths.
- Compatible Flutter runtime dependencies were refreshed and the resulting
  local-endpoint APK passed a fresh build and signature verification.
- Docker: Compose configuration valid; API, web, PostgreSQL and Redis healthy.
  All host-published QA ports are loopback-only by default, including the API
  on `127.0.0.1:4001`; an automated source guard prevents silent regression.
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
  lifecycle mutation.
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
- Pickup and destination address-search inputs have distinct accessible names,
  plus mobile street-address/search keyboard hints; the new regression test is
  included in the web gate above.
- Driver offline, order, trip, road, earnings and account views were repeated in
  the live narrow web shell. The road-alert type and comment controls now have
  explicit accessible names; their regression check is included in the
  126-test web gate above.
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
  127 tests still execute concurrently, but the run no longer emits misleading
  `server is being restarted or closed` dep-scan errors after a sibling test
  closes its own middleware server.

## Fresh Android QA artifact

- File: `C:/dev/smarttaxi/SmartTaxi-release-gate-2026-09-10-USB.apk`
- Size: 288,883,364 bytes.
- SHA-256: `ccd1f253826271ca88509355c3eec611b057b40f34eb33926f72a7d2c263078d`.
- Signature: APK Signature Scheme v2 verified; one signer.
- Endpoints: API/socket `http://127.0.0.1:4001`, web
  `http://127.0.0.1:5175`; requires ADB reverse and the local Docker stack.
- This debug APK is for USB QA/demo only, not a Play Store artifact.

## Remaining device gate

Both available SDK copies of `adb devices -l` returned an empty device list,
including after `adb start-server`. A Windows PnP inspection also found no
present Android, ADB, MTP, or portable-device interface; only generic USB
composite/hub devices were exposed. Therefore no install, port reverse or new
physical screenshots were attempted. When a device appears, the remaining local
device task is to install this exact APK, reverse ports 4001/5175 and repeat the
final passenger/driver recovery plus navigator/action checks.

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
8. iOS/Mac signing, TestFlight and App Store work.

The application does not fabricate any of these integrations or datasets.
