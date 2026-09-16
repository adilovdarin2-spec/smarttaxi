# Web price negotiation parity — 2026-09-16

## Confirmed missing functionality

The web driver only had accept/skip actions. Flutter already supported submitting
a driver price, answering the passenger's counter and queued competing offers.
The web passenger could only accept/decline the primary offer; it treated every
pending offer as a driver's proposal, including the passenger's own counter.
Realtime payloads did not carry `driver_offer_proposed_by`.

## Implemented

- Driver: propose/change a whole-KZT amount; validate the same bounds as the API;
  show a pending own offer; accept/decline a counter addressed to this driver.
  Another driver's counter is never actionable. While answering a counter the
  ordinary base-price accept button is hidden; otherwise accepting the base
  price during an own pending offer explicitly names that price.
- Passenger: accept/decline or counter the primary offer; show waiting state
  after a counter without allowing self-acceptance. Competing offers are fetched
  on entry/reload, queue events and visible-page polling, with stale-read/session
  guards and explicit failure/retry. Reviewing a queued offer does not assign
  the trip; separate acceptance is required.
- API events retain proposal author and known offering-driver name. A missing
  name is explicit null so merging cannot keep a different previous driver's name.
- Shared blue/white price form, labelled numeric input, range hint, validation
  error and distinct actions. Existing route/map/login screens are unchanged.
- Driver mutations are single-flight across cards. After a failed acknowledgement
  the UI reads state, never automatically repeats POST. Assignment recovery uses
  only the authenticated driver's matching active-order record. Passenger actions
  also reconcile the matching active order and reject stale-session results.

Main files: `DriverApp.jsx`, `DriverPriceOffer.jsx`, `ClientApp.jsx`,
`PriceOfferCard.jsx`, shared `PriceOfferForm.jsx`/`priceNegotiation.js`/CSS,
`mvpApi.js`, `assignmentRecovery.js`, and API `order-dispatch.service.js`.

## Executed verification

- API full suite and syntax check passed, including executable realtime-field
  assertions and the previous negotiated-assignment policy tests.
- Web 185/185 tests; production build/map checks passed. New tests compare price
  bounds directly with the API function, reject invalid numbers, render both
  counterpart/owner states and exercise recovery without replay or cross-session
  state leakage.
- Flutter 354/354 tests passed again. Flutter source and the existing profile APK
  are unchanged in this stage; no phone or physical GPS was used.
- Docker config passed; local API/web rebuilt, no volume removal.
- `apps/web/tools/smoke-price-negotiation.mjs` uses actual local development
  auth, orders and API state at 320/390px. It checks invalid price input,
  driver offer → rider counter → driver decline → fresh offer → rider acceptance;
  driver offer → rider counter → driver acceptance; both assignment paths recover
  a deliberately dropped acknowledgement AFTER the real server commit, with one
  POST only and the correct final assigned price.
- Optional explicit local DB fixture adds a second independent driver with a
  normal password login. Its queued offer survives reload, review leaves the
  order unassigned, and acceptance assigns the selected driver. The dedicated
  fixture user is deactivated and its driver blocked/offline afterward; test
  orders are cancelled. No existing account roles or credentials are changed.
- No uncaught browser errors. New forms/panels have no horizontal overflow at
  320/390px. Screenshots inspected under
  `%TEMP%/baisapar-web-negotiation-qa/{320,390}/`:
  `driver-price-form`, `driver-counter`, `rider-counter-form`, `rider-waiting`,
  `rider-queued-offers` (PNG).

## Boundaries and next review

This is a functional parity stage, not proof of every release requirement.
SMS/payment/legal/domain configuration, authoritative address completeness and
physical navigation/background/performance acceptance remain separate gates.
Next inspect driver application approval → usable driver account/region access
end-to-end: QA using a pre-existing seed driver does not prove that onboarding
chain. Also review price consent if the offer changes concurrently with an
accept request; current tests cover owner/direction and policy changes, not that
specific stale-price race. Do not infer these paths are complete from this suite.

Production rollout verification will be recorded after deployment completes.
