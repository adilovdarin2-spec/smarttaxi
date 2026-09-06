# SmartTaxi final readiness report — 2026-08-31

Historical report. For current acceptance status and unresolved technical/device
checks, use [the September remaining-work list](RELEASE-REMAINING-2026-09-05.md)
and [the continuation](SESSION-2026-09-05-CONTINUATION.md). The original outcome
below describes the evidence available at that time, not current release approval.

## Outcome

The repository is locally runnable and verified across API, web, Flutter,
Docker and real HTTP business flows. The code-side hardening plan is complete.
Publishing remains gated only by owner-controlled accounts and credentials.

## Delivered

- Full cashback ride payment with an atomic balance decrement and ledger.
- Safe paid-waiting delta handling: cashback first, card fallback as `MIXED`.
- Correct automatic driver settlement and debt netting for non-cash rides.
- Passenger cashback selection and balance display in web and Flutter.
- Russian payment labels across passenger, driver and admin interfaces.
- CI coverage for API, web build, Flutter analysis and Flutter tests.
- Non-breaking dependency security update; no high-severity npm advisories.
- Working Docker stack and a freshly verified Android debug APK.

## Verification evidence

- API: syntax/check/test passed, including 121,385 service-bound address rows
  across 13 active regions. Rows outside a region boundary are deliberately
  excluded rather than being shown as a nearby but incorrect address.
- Web: production Vite build passed after a clean `npm ci`.
- Flutter: `analyze` clean; 36 tests passed.
- Android: `app-debug.apk` built successfully (185,940,074 bytes).
- Docker: API, PostgreSQL, Redis and web containers healthy.
- Local API readiness: DB OK, Redis PONG, OSRM OK, map fallbacks available.
- Local Docker readiness: API, PostgreSQL, Redis and web are healthy. A
  production deployment must supply and verify its own map-provider settings.
- End-to-end cashback ride: order completed to `PAID`, payment and finance
  ledger matched, driver returned to `FREE`.
- End-to-end mixed ride: 700 KZT cashback plus a 50 KZT card waiting delta;
  mock provider reached `PAID`, ledger recorded `MIXED` and 750 KZT gross.
- Browser QA: public landing, passenger booking and driver login rendered
  correctly; 390x844 had no horizontal overflow; console was clean.
- All temporary E2E orders, notifications and ledger rows were removed; seed
  balances/statuses were restored after the checks.

## Artifacts

- Fresh debug APK (built from the current source on 2026-09-01):
  `apps/mobile/smarttaxi_app/build/app/outputs/flutter-apk/app-debug.apk`
- SHA-256:
  `be55e30380facecd69b6dae882b8b0e9bf0e46523c38b8247fb64a71a16523b8`

## External release gates

1. Create and back up the Android upload keystore, then build the signed AAB.
2. Supply real Kaspi merchant credentials before advertising card payments as
   production charges; local development currently uses the documented mock.
3. Finish Play Console listing/data-safety assets and reviewer account setup.
4. iOS requires a macOS/Xcode runner, Apple account and signing setup.
5. Eight moderate npm advisories remain in Firebase Admin transitive packages;
   npm only offers a breaking forced change, so it was not applied blindly.
6. For complete house-level coverage in smaller settlements, load an authorised
   Kazakhstan Address Register export with RKA identifiers via
   `docs/ADDRESS_REGISTRY_IMPORT.md`. The application intentionally does not
   invent missing house addresses.
