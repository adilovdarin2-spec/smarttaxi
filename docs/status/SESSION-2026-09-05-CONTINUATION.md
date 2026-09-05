# SmartTaxi continuation — 2026-09-05

Work is on `dev`. Existing work and Docker data were retained; no reset,
clean, volume removal, production test account or external SMS was used.

## Completed stages

- `29fdc64`: fail-safe backup/restore/deploy/health helpers, with executable
  failure-path regressions. Deployment no longer automatically seeds accounts.
- `fc53f05`: native driver cancellation/reopened-order reconciliation and
  request-scoped route invalidation; legacy statuses and renderer preserved.
- `8b7dcd7`: root-lock Compose builds and actual local backup restoration into
  a separate database. See `local-recovery-rehearsal-2026-09-05.md`.
- `b8ee75d`: driver manual-receipt confirmation is limited to CASH/KASPI;
  electronic confirmation cannot be forged through driver mark-paid aliases.
- `db97283`: Node 22 Docker baseline, mirrored patched `qs` policy, optional
  Firebase services excluded from API images, offline Messaging validation.
- Web rider/driver follow-up: restored active/unpaid trips, continued BUSY
  geolocation, shared live-route scheduling, safe failed-action handling,
  explicit map selection and correct pin coordinates/region recentering.
  Layouts were checked at 390×844 and 360×740; fake map state was removed.
  The duplicate home pin, overflowing driver-car image and missing driver
  finish SVG were fixed. The shared finish flag now has alternating cells,
  and browser checks verify painted markers as well as actual route pixels.
- Visual refinement follow-up: unified restrained blue/white typography,
  larger original tariff cars with aligned KZT fares, payment keyboard focus,
  readable account/menu surfaces and matching Flutter presentation primitives.
  See `visual-refinement-2026-09-05.md` for final screenshots, checks and the
  retained intermittent longitude-only route refresh observation.

Web code/evidence is described in `web-picker-and-trip-recovery-2026-09-05.md`
and `web-driver-lifecycle-2026-09-05.md`. API-backed browser scenarios are not
substitutes for physical Android acceptance or a real drive.

## Local verification

- API: dependency-policy pretest and all 36 checks pass, including payment
  authorization. The final locked image also passed without network access.
- Web unit tests: 17/17 (16 lifecycle checks and the checkered-finish marker
  regression); tests are included in Node 22 CI.
- Web production build and local browser address/lifecycle scenarios pass.
- Flutter analyze: no issues. Full tests after visual refinement: 53 passed.
- Android debug APK rebuilt with local API/socket `http://127.0.0.1:4001`
  and web `http://127.0.0.1:5175`; no production endpoint defines.
- Compose config is valid; API/PostgreSQL/Redis/web health checks pass.
- Actual backup/restore: 40 tables, 128 indexes, 121,361 addresses,
  13 regions and 52 tariffs match. Existing restore targets are refused.
- Production/non-optional dependency audit: zero findings. Full lock still
  contains eight moderate optional-chain findings; no high/critical findings.

## Current local QA runtime

Repeated npm registry timeouts/reset errors prevented the final clean
root-context API/web image builds. Earlier locked Node 22 builds passed;
the final service-local API Docker build also passed. These are distinct
from the last root-context build attempts, which are not marked successful.

The four local services are running and healthy. The final browser suites
passed against the following explicitly local fallback, not a Vite server:

- API: `smarttaxi-qa-api:cache-hardened-20260905`, using a fresh locked
  `npm ci` seeded from the previously verified image's npm cache. Runtime
  source, dependency checks, full API tests and readiness were verified.
- Web: existing nginx container with a read-only frozen production build,
  compiled with the exact Compose `VITE_*` arguments. This is not a fabricated
  UI, proxy to production, or replacement of successful API responses.
  The current design-pass snapshot is `web-static-design-final` under the
  ignored captures directory; older snapshots remain on disk.
- Only API/web containers were recreated. PostgreSQL/Redis and all database
  volumes remained in place. Temporary Vite processes were stopped.

The ignored local override and frozen assets live under
`tmp-2026-09-05-captures/`. To retain this current local QA arrangement:

```text
rtk docker compose -f docker-compose.yml -f tmp-2026-09-05-captures/compose-qa-verified.yml up -d --no-deps --no-build api web
```

Do not deploy that machine-specific override. Once registry connectivity is
stable and no QA trip is active, rerun the normal root-context build, check
readiness and both smoke suites, and return to the regular configuration:

```text
rtk docker compose up -d --no-deps --build api web
```

This removes the temporary mount from the container configuration; the
ignored frozen assets/diagnostics and the rehearsal backup remain recoverable
on disk. The standard Dockerfiles and release configuration are unchanged by
the fallback. Final paired browser evidence is recorded in
`web-driver-lifecycle-2026-09-05.md`; the final passenger preview smoke also
passed under nginx on port 5175.

## Device blocker — action required

The physical `2409BRN2CY` Android phone is connected and authorized for ADB.
USB reverse ports 4001 and 5175 are configured. However, both attempts to
install the debug APK returned `INSTALL_FAILED_USER_RESTRICTED: Install
canceled by user`. Device-side USB installation approval is required. No
security setting was bypassed, no app was uninstalled and no app data cleared.

A separate attempt to open local web in the phone browser was rejected by
the available automation channel. No phone-browser screenshots or native
acceptance are claimed from that attempt.

The existing installation was not used for orders because its backend could
not be established as the local development backend. Pending on-device work:
passenger and driver screen capture, moving GPS, spoken navigation, permission
and app-resume behavior, then the already-documented native driver route
annotation-to-style-layer migration if confirmed visually.

APK: `apps/mobile/smarttaxi_app/build/app/outputs/flutter-apk/app-debug.apk`.
After device approval, install with `adb install -r`, verify localhost build,
and use only local test accounts/dev SMS. Do not switch to an emulator or use
production auth to work around this blocker.

## Release boundaries still open

- Official per-region RKA exports (`rka,label,lat,lng` plus checksum passport)
  are still required. The Pavlodar spreadsheet must not be imported.
- Real merchant/SMS sender approval, legal/operator decisions, licensed
  navigation safety data, iOS/Mac/store work remain external prerequisites.
- Map routing uses OSRM's available driving routes/time model, not a verified
  live-traffic service. No live-traffic or regulatory speed-data guarantee is
  made. Final local readiness used `https://router.project-osrm.org`; the
  optional self-hosted OSRM profile was not running. Successful demo-service
  QA does not establish production routing capacity or availability.
- Final signed Android release/store acceptance follows physical QA; a debug
  APK and old signed artifact are not evidence of release acceptance.
- Railway subdirectory build contexts still require their documented
  configuration migration to consume the root lock. Local Compose is covered.
- Repeat the final clean root-context Docker builds after npm registry
  connectivity recovers; the documented local QA fallback is not a release
  artifact or a clean-build acceptance substitute.
- Git pushes succeeded. Remote CI result was not independently read because
  GitHub CLI is not authenticated; locally executed checks are stated above.

No claim is made that the entire product is commercially ready or that every
screen has passed physical-device QA.
