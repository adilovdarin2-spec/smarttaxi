# SmartTaxi visual refinement — 2026-09-05

Presentation pass on `dev`, following the three user-supplied design boards in
Downloads and the approved `design-reference/README.md` marker specification.
The actual local application was reviewed before and after the changes. These
are application screenshots, not generated mockups or substituted API data.

## What changed

- Added `apps/web/src/presentation.css`, loaded after the historical stylesheet
  and scoped to passenger/driver shells, away from admin/operator surfaces.
- Replaced heavy text, large shadows and competing blue backgrounds with a
  consistent blue/white hierarchy: 26px medium headings, readable neutral copy,
  thin borders, quieter shadows and the existing #1D6FFF / #0B4FD1 palette.
- Refined home/address sheets, route summary, tariff cards and primary actions.
  Existing original sedan/van art is now visibly larger; each of the two tariffs
  has a separate right-aligned real KZT price and a clear selection indicator.
  No unsupported tariff, invented ETA or new vehicle asset was introduced.
- Refined payment, search/active-trip cards, driver surfaces, menu, profile,
  favorites, settings and support. Profile information no longer runs together;
  full vehicle details can wrap. Fixed white account text on a newly light menu
  card, found during visual inspection, and guarded its actual computed color.
- Payment choices now retain keyboard focus, close with Escape and restore focus
  to their opening control. Keyboard focus has a visible blue outline.
- Flutter shared typography, shadows, sheet radii, buttons, driver controls and
  passenger tariff presentation follow the same direction. Original image assets
  are retained. Light/dark action widgets were tested at 360px with 130% text.

Map geometry/renderers, marker assets, route selection, pricing, order statuses,
authentication and payment-provider integrations were not changed by this pass.
The native driver annotation renderer remains unchanged pending physical QA.

## Verification

- `rtk npm --prefix apps/api test`: dependency policy plus all 36 checks passed.
- `rtk npm --prefix apps/web test`: 17/17 passed.
- `rtk npm --prefix apps/web run build`: passed with the exact local Compose
  public VITE arguments; the existing large MapLibre chunk warning remains.
- Flutter analyze: no issues; full tests: 53/53 passed, including three new
  presentation checks. The new test file was formatted and retested separately.
- Local-only Android debug APK built successfully with API/socket on
  `http://127.0.0.1:4001` and web on `http://127.0.0.1:5175`. Build tools reported
  upcoming Gradle/AGP/Kotlin support warnings; no validation was bypassed.
- `rtk docker compose config -q`: passed. API readiness reported development,
  database OK, Redis PONG and a successful OSRM test route; all four services
  were healthy.
- Final client browser smoke passed at 390×844 and 360×740: resolved address,
  map picker, region recentering, stale reverse-response guard, both KZT fares,
  route pixels, payment focus and failed-reverse manual recovery.
- Final paired driver/passenger browser smoke passed: real local dev-SMS client,
  seeded local driver, simulated browser GPS, incoming order, failed-action
  preservation, accept/going/arrived/waiting/trip/complete/paid, live routes and
  unpaid-trip recovery. Menu/account screens were inspected read-only; support
  was not submitted and personal profile data was not changed.
- Screenshots were inspected at both compact widths. Additional guards cover
  heading weight, menu contrast, original car size and horizontal overflow.

### Intermittent observation retained

Follow-up: the write-before-route race was subsequently reproduced with a delayed
real location PATCH and fixed. See `gps-publication-ordering-2026-09-05.md` for
the causal regression and passing post-fix checks. The account below describes
the observation at the time of the design pass, before that correction.

One final-repeat lifecycle run exceeded the unchanged 25-second wait for the
driver's route after a longitude-only GPS update. The location API and passenger
route had the new longitude; the last driver route still had the old longitude.
Readiness was healthy afterwards. The unchanged test passed on the next run,
including both live route updates. This is not evidence that the intermittent
timing issue has been fixed; keep it on the route/GPS reliability QA list.

The unsuccessful run was moved recoverably to the ignored local directory
`tmp-2026-09-05-captures/visual-refinement-transient-driver-qa/`. Final committed
driver evidence comes from the subsequent complete passing run, not a mixture
of its frames and the failed run. No test timeout was relaxed or route response
replaced to obtain a pass.

## Evidence

All final evidence is under `screenshots/2026-09-05-visual-refinement/`:

- [Home](screenshots/2026-09-05-visual-refinement/client/home.png)
- [Tariffs](screenshots/2026-09-05-visual-refinement/client/tariffs.png)
  and [360px](screenshots/2026-09-05-visual-refinement/client/tariffs-360.png)
- [Payment](screenshots/2026-09-05-visual-refinement/client/payment.png)
- [Address picker](screenshots/2026-09-05-visual-refinement/client/address-map.png)
- [Driver trip route](screenshots/2026-09-05-visual-refinement/driver/driver-trip-live-route.png)
- [Passenger trip route](screenshots/2026-09-05-visual-refinement/driver/passenger-trip-live-route.png)
- [Menu](screenshots/2026-09-05-visual-refinement/driver/passenger-menu.png),
  [profile](screenshots/2026-09-05-visual-refinement/driver/passenger-profile.png),
  [support](screenshots/2026-09-05-visual-refinement/driver/passenger-support-360.png),
  [settings](screenshots/2026-09-05-visual-refinement/driver/passenger-settings.png)
- [Lifecycle assertions](screenshots/2026-09-05-visual-refinement/driver/result.json)
  and [sanitized network evidence](screenshots/2026-09-05-visual-refinement/driver/network.json)

## Local runtime and remaining boundaries

Port 5175 serves a frozen production build through the existing nginx container.
The ignored override now mounts `tmp-2026-09-05-captures/web-static-design-final`
read-only. Only web was recreated during this design pass; database/Redis/API
state and older frozen snapshots were preserved. This uses the previously
documented local Docker-build recovery arrangement, not a release image.

The rebuilt APK has not passed phone installation or native visual acceptance.
The device-side installation restriction recorded in
`SESSION-2026-09-05-CONTINUATION.md` was not bypassed or retried in this pass.
Flutter unit/widget/build success does not establish pixel parity, spoken
navigation, moving-device GPS or permission/resume behavior on a real phone.

Official RKA exports, legal/operator decisions, merchant/SMS approvals, external
licenses, iOS/store work and routing capacity remain outside this presentation
pass. No commercial-readiness or pixel-identical-to-reference claim is made.
