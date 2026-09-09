# SmartTaxi local release gate — 2026-09-10

## Result

All locally executable source, build and Docker gates passed on `dev` at
`7b72d7f`. The local stack is suitable for another customer/demo QA round.
This is not authorization for production publication and does not convert the
external prerequisites below into completed work.

## Verified

- API: complete `npm test` chain passed, including address invariants for
  121,361 catalogue rows across 13 regions.
- Web: 119/119 tests passed; Vite production build and bundled MapLibre worker
  check passed.
- Flutter: `flutter analyze` reported no issues; 272/272 tests passed.
- Docker: Compose configuration valid; API, web, PostgreSQL and Redis healthy.
- Readiness: `env=development`; DB `ok`, Redis `PONG`, OSRM `ok`.
- Full local smoke: health/maps, local dev-SMS registration, region-scoped
  address selection, server route/fare, order create/reject/accept, arrival,
  waiting, trip, cash settlement, rating, protections and driver documents all
  completed. Final output: `Smoke full ok`.
- The reusable seed driver was explicitly returned to `OFFLINE` after smoke.
- Web CLIENT/DRIVER token replacement was visually verified in two live tabs
  without reload; stale role data was not retained.

## Fresh Android QA artifact

- File: `C:/dev/smarttaxi/SmartTaxi-release-gate-2026-09-10-USB.apk`
- Size: 288,775,445 bytes.
- SHA-256: `f12dc3cc1eb6589da254b9d7bc85458b80af5a0558e4a94912e81d5aca25b1d8`.
- Signature: APK Signature Scheme v2 verified; one signer.
- Endpoints: API/socket `http://127.0.0.1:4001`, web
  `http://127.0.0.1:5175`; requires ADB reverse and the local Docker stack.
- This debug APK is for USB QA/demo only, not a Play Store artifact.

## Remaining device gate

Both available SDK copies of `adb devices -l` returned an empty device list,
including after `adb start-server`. Therefore no install, port reverse or new
physical screenshots were attempted. When a device appears, the remaining
local device task is to install this exact APK, reverse ports 4001/5175 and
repeat the final passenger/driver recovery plus navigator/action checks.

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
