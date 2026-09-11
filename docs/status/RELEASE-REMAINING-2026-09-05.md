# SmartTaxi — remaining release acceptance

This is the current acceptance list, not a claim that every screen or external
integration is production-ready. The historical August "final readiness" report
does not replace the September evidence. Work and QA remain local on `dev`.

## Verified local baseline

Latest September 10/11 evidence: [local release gate](local-release-gate-2026-09-10.md).
The complete API checks, 134 web tests/build, 278 Flutter tests/analyze and a
fresh local-endpoint APK passed.
New passenger card collection/uncredited top-up intents fail closed until real
provider integration. Historical records remain owner-readable/removable; existing
raw card data was not migrated and requires an owner-controlled retention decision.
The newest cable-free APK is built and signature-verified, **not installed**;
physical-device verification is intentionally pending while the current work
continues without the phone. Earlier installed-candidate evidence below is
historical, not current.

- API dependency policy and 36 checks; web 49 tests and production build.
- Standard root-lock Docker images, healthy local API/web/PostgreSQL/Redis,
  actual isolated backup restoration. No database volume was removed.
- npm TLS validation enabled by default in both API build contexts and Compose;
  verified root-lock rebuild, offline API checks and local runtime readiness.
- Browser passenger address/map selection, Economy/Delivery KZT estimates,
  payment selection and complete paired driver/passenger trip lifecycle.
- Compact tariff previews keep the approved full-size picker cursor unchanged
  while scaling confirmed endpoint copies so short routes remain visible;
  address search reports an in-progress state instead of a false zero count.
- Browser delayed/trailing GPS recovery, permission loss, failed actions,
  active/unpaid-trip restoration and stale-session isolation.
- Native GPS queue/route ordering, presentation, transport and creation
  reconciliation plus passenger route framing and socket session isolation:
  272 tests and clean analysis. Address search now exposes Android address
  keyboard/autofill semantics and localized close/clear icon tooltips. The
  newest localhost candidate is built and signature/hash-verified but remains
  uninstalled because no ADB device is currently exposed; earlier physical
  installation evidence remains historical.
- Physical Android passenger pre-order screens and the driver lifecycle through
  manual local CASH receipt were exercised. The revised route/flag and home
  footer are visually confirmed; this does not close all native acceptance.
- Sep 6 screen redesign: compact shared theme, original matching vehicle art,
  15 web account sections at two widths, physical passenger/account and driver
  screens. Native primary trip actions remain reachable above bottom navigation;
  completed settlement is shown without an obsolete map. Final installed home,
  tariffs, payment and settlement were recaptured. See the current redesign
  report for intermediate-capture qualifications and remaining states.
- Sep 6 composition refinement: bundled licensed Inter typography, simplified
  startup, edge-to-edge passenger/driver chrome, full-height native address
  search and a shared lighter map palette. Duplicate provider buildings are
  hidden while SmartTaxi buildings remain below labels/routes/markers. The final
  localhost APK was installed and hash-verified on the physical phone.
- Android/web read-after-uncertain-creation recovery, with a compiled-browser
  proof of actual backend commit, lost response and exactly one creation POST.
- Strict route/maneuver validation, correct missing intercity rate inheritance,
  and 34 actual local tariff previews across all 13 regions plus four intercity
  directions; the paired browser lifecycle also passed against that API.
- The dedicated `smoke:qa-docker` command pins the host-side release smoke to
  port 4001 and includes minimum-ETA route candidate validation, preventing an
  accidental pass or failure against the older local port-4000 stack.

## Technical acceptance still to finish

| Item | What closes it | Current constraint |
|---|---|---|
| Passenger/driver visual parity | Continue the remaining native nested error and recovery-state comparison against the current reference boards | Web passenger region-bootstrap failure is now visually checked at 390x844 on both home and address picker, with an in-context retry that restores all 13 regions without reload. The connected phone already covers native passenger home, address picker, route, driver-found, active trip, receipt and rating in the local lifecycle, plus the driver line, incoming order, navigator, profile, settings and both themes. Physical permission/recovery states still require the phone. |
| Driver account in passenger mode | Closed — live local API check plus `stage11-driver-core-smoke.js` cover driver → passenger → driver, client wallet and recurring bookings | The acting token is correctly CLIENT-scoped in passenger mode while the persisted account stays DRIVER. Wallet and recurring bookings return `200`; the former 403/404 note was superseded by the current route/token contract. |
| Native automatic dispatch after account switch | Closed — observe the new driver order without manual refresh on the revised APK | A newly registered local rider's order appeared in the already-signed-in, online driver app and was accepted/completed through the native driver UI. The library-level stale-session reproduction also fails before and passes after the fix. |
| Moving GPS, resume, background tracking, spoken navigation | Real-device permission/revocation/resume and controlled route QA | Unit tests and browser GPS fixtures do not establish physical behavior |
| Native driver route layer | Closed — current phone navigator inspected after the style-layer migration | The physical driver navigator displayed the 1.2 km road-shaped route, turn prompt, ETA, building footprints, readable labels, compact car and destination marker. This is current-device evidence in addition to the shared GeoJSON/style-layer regression test. |
| Intercity/region acceptance | Representative real booking/direction/GPS checks across enabled regions | Read-only route/price previews pass across 13 regions and four intercity directions; Maktaaral has a flagged provider detour needing road-access review, and real regional journeys remain unverified |
| Production routing capacity | Agreed staging/self-hosted provider, data and capacity testing before rollout | Local readiness currently uses the public OSRM demo; no load test should target that shared service |
| Deployment and remote CI acceptance | Read CI results; apply and verify an authorized staging/production configuration | No production deploy is authorized in this local QA pass; Railway root-context adoption still needs service settings migration |
| Final Android release artifact | Owner-controlled signing-key backup, final configured endpoints and Play Console acceptance | The newest development-only cable-free candidate is `SmartTaxi-customer-WiFi-2026-09-11.apk` (signature and SHA-256 verified); it targets the isolated private-LAN QA stack and cannot become a store artifact. Installation is pending until phone QA resumes. The earlier signed local AAB remains recorded in `release-qa-local-2026-09-08.md`; no store upload is authorized. |

The current transport/recovery pass fixes unsafe native write replay, stale
session-expiry callbacks and recovery after an uncertain order response in both
clients. These fixes do not replace the device/network acceptance rows above.

Non-blocking build warnings also remain visible: future Flutter support for
the current Gradle/AGP/Kotlin versions and the large web MapLibre chunk. A
toolchain/performance follow-up needs its own compatibility/device checks;
these warnings did not prevent the current builds.

## External inputs — cannot be fabricated

- Authorized per-region address files with `rka,label,lat,lng`, plus separate
  checksum `meta.json`. The Pavlodar spreadsheet is not an eligible import.
- Operator/legal decisions, registration, contracts and verified publication
  content. Existing documents are not proof that those external actions occurred.
- Real merchant approval and SMS sender authorization; no production accounts,
  SMS sending or synthetic merchant success is part of local QA.
- Licenses/provider capacity and authoritative navigation safety data where
  required. Do not claim live traffic or verified regulatory speed limits from
  the present OSRM setup.
- Developer-store access, owner-controlled signing-key backup and iOS/macOS
  prerequisites. Do not print or copy private signing credentials into reports.

## Evidence index

- [Current local release gate](local-release-gate-2026-09-10.md)
- [Web map, address and route visual pass](web-map-route-visual-pass-2026-09-10.md)
- [Physical-device QA helper safety and lifecycle fix](physical-device-qa-harness-pass-2026-09-10.md)
- [Compatible Flutter dependency refresh](flutter-dependency-refresh-2026-09-10.md)
- [Compatible Node dependency refresh](node-compatible-dependency-refresh-2026-09-10.md)
- [Post-refresh live web visual pass](web-post-refresh-visual-pass-2026-09-10.md)
- [Passenger wallet readiness and new artifacts](client-wallet-readiness-2026-09-09.md)
- [Web driver account, modes and recovery](web-driver-account-pass-2026-09-09.md)
- [Composition, typography and map refinement](composition-redesign-2026-09-06.md)
- [Current screen redesign and installed candidate](screen-redesign-2026-09-06.md)
- [Current continuation](SESSION-2026-09-05-CONTINUATION.md)
- [Physical Android pass and installed candidate](physical-android-qa-2026-09-06.md)
- [Phone installation diagnostic](phone-install-diagnostics-2026-09-05.md)
- [Presentation/screenshots](visual-refinement-2026-09-05.md)
- [Route/GPS ordering](gps-publication-ordering-2026-09-05.md)
- [GPS failure recovery](driver-gps-feedback-2026-09-05.md)
- [Web session isolation](web-session-isolation-2026-09-05.md)
- [Transport and cross-client booking recovery](transport-and-order-recovery-2026-09-05.md)
- [Regional routing and provider validation](regional-routing-2026-09-05.md)
- [Docker TLS defaults and verified rebuild](docker-tls-defaults-2026-09-05.md)
- [Docker build boundary](../DOCKER_BUILDS.md)
