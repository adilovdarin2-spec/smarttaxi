# BaiSapar — remaining release acceptance

This is the current acceptance list, not a claim that every screen or external
integration is production-ready. The historical August "final readiness" report
does not replace the September evidence. Work and mutating QA remain local on
`dev`; tested changes are now deployed to the authorized temporary Railway
services, followed by read-only production verification.

## Current September 16 evidence

The September 15 narrative below is historical, not the latest test count or
deployment state. Current stages:

- [Regional address/search and role QA](regional-search-and-role-qa-2026-09-16.md).
- [Stand concurrency](stand-concurrency-and-map-cleanup-2026-09-16.md),
  [outcome recovery](stand-outcome-recovery-2026-09-16.md), and
  [negotiation/driver shift atomicity](negotiation-and-driver-shift-2026-09-16.md).
- [Assignment-policy parity](assignment-policy-parity-2026-09-16.md).
- [Web price negotiation parity](web-price-negotiation-parity-2026-09-16.md):
  driver offers, passenger counters, competing offers, explicit selection vs
  acceptance and lost-acknowledgement recovery. Web 185 tests; Flutter 354 tests;
  API suite/build checks passed. Phone use is excluded from the current run.
- [Displayed-price consent](price-offer-consent-2026-09-16.md): stale decisions
  fail closed under the order/queue lock; web/Flutter submit displayed terms.
  Local HTTP, PostgreSQL and real 320/390px browser conflicts passed, including
  unchanged stand reservations and separate confirmation of the refreshed price.
  Web 186 tests; Flutter 359 tests. Old clients must update for negotiation.
- [Authenticated driver onboarding](driver-onboarding-2026-09-16.md): applicant
  ownership, owner-selected region, transactional profile creation and document
  linking; status restoration/correction in web/Flutter. Real local HTTP,
  PostgreSQL rollback and 320/390px browser flows passed. Web 186 tests;
  Flutter 366 tests including document-read failure recovery and 320px/200%
  text-scale layout; fresh signed profile APK. API/web deployed to Railway.
  No phone used.
- [Local API/PostgreSQL capacity baseline](local-capacity-baseline-2026-09-16.md):
  three read-only Docker runs served 5,000 distinct virtual users at 100, 250
  and 500 concurrent connections with 5,000/5,000 HTTP 200 responses. This is
  a narrow local baseline, not production sizing or routing capacity acceptance.

The API now uses a private Railway OSRM service, not the public routing demo.
Production readiness still reports missing SMS honestly. No unit/browser pass
proves moving navigation, complete official address coverage or a production
capacity target. The previously reproduced driver-application gap is now covered
by authenticated new-account onboarding, not just seeded-driver smoke tests.
Legacy anonymous applications cannot be claimed by a freely entered phone;
applicants must resubmit from their own authenticated account.
Negotiated-price replacement
during acceptance is covered by the September 16 consent stage; this does not
prove every unrelated order-edit or direct base-price acceptance race.

## Verified local baseline

Latest September 15 evidence: [post-Claude release audit](post-claude-release-audit-2026-09-15.md),
building on the [local release gate](local-release-gate-2026-09-10.md) and
[taxi stands and cancellation review](stands-and-cancellation-review-2026-09-11.md).
The complete API checks, 167 web tests/build, 328 Flutter tests/analyze and a
fresh BaiSapar debug APK passed. Both push and pull-request CI runs for commit
`117baa3` passed all four jobs.
New passenger card collection/uncredited top-up intents fail closed until real
provider integration. Historical records remain owner-readable/removable; existing
raw card data was not migrated and requires an owner-controlled retention decision.
The September 11 physical-device evidence remains useful but is historical. It
is now superseded for the current package by the September 15 physical Android
pass: BaiSapar `1.0.0+2` is installed on the connected phone, the full native
driver lifecycle and background/resume were completed against the local Docker
API, and a forced network loss recovered automatically after the ADB tunnel was
restored. Moving-GPS, spoken guidance and denied-forever permission acceptance
remain field work.

- API dependency policy and its 36 focused checks; the corresponding historical
  web pass had 49 focused tests and a production build.
- Standard root-lock Docker images, healthy local API/web/PostgreSQL/Redis,
  actual isolated backup restoration. No database volume was removed.
- npm TLS validation enabled by default in both API build contexts and Compose;
  verified root-lock rebuild, offline API checks and local runtime readiness.
- Browser passenger address/map selection, Economy/Delivery KZT estimates,
  payment selection and complete paired driver/passenger trip lifecycle at
  320, 360 and 390 px; the 320 px driver shift summary is guarded against
  clipped monetary values.
- Regional reverse lookup returns an exact local house in all eight regions
  that currently have house-number data. In the other five regions, an exact
  catalogued real POI is retained instead of being replaced by a weak provider
  street; nearby POIs still cannot name an unrelated building.
- Compact tariff previews keep the approved full-size picker cursor unchanged
  while scaling confirmed endpoint copies so short routes remain visible;
  address search reports an in-progress state instead of a false zero count.
- Browser delayed/trailing GPS recovery, permission loss, failed actions,
  active/unpaid-trip restoration and stale-session isolation.
- Native GPS queue/route ordering, presentation, transport and creation
  reconciliation plus passenger route framing and socket session isolation:
  328 tests and clean analysis. Address search now exposes Android address
  keyboard/autofill semantics and localized close/clear icon tooltips. The
  September 10 localhost candidate was built and signature/hash-verified; the
  current BaiSapar artifact and its installation status are recorded in the
  table below. Earlier physical installation evidence remains historical.
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
  hidden while BaiSapar buildings remain below labels/routes/markers. The final
  pre-rebrand localhost APK was installed and hash-verified on the physical
  phone; that is not current-package evidence.
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
| Passenger/driver visual and functional parity | Finish the feature/state comparison as well as moving-device and denied-forever checks | The September 16 negotiation pass closes missing web driver offers, counters and competing-offer selection, with actual 320/390px browser QA. It demonstrates why a basic seeded trip lifecycle is not proof of all features. The September 15 phone evidence remains valid for its tested states; moving-GPS field acceptance and unverified feature chains remain open. |
| Taxi stands (стоянки) | Owner draws the real lines in each region; then a working day on a real stand with several drivers | Built and verified on the connected phone: geofenced joining, the offer, phone and app seats, handing a turn over, departure, and the rider's map/sheet/reservation. See [stands and cancellation review](stands-and-cancellation-review-2026-09-11.md). The browser apps now carry the same line for both audiences, a place is released the moment the driver goes off the line or accepts a dispatch order, and the owner's map editor is confirmed working in a real browser. Two demo stands exist in Мырзакент only; nothing is drawn for the other twelve regions, and no real line has been run yet. |
| Cancellation review | Owner works the queue for a few weeks, then the risk threshold and signal weights are retuned against what actually shows up | Every cancellation that reached a driver is now scored and filed; the driver states a reason and the rider can say the driver asked them to cancel. Nothing is charged automatically, by decision. Both browser apps now ask the same question, so a cancellation made from a laptop no longer reaches the queue reasonless. The threshold (25) and weights are reasoned, not data-derived, and a follow-up observation of where the car went is recorded 8 minutes later. |
| Driver account in passenger mode | Closed — live local API check plus `stage11-driver-core-smoke.js` cover driver → passenger → driver, client wallet and recurring bookings | The acting token is correctly CLIENT-scoped in passenger mode while the persisted account stays DRIVER. Wallet and recurring bookings return `200`; the former 403/404 note was superseded by the current route/token contract. |
| Native automatic dispatch after account switch | Closed — observe the new driver order without manual refresh on the revised APK | A newly registered local rider's order appeared in the already-signed-in, online driver app and was accepted/completed through the native driver UI. The library-level stale-session reproduction also fails before and passes after the fix. |
| Moving GPS, resume, background tracking, spoken navigation | Controlled moving-device route plus audible TTS and denied-forever recovery | Current BaiSapar phone pass closed active-trip background/resume and stationary GPS publication/recovery. A desk test cannot certify moving/off-route guidance, background tracking over time or audible announcements. |
| Native driver route layer | Closed — current phone navigator inspected after the style-layer migration | The physical driver navigator displayed the 1.2 km road-shaped route, turn prompt, ETA, building footprints, readable labels, compact car and destination marker. This is current-device evidence in addition to the shared GeoJSON/style-layer regression test. |
| Intercity/region acceptance | Representative real booking/direction/GPS checks across enabled regions | Read-only route/price previews pass across 13 regions and four intercity directions; Maktaaral has a flagged provider detour needing road-access review, and real regional journeys remain unverified |
| Production routing capacity | Capacity testing against owned staging with an agreed traffic mix and latency target | A reproducible local baseline now passes 5,000 read requests from distinct identities at 100/250/500 concurrency with no failures. At 500 concurrency observed p95 varied from 542 to 1,036 ms, so the result is not presented as an SLO. This excludes writes, sockets, GPS and routing. Railway private OSRM health is verified, but production sizing, road-data completeness and a 5,000-active-user certification remain open. Never load-test a shared public provider. |
| Deployment and remote CI acceptance | Successful deployment plus public assets/runtime verification; inspect CI for each release candidate | API/web changes have been deployed to the authorized temporary Railway services with successful rollouts and read-only checks, recorded per-stage above. Production accounts/orders are not QA fixtures. Remote CI evidence for a previous commit does not certify the latest commit. |
| Final Android release artifact | Firebase config, owner-controlled signing-key backup, final configured endpoints and Play Console acceptance | Current profile APK and SHA-256 are recorded in the [September 16 onboarding report](driver-onboarding-2026-09-16.md); it uses the Railway-default endpoint and has not been installed on a phone in this stage. The September 15 debug APK/physical installation is historical, not evidence for this package. A notification-capable store release still needs BaiSapar Firebase configuration and owner release inputs. No store upload is authorized. |

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

- [BaiSapar post-Claude release audit](post-claude-release-audit-2026-09-15.md)
- [Current BaiSapar physical Android QA](physical-android-baisapar-qa-2026-09-15.md)
- [Taxi stands and cancellation review](stands-and-cancellation-review-2026-09-11.md)
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
