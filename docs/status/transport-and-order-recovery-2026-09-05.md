# Transport safety and order recovery — 2026-09-05

Local development follow-up on `dev` after `5fa070b`. No production account,
external SMS, merchant operation, deployment, database-volume deletion or
device security bypass was used.

## Confirmed failures

Executable tests against the original Flutter `ApiClient` reproduced:

- Three POST attempts after a lost order-creation response instead of one.
  A receive timeout does not establish whether the server committed a write.
  This was three requests, not evidence of three created orders: the backend's
  active-order constraint is a separate protection and remains unchanged.
- A delayed old-token `401 SESSION_SUPERSEDED` called session expiration after
  a successful newer login.
- After disabling write replay, an order accepted by the server but with a
  lost response still surfaced only as a creation error; the client did not
  read back the active trip at that point. The new recovery test failed before
  the reconciliation implementation and passed afterward.

## Changes

### Flutter

- Extracted testable Dio transport guards, with optional injected Dio/backoff
  for isolated tests. Production base URL configuration and 30-second default
  connection/receive timeouts are unchanged.
- Automatic cold-start retries are restricted to safe GET/HEAD/OPTIONS reads,
  at most twice with the existing 1s/3s delays. Writes, HTTP rejections,
  cancelled requests and non-repeatable request bodies are not replayed.
- A logout or replacement login invalidates queued authenticated read retries.
- Session expiration checks the request's bearer against both current in-memory
  and securely stored credentials, rechecks after asynchronous storage access,
  and notifies once for a superseded token. A storage failure preserves the
  original API error instead of treating ownership as established.
- An uncertain creation failure, server/gateway failure or active-order
  conflict performs a safe `/api/orders/me/active` reconciliation. It can
  restore an existing unpaid settlement as well as an in-progress ride.
  The read uses the original account token and verifies ownership before and
  after the request. Empty, invalid, unavailable or stale reads preserve the
  original creation error; no order or payment success is fabricated.

### Web parity

- Added the same read-after-uncertain-creation behavior without POST replay.
  API errors retain their HTTP status so gateway errors can be distinguished
  from validation, authorization, throttling and unrelated conflicts.
- Booking precheck, creation, conflict recovery and UI completion callbacks
  are gated by the initiating session and component lifetime. Logout releases
  that session's loading indicator. A late creation success cannot populate
  a replacement account's booking screen.
- The optional `QA_ORDER_RECOVERY=true` browser scenario exercises the actual
  compiled application against local development API data. Its registration
  uses the genuine local dev SMS verification flow. Only the HTTP response
  delivery is interrupted after the backend has accepted the test order.

No fare logic, status machine, driver route renderer, car/marker artwork,
production integration, schema or migration was changed in this pass.

## Verification

- Flutter: all **89 tests** pass (27 new transport/recovery tests);
  `flutter analyze --no-pub`: no issues.
- Android debug APK built successfully using explicit local API/socket
  `http://127.0.0.1:4001` and web `http://127.0.0.1:5175` definitions.
  Output: `apps/mobile/smarttaxi_app/build/app/outputs/flutter-apk/app-debug.apk`.
  SHA-256: `157107efdb64d30f2b8401ddeaea91e685fa105664feeeca775ca95d97e9173a`.
- Web: **46 tests** pass (11 new recovery cases), production build passes.
- API: dependency policy and all **36 checks** pass, without requiring a test
  database. The backend order/auth/payment contracts remain intact.
- Normal root-lock Docker web build and local container replacement succeed;
  Compose config is valid and API/web/PostgreSQL/Redis are healthy.
- Local API environment and SMS provider were explicitly read as
  `development` / `dev` before the browser registration scenario.
- Browser address/map selection, two tariffs, KZT prices, payment keyboard
  focus and unresolved-address rejection pass at 390px/360px. The creation
  response-loss scenario confirms one POST and restoration of the same actual
  server order. Its own order is cancelled afterward, with no active trip left
  for that isolated client. No other user's order is cancelled or deleted.
- The full paired passenger/driver suite passes on compiled nginx web: incoming
  order, failed-action preservation, acceptance, BUSY GPS/permission recovery,
  delayed/trailing and longitude-only fixes, both route legs, arrival, waiting,
  trip, unpaid restoration and manual cash receipt through `PAID`.
  Local lifecycle order: `4caf7829-9850-4f35-ae93-2b5ac6025449`.
  Render checks confirm both cars, actual route pixels and the finish flag.

Evidence:

- [Recovered order screen](screenshots/2026-09-05-order-recovery/order-response-recovered.png)
- [Creation/recovery assertions](screenshots/2026-09-05-order-recovery/order-recovery-result.json)
- [Full lifecycle assertions](screenshots/2026-09-05-order-recovery/lifecycle-result.json)
- [Lifecycle route/GPS evidence](screenshots/2026-09-05-order-recovery/lifecycle-network.json)

The first browser harness attempt rejected the equivalent `localhost` versus
`127.0.0.1` spelling before sending the intercepted creation. The harness now
accepts loopback aliases while requiring the intended API port and protocol.
That attempt is not counted as an application regression or a passed run.

## Remaining boundaries

This is transport and booking-recovery coverage, not a proof that every native
asynchronous operation is session-isolated or that all physical-device behavior
is correct. If both the write response and its readback are unavailable, the
original failure remains visible; no server-wide idempotency contract was added.

The phone is visible to ADB, but installation approval has not been provided
after the previous `INSTALL_FAILED_USER_RESTRICTED` results. This APK was not
installed, and no new native screenshot, moving-GPS, voice/background-navigation
or native route-layer acceptance is claimed.

The successful Android build still warns about future Flutter support for the
current Gradle/AGP/Kotlin versions. The web build retains the MapLibre chunk-size
warning. These warnings were not suppressed or converted into false failures.

Use [the current remaining-work list](RELEASE-REMAINING-2026-09-05.md) for device,
regional/routing, deployment, signing and external prerequisites. Production
routing capacity, official RKA exports, operator/legal decisions, merchant/SMS
authorization and iOS/store work are not established by these local checks.
