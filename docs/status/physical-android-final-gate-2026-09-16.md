# Physical Android final gate — 2026-09-16

This pass used the connected Android device `2409BRN2CY` against the isolated
local development stack only. API/socket were
`http://127.0.0.1:4001` and web was `http://127.0.0.1:5175`, exposed to the
device through `adb reverse`. Readiness reported `env=development`, `sms=dev`,
PostgreSQL/Redis/OSRM healthy. No production SMS, payment account or production
user was used.

## Artifact

- Rebuilt `apps/mobile/smarttaxi_app/build/app/outputs/flutter-apk/app-profile.apk`
  with the three local QA URLs above.
- Installed successfully over `kz.baisapar.app` on the connected phone.
- Installed version: `1.0.0` (`versionCode=2`).
- Cold start completed in 3.412 seconds.
- This remains a local profile QA artifact, not a store-signed release APK.

## Real device flow

Passenger surfaces verified on the installed build:

- restored local passenger session and map startup;
- current-position address `улица Бектасова, 60, Мырзакент`;
- destination search for `60`, returning multiple real house-level catalogue
  results;
- map picker resolving the selected building area to
  `улица Бектасова, 56, Мырзакент`;
- route preview, ETA/distance and two tariff cards (Economy and Delivery);
- passenger drawer and stands map;
- empty stand detail uses the compact sheet and does not offer a nonexistent
  driver's phone action.

Driver surfaces verified using the local seeded driver only:

- password login and driver home;
- `OFFLINE -> ONLINE` transition and active location state;
- incoming local QA order, price, passenger contact and route summary;
- accept, drive to client, navigator, arrive, waiting, start trip;
- destination route rendered along the road, not as a straight line;
- complete trip, confirm cash payment, rate passenger, and finish;
- postcondition: no active trip and driver returned to `OFFLINE`.

The local QA order was
`e4bc9bed-e88f-4fcf-b1e5-469064c17a33`. It reached its paid/rated terminal
state through the real mobile UI. No confirmed visual or functional regression
was found during this pass.

## Automated gate repeated in the same pass

- API test chain: passed, including 121,361 address rows across 13 regions.
- Web tests: 187/187 passed.
- Web production build and map build check: passed.
- Flutter analyze: no issues.
- Flutter tests: 372/372 passed.
- Docker Compose config: valid.
- Guarded Docker smoke: health, maps, route selection, client/driver lifecycle,
  payments/ratings and driver documents passed.

## Boundaries that remain external or field-only

- Five regions still require their authoritative house-level export with
  `rka`, `label`, `lat`, `lng` plus a separate checksummed `meta.json`.
- Production SMS sender/Infobip, payment merchant approval, production push
  credentials, legal entity/contracts, final domain/server decisions and store
  signing are owner/vendor inputs and were not fabricated.
- Moving-vehicle GPS, off-route recalculation, spoken guidance, background
  execution and a real multi-driver stand day still require controlled field
  acceptance. Public OSRM provides estimated routing, not live traffic or an
  official road-access guarantee.
