# SmartTaxi local release gate — 2026-09-10

## Result

All locally executable source, build and Docker gates passed on `dev` through
`7815c1e`, plus the compatible Node dependency refresh. The local stack is
suitable for another customer/demo QA round.
This is not authorization for production publication and does not convert the
external prerequisites below into completed work.

## Verified

- API: complete `npm test` chain passed, including address invariants for
  121,361 catalogue rows across 13 regions.
- Web: 125/125 tests passed; Vite production build and bundled MapLibre worker
  check passed.
- Flutter: `flutter analyze` reported no issues; 272/272 tests passed.
- Compatible Flutter runtime dependencies were refreshed and the resulting
  local-endpoint APK passed a fresh build and signature verification.
- Docker: Compose configuration valid; API, web, PostgreSQL and Redis healthy.
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
  included in the 125-test web gate above.

## Fresh Android QA artifact

- File: `C:/dev/smarttaxi/SmartTaxi-release-gate-2026-09-10-USB.apk`
- Size: 288,775,445 bytes.
- SHA-256: `b5bfe2b3ec07981b697d52ae9dded2b3e46587dd94de499234d2e09a923167c2`.
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
