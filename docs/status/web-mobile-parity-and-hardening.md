# SmartTaxi: web/mobile parity and hardening

## Product source of truth

The Flutter passenger application is the protected source of truth for
business flows. The web client reproduces its behaviour and content rather
than replacing or simplifying mobile rules.

The approved address-selection marker is documented in
`design-reference/web-approved/assets/map-initial-square-tail-marker.html`.
A live phone location uses a blue GPS dot, a confirmed destination uses a
checkered flag, and drivers use the car marker.

## Completed

1. Order cancellation requires an authenticated client who owns the order and
   has a dedicated route rate limit.
2. Order and recurring-booking short IDs use cryptographically secure random
   bytes rather than `Math.random()`.
3. Web tariff cards use server estimates for the selected route.
4. Payment choices match across web and Flutter: cash, Kaspi, card and
   cashback.
5. Cashback ride creation atomically reserves the full quoted price, writes a
   payment row and records `orders.cashback_used`.
6. A cashback ride does not mint another cashback reward from stored value.
7. Paid waiting on a cashback ride reserves the delta from remaining bonuses
   when possible. If insufficient, only the uncovered delta becomes a card
   payment and the order remains `MIXED` until that payment confirms.
8. Confirmed non-cash settlement credits the driver, nets existing debt and
   posts one financial ledger row.
9. Curated region addresses remain selectable while all other map/search
   results still require geographic validation.
10. Web exposes the same region selection and active-ride return path as
    Flutter.
11. React, realtime transport and MapLibre are split into separate production
    chunks; map code is not loaded on unrelated routes.
12. CI covers API checks, web production build, Flutter analysis and tests.

## Verification (2026-08-31)

- API syntax/check/test: passed, including 121,385 service-bound address rows
  in 13 regions; out-of-bound records are rejected instead of leaking into a
  neighbouring settlement's search.
- Web production build: passed after a clean `npm ci`.
- Flutter `analyze`: no issues.
- Flutter tests: 36 passed.
- Android debug APK: rebuilt successfully with JDK 17 from the current source
  on 2026-09-01.
- Docker Compose API/PostgreSQL/Redis/web: healthy.
- Live cashback ride: `SEARCHING_DRIVER` through `PAID`; payment, driver
  balance/debt and ledger were correct.
- Live mixed ride: 700 KZT cashback plus 50 KZT card waiting delta; provider
  flow reached `PAID`, ledger method was `MIXED`, then test data was removed.
- Browser smoke: landing, passenger, driver and 390x844 breakpoint; no console
  errors and no horizontal overflow.
- Local Docker readiness: API, PostgreSQL, Redis and web healthy. Production
  map credentials and deployment health must be verified in that environment.

## Dependency note

The root lock file is synchronised and verified with `npm ci`. Non-breaking
security updates removed every high-severity npm advisory. Eight moderate
advisories remain in Firebase Admin transitive Google packages; npm only
offers a breaking forced change, so it was not applied blindly.

## External release gates

The remaining work is owner-controlled release input rather than a code defect:
Android upload signing key/Play Console, Kaspi merchant credentials, store
listing assets, and an Apple/macOS/Xcode signing environment for iOS.

For complete official house-level coverage in settlements where public map
data is sparse, an authorised Kazakhstan Address Register export with RKA
identifiers is required. The importer and validation path are documented in
`docs/ADDRESS_REGISTRY_IMPORT.md`; the client does not fabricate addresses.
