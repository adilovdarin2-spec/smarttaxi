# SmartTaxi — remaining release acceptance

This is the current acceptance list, not a claim that every screen or external
integration is production-ready. The historical August "final readiness" report
does not replace the September evidence. Work and QA remain local on `dev`.

## Verified local baseline

- API dependency policy and 36 checks; web 46 tests and production build.
- Standard root-lock Docker images, healthy local API/web/PostgreSQL/Redis,
  actual isolated backup restoration. No database volume was removed.
- npm TLS validation enabled by default in both API build contexts and Compose;
  verified root-lock rebuild, offline API checks and local runtime readiness.
- Browser passenger address/map selection, Economy/Delivery KZT estimates,
  payment selection and complete paired driver/passenger trip lifecycle.
- Browser delayed/trailing GPS recovery, permission loss, failed actions,
  active/unpaid-trip restoration and stale-session isolation.
- Native GPS queue/route ordering, presentation, transport and creation
  reconciliation plus passenger route framing and socket session isolation:
  122 tests and clean analysis. The latest localhost redesign/home-camera
  candidate was installed on the physical phone and hash-verified.
- Physical Android passenger pre-order screens and the driver lifecycle through
  manual local CASH receipt were exercised. The revised route/flag and home
  footer are visually confirmed; this does not close all native acceptance.
- Sep 6 screen redesign: compact shared theme, original matching vehicle art,
  15 web account sections at two widths, physical passenger/account and driver
  screens. Native primary trip actions remain reachable above bottom navigation;
  completed settlement is shown without an obsolete map. Final installed home,
  tariffs, payment and settlement were recaptured. See the current redesign
  report for intermediate-capture qualifications and remaining states.
- Android/web read-after-uncertain-creation recovery, with a compiled-browser
  proof of actual backend commit, lost response and exactly one creation POST.
- Strict route/maneuver validation, correct missing intercity rate inheritance,
  and 34 actual local tariff previews across all 13 regions plus four intercity
  directions; the paired browser lifecycle also passed against that API.

## Technical acceptance still to finish

| Item | What closes it | Current constraint |
|---|---|---|
| Passenger/driver visual parity | Complete current native state coverage and compare with web/reference boards | Current redesign APK is installed and hash-verified. Home/tariffs/payment, account sections and driver lifecycle were inspected; Line is map-first and trip actions fixed above navigation. Native passenger waiting/active/receipt, nested forms/errors and functional settings parity remain; shared styling is not full-state acceptance |
| Native automatic dispatch after account switch | Observe the new driver order without manual refresh on the revised APK | The library-level stale-session reproduction fails before and passes after the fix. Native passenger assignment updates were received, but native driver incoming after account switch still needs its device check |
| Moving GPS, resume, background tracking, spoken navigation | Real-device permission/revocation/resume and controlled route QA | Unit tests and browser GPS fixtures do not establish physical behavior |
| Native driver route layer | Apply the documented annotation-to-style-layer plan with before/after device evidence | Actual on-device route is still visually heavy and has label-ordering differences from the passenger map. Existing renderer was preserved in the redesign; dedicated route/marker/layer regression QA is still needed |
| Intercity/region acceptance | Representative real booking/direction/GPS checks across enabled regions | Read-only route/price previews pass across 13 regions and four intercity directions; Maktaaral has a flagged provider detour needing road-access review, and real regional journeys remain unverified |
| Production routing capacity | Agreed staging/self-hosted provider, data and capacity testing before rollout | Local readiness currently uses the public OSRM demo; no load test should target that shared service |
| Deployment and remote CI acceptance | Read CI results; apply and verify an authorized staging/production configuration | No production deploy is authorized in this local QA pass; Railway root-context adoption still needs service settings migration |
| Final Android release artifact | Device acceptance, owner-controlled signing/backup and final configured endpoints | A debug APK or an old signed AAB is not release acceptance |

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
