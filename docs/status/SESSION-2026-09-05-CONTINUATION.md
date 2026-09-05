# SmartTaxi continuation — 2026-09-05

**Sep 6 update:** the owner's restart allowed installation, and the latest
localhost candidate was subsequently installed and hash-verified too. See
[physical Android QA](physical-android-qa-2026-09-06.md) for actual native
screens, the driver lifecycle, 95 passing Flutter tests and current open
acceptance items. The historical device-blocker section below is superseded
by that report; do not repeat its installation diagnosis as current state.

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
- GPS publication follow-up: reproduced the delayed-write route race, gated web
  and Flutter route refresh on location acknowledgement, retained trailing GPS
  updates, and restored Android GPS after a cold active-trip restore. See
  `gps-publication-ordering-2026-09-05.md` for scope and causal browser evidence.
- Driver GPS feedback follow-up: visible permission/publication errors, safe
  retry on all five tabs and verified active-trip preservation when permission
  is revoked. See `driver-gps-feedback-2026-09-05.md`.
- Web session isolation: a late old-token 401 no longer evicts a newer login;
  driver async callbacks cannot restore old-session state after logout. Real
  current-session revocation remains enforced. See `web-session-isolation-2026-09-05.md`.
- Native transport and booking recovery: unsafe automatic write retries were
  removed, old-session expiration is ownership-checked, and Android/web restore
  server-confirmed active orders after an uncertain creation response without
  resending the POST. The local compiled browser verified actual response loss
  after creation, then passed the full paired lifecycle again. See
  `transport-and-order-recovery-2026-09-05.md`.
- Regional routing follow-up: strict provider route/maneuver validation and
  correct SQL-null intercity rate inheritance. All 34 local tariff/route
  previews across 13 regions and four intercity directions pass, followed by
  the complete paired browser lifecycle. An unusual Maktaaral detour is
  explicitly retained for road-access review. See `regional-routing-2026-09-05.md`.
- Docker TLS follow-up: npm certificate verification defaults to true in both
  API Dockerfiles and Compose, guarded by a new CI policy check. The local
  locked API rebuilt with verified TLS, passed its full offline test suite,
  and was recreated successfully without touching database volumes. See
  `docker-tls-defaults-2026-09-05.md`.

Web code/evidence is described in `web-picker-and-trip-recovery-2026-09-05.md`
and `web-driver-lifecycle-2026-09-05.md`. API-backed browser scenarios are not
substitutes for physical Android acceptance or a real drive.

## Local verification

- API: dependency-policy pretest and all 36 checks pass, including payment
  authorization. The final root-context image also passed without network
  access, with dummy test env and read-only cross-client source mounts.
- Web unit tests: 46/46 (lifecycle/marker/publication/feedback/session/recovery checks);
  tests are included in Node 22 CI.
- Web production build and local browser address/lifecycle scenarios pass.
- Flutter analyze: no issues. Full tests after transport/order recovery: 89 passed.
- Android debug APK rebuilt with local API/socket `http://127.0.0.1:4001`
  and web `http://127.0.0.1:5175`; no production endpoint defines.
- Compose config is valid; API/PostgreSQL/Redis/web health checks pass.
- Actual backup/restore: 40 tables, 128 indexes, 121,361 addresses,
  13 regions and 52 tariffs match. Existing restore targets are refused.
- Production/non-optional dependency audit: zero findings. Full lock still
  contains eight moderate optional-chain findings; no high/critical findings.

## Current local QA runtime

The earlier npm registry network blocker cleared during the GPS follow-up.
Both normal root-context images passed `rtk docker compose build api web`,
including fresh locked npm installation and the web production build.
API/web were then recreated from `smarttaxi-api` / `smarttaxi-web` using the
regular configuration. All four services are healthy; API readiness confirms
development mode, database, Redis and OSRM. Web no longer has a bind mount.

The current local runtime uses standard Compose:

```text
rtk docker compose up -d --no-deps --build api web
```

PostgreSQL/Redis containers and database volumes were not recreated. The former
fallback API image, machine-specific override, `web-static-gps-final` snapshot,
older frozen builds/diagnostics and rehearsal backup remain recoverable under
their existing ignored paths. Do not deploy or reapply that old override as the
current runtime. See `gps-publication-ordering-2026-09-05.md` for final browser
evidence and the resolved write-before-route regression.

## Device blocker — action required

The physical `2409BRN2CY` Android phone is connected and authorized for ADB.
USB reverse ports 4001 and 5175 are configured. Repeated owner-requested
installation attempts returned `INSTALL_FAILED_USER_RESTRICTED: Install
canceled by user`, but the owner reports no confirmation window appeared.
Further inspection confirms USB installation/debugging switches are already
enabled. Xiaomi's confirmation activity logs an exception during creation,
finishes, and is followed by the refusal. This is not proof that the owner
pressed Cancel. See `phone-install-diagnostics-2026-09-05.md` for the exact
evidence and uncertainty. An owner-controlled restart/reconnection is the
next diagnostic. No security setting was bypassed, no app was uninstalled
and no app data cleared.

A separate attempt to open local web in the phone browser was rejected by
the available automation channel. No phone-browser screenshots or native
acceptance are claimed from that attempt.

The existing installation was not used for orders because its backend could
not be established as the local development backend. Pending on-device work:
passenger and driver screen capture, moving GPS, spoken navigation, permission
and app-resume behavior, then the already-documented native driver route
annotation-to-style-layer migration if confirmed visually.

APK: `apps/mobile/smarttaxi_app/build/app/outputs/flutter-apk/app-debug.apk`.
After the confirmation flow works and device approval, install with `adb install -r`, verify localhost build,
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
- Git pushes succeeded. Remote CI result was not independently read because
  GitHub CLI is not authenticated; locally executed checks are stated above.

No claim is made that the entire product is commercially ready or that every
screen has passed physical-device QA.

The consolidated current acceptance list is `RELEASE-REMAINING-2026-09-05.md`.
Historical August readiness reports do not replace this September evidence.
