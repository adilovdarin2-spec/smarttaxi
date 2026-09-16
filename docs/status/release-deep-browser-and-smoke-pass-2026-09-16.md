# BaiSapar deep browser and release-smoke pass — 2026-09-16

## Result

The local Docker release stack was exercised again without a phone and without
production account/order mutation. Two confirmed defects were fixed:

1. Admin support cards concatenated the ticket topic and its role/date line
   (`Работа приложенияВодитель`). The support/road card now uses the same
   header hierarchy as the other control-centre cards. A CSS contract test and
   a fresh real-browser screenshot cover the regression. Commit: `8aae9d8`.
2. The aggregate release smoke still exercised the pre-authentication driver
   application contract. It now registers a fresh local client through dev SMS,
   submits an application owned by that account and supplies the same token for
   application document upload/listing. A development/dev-SMS readiness guard
   prevents this mutating smoke from running against production. Commit:
   `f59f0f7`.

## Real browser coverage

All checks used the built nginx web image at `http://127.0.0.1:5175` and the
development API at `http://127.0.0.1:4001`:

- owner: all 19 control-centre sections;
- finance: all 16 permitted control-centre sections;
- passenger account: 15 profile/account screens at 390 and 360 px;
- driver presentation: login, line, orders and earnings at 390/360/320 px;
- driver/passenger lifecycle: live incoming order without refresh, guarded
  failed actions, acceptance, pickup and destination route layers, GPS retry,
  longitude-only and trailing-fix publication, arrived/waiting/trip/payment and
  account recovery;
- price negotiation: offer, counter, decline/accept, stale-decision refusal and
  lost-acknowledgement recovery at 320 px;
- taxi stands: accurate-GPS join, seat write/reconciliation, passenger booking
  and cancellation, unknown-GPS heartbeat and owner closure recovery;
- regional building/address picker: 13/13 samples resolved to their expected
  local address or real POI; 11 used an actual selected building footprint and
  two were real POIs without an available footprint.

No page error or unexpected API 4xx was observed in the read-only role passes.
The lifecycle scripts deliberately exercise expected rejected actions and
verify that their state is preserved.

## API, routing and build evidence

- `npm --prefix apps/api test`: passed, including 121,361 local address rows,
  catalogue invariants for all 13 regions, stands, cancellation review,
  onboarding ownership and route/location contracts.
- `npm --prefix apps/api run smoke:qa-docker`: passed end to end after the smoke
  correction: readiness, maps, route selection, auth, client flow,
  payment/rating, driver core and document upload/review.
- Route selection compared the API result to the minimum-duration OSRM
  candidate and checked departure heading. The three preview requests returned
  one provider candidate each in this run, so this is not evidence of live
  traffic or a claim that every real road is optimal.
- `npm --prefix apps/web test`: 187/187 passed.
- `npm --prefix apps/web run build`: passed, including the map build check.
- The rebuilt local Compose API and web services reached healthy state.

## Deployment evidence

Web deployment `c1fb214b-ffc4-4370-b197-36d6347629be` succeeded on the
authorized temporary Railway service. Public `/admin` returned 200 and its
published CSS contains the support-card header fix. The document-smoke change
is test tooling only and does not require an API runtime deployment.

## Still not certified by this pass

- moving/off-route physical navigation, spoken guidance and long-running
  background GPS;
- real stand operation with several drivers and owner-drawn production stands
  outside the existing demo region;
- official per-region address exports/checksums, SMS sender, merchant, legal,
  domain/store and signing-key-owner inputs;
- production/staging capacity for writes, sockets, GPS and routing, or a
  5,000-active-user SLO;
- real regional road/access acceptance, including the documented Maktaaral
  provider detour.

## Android toolchain follow-up

The later [AGP 9 compatibility pass](android-agp9-compatibility-2026-09-16.md)
replaced the older Gradle/AGP/Kotlin set, compiled a profile APK and retained
Flutter's documented legacy-KGP compatibility mode for five not-yet-migrated
published plugins.
