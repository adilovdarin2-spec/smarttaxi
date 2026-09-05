# SmartTaxi — remaining release acceptance

This is the current acceptance list, not a claim that every screen or external
integration is production-ready. The historical August "final readiness" report
does not replace the September evidence. Work and QA remain local on `dev`.

## Verified local baseline

- API dependency policy and 36 checks; web 46 tests and production build.
- Standard root-lock Docker images, healthy local API/web/PostgreSQL/Redis,
  actual isolated backup restoration. No database volume was removed.
- Browser passenger address/map selection, Economy/Delivery KZT estimates,
  payment selection and complete paired driver/passenger trip lifecycle.
- Browser delayed/trailing GPS recovery, permission loss, failed actions,
  active/unpaid-trip restoration and stale-session isolation.
- Native GPS queue/route ordering, presentation, transport and creation
  reconciliation: 89 tests, clean analysis and an explicit localhost debug APK.
- Android/web read-after-uncertain-creation recovery, with a compiled-browser
  proof of actual backend commit, lost response and exactly one creation POST.

## Technical acceptance still to finish

| Item | What closes it | Current constraint |
|---|---|---|
| Current Android APK on the physical phone | Install the explicit localhost build; verify its endpoint and local login | Phone is visible to ADB, but the previous installs were rejected by the device; installation approval has not been confirmed |
| Passenger/driver visual parity | Capture the full current Android state sequence and compare with web/reference boards | Native snapshots from older builds are not acceptance of the current APK |
| Moving GPS, resume, background tracking, spoken navigation | Real-device permission/revocation/resume and controlled route QA | Unit tests and browser GPS fixtures do not establish physical behavior |
| Native driver route layer | First inspect the active route on-device; implement the documented annotation-to-style-layer plan only if needed | Renderer must not be changed blindly |
| Intercity/region acceptance | Representative real booking/direction/GPS checks across enabled regions and validation of provider failures | Existing service-bound address tests do not prove every real-world street/route |
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

- [Current continuation](SESSION-2026-09-05-CONTINUATION.md)
- [Presentation/screenshots](visual-refinement-2026-09-05.md)
- [Route/GPS ordering](gps-publication-ordering-2026-09-05.md)
- [GPS failure recovery](driver-gps-feedback-2026-09-05.md)
- [Web session isolation](web-session-isolation-2026-09-05.md)
- [Transport and cross-client booking recovery](transport-and-order-recovery-2026-09-05.md)
- [Docker build boundary](../DOCKER_BUILDS.md)
