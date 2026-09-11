# GPS publication and live-route ordering — 2026-09-05

Follow-up to the intermittent driver-route observation in
`visual-refinement-2026-09-05.md`. Work is local-only on `dev`.

## Reproduced cause

On the previous frozen build (`92c2f14`), a browser GPS event immediately changed
the driver's route input while its location PATCH was still pending. The route
endpoint reads persisted GPS, not the browser's coordinates. It could therefore
successfully return the old origin; the scheduler then had no further position
change to trigger reconciliation. The passenger, listening to the server's
post-write location event, already received the new route.

The reproduction delays only the test driver's real location PATCH by 1500ms.
No coordinates, successful API responses, route geometry or authorization are
replaced. The old build failed the existing 25-second longitude-route assertion.
Its diagnostic evidence is retained under the ignored
`tmp-2026-09-05-captures/gps-publication-before/` directory.

A second defect was present in web's 15-second location throttle: it simply
discarded an intermediate GPS event, so a final position could remain unpublished
indefinitely if the browser delivered no subsequent event.

## Changes

### Web

- New `driverLocationPublisher.js` serializes location writes and coalesces queued
  movement to the newest fix. It sends the trailing fix at the existing interval,
  retries failed publication without requiring another GPS tick, and disposes
  queued work/aborts the browser request on logout or leaving the working state.
- DriverApp retains immediate GPS movement for its own marker, but gives the
  route scheduler only acknowledged server coordinates. A confirmed write is
  itself the trigger for route reconciliation. Session/driver identity gates
  keep a previous account's response out of the current route.
- The location API wrapper accepts the publisher's abort signal. Endpoint,
  authentication, backend, order state machine and routing provider are unchanged.
- Nine new unit tests exercise the acknowledgement barrier, trailing publication,
  slow/serialized writes, coalescing, retry, invalid GPS, disposal and session change.
- Final driver screenshots exposed an untranslated `Economy` label and a cancel
  button styled as another primary action. Visible tariff labels now read
  `Эконом` / `Доставка`; ghost actions use the existing white secondary treatment.
  API tariff enums, action availability and original vehicle assets are preserved.

### Flutter Android

- Its GPS listener had the same ordering problem: it launched route refresh
  before awaiting location publication, and async stream listeners could overlap
  writes. `DriverLocationSync` now serializes writes, coalesces waiting positions
  and calls routing only after publication succeeds. The initial GPS lookup uses
  the same queue as the position stream. Specific API rejection messages remain.
- Throttled or in-flight route updates retain a pending position and a finite
  trailing refresh. Existing 4-second deviation floor and 12-second normal
  refresh interval are preserved. Pending work is cleared on target changes,
  leaving the line, logout and disposal.
- Cold restoration of an active order now starts its missing GPS stream.
  Previously the order/route restored, but `_startLocationFlow` was reached only
  through going online. Restoration does not call `setDriverStatus(FREE)`, does
  not change the active assignment, and does not start a duplicate watcher or
  tracking for completed/unpaid/open orders. Standard permission checks remain.
- Nine new Dart tests cover publication ordering/queue behavior, remaining
  refresh delays and the active-trip restoration guard.

No map renderer, annotation line, design asset, tariff calculation, legal text,
payment provider or official address catalogue was changed.

## Checks and evidence

- API: dependency policy and all 36 checks passed locally and inside the new
  root-context Node 22 image with `--network none`. The isolated image test used
  dummy test environment values and read-only web/native source mounts for
  cross-client source assertions. API runtime source/dependencies came from the
  image. Without test environment variables the config correctly refuses to
  load; without the web source mount its source-contract assertion cannot run.
- Web: 26/26 unit tests and production build passed.
- Final client browser smoke passed at 390×844 / 360×740.
- Paired driver/passenger smoke passed with the new delayed-write and trailing-fix
  assertions, plus the existing failed-action and complete-trip/payment checks.
  Driver and passenger routes both advanced through longitudes 68.5041,
  68.5044 and 68.5045 using non-fallback OSRM geometry.
- Flutter: all 62 tests passed, including the nine new checks.
- Flutter final analysis: no issues. Android debug APK build passed with explicit
  local API/socket `http://127.0.0.1:4001` and web `http://127.0.0.1:5175` defines.
  Flutter's upcoming Gradle/AGP/Kotlin support warnings remain; no toolchain
  upgrade or native route-renderer change was attempted without device QA.
- Compose configuration passed. No database volume was removed or recreated.

Final screenshots and sanitized network assertions:

- [Driver route after movement](screenshots/2026-09-05-gps-publication/driver/driver-accepted-live.png)
- [Driver destination leg](screenshots/2026-09-05-gps-publication/driver/driver-trip-live-route.png)
- [Passenger destination leg, 360px](screenshots/2026-09-05-gps-publication/driver/passenger-trip-live-route-360.png)
- [All lifecycle assertions](screenshots/2026-09-05-gps-publication/driver/result.json)
- [Actual location/route responses](screenshots/2026-09-05-gps-publication/driver/network.json)

The service-unavailable notice in the accepted-order screenshot is from the
suite's deliberate profile-refresh failure test; the accepted order and route
remain usable. It is not evidence of a real backend outage in that capture.

## Runtime and boundaries

The first successful passes used the frozen production snapshot
`tmp-2026-09-05-captures/web-static-gps-final`, compiled with the exact Compose
public VITE arguments and loopback API/socket endpoints. The previous registry
network blocker then cleared: `rtk docker compose build api web` completed both
normal root-context images, including fresh locked dependency installation.
Both image installs reported zero audit findings for their installed trees.

After the browser suites completed, API/web were recreated from those images
using the regular Compose configuration, without the ignored override. Readiness
confirmed development mode, database, Redis and real OSRM routing; container
inspection confirmed `smarttaxi-api`, `smarttaxi-web` and no web bind mount.
PostgreSQL/Redis containers, database volumes, frozen snapshots and previous
diagnostics remain intact. This is local QA, not a production deployment.

Both browser suites then passed again against the normal Docker images. The
linked screenshots and network assertions are from that final run, not from
the earlier frozen preview. The final paired run's test order is
`358bc172-1192-4c77-91e6-9f2990774f7e`; it reached `PAID` through the existing
local cash/manual-receipt flow, not a real electronic merchant transaction.

Physical Android acceptance remains pending the device-side install restriction
documented in `SESSION-2026-09-05-CONTINUATION.md`. No installation restriction or
permission was bypassed. Dart queue/guard tests and a debug build cannot establish
real-device moving GPS, app-resume behavior, spoken navigation or visual parity.

This closes the reproduced write-before-route race and dropped trailing GPS
case; it does not promise live-traffic routing, OSRM production capacity or that
all possible network/device lifecycle cases are resolved. The commercial/RKA,
merchant/SMS, legal, license and iOS boundaries remain unchanged.
