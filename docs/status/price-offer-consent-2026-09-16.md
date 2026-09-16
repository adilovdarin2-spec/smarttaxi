# Displayed-price consent — 2026-09-16

## Reproduced defect

Real local development HTTP: a rider shown 800 KZT accepted after the driver
replaced the proposal with 900 KZT. The server assigned 900 without new consent.
The analogous driver counter went from 700 to 750. Stale decline/counter actions
also changed the newer proposal. `price-offer-consent-http-check.js --observe`
recorded these old-runtime responses before changes; strict mode is the regression.

## Contract and implementation

The following POST requests require `expectedOffer` alongside their existing body:

- `/api/orders/:id/price-offer/respond` (`accept`)
- `/api/orders/:id/price-offer/counter` (`priceKzt`)
- `/api/orders/:id/price-offer/driver-respond` (`accept`)
- `/api/orders/:id/price-offers/queue/:queueId/promote`

Example: `{"driverId":"<UUID>","priceKzt":800,"proposedBy":"DRIVER"}`.
The snapshot is taken from the rendered offer, not a fresh read after clicking.
Queue proposals use `DRIVER`; passenger counters use `CLIENT`.

After ownership/direction checks, the service compares driver, whole-KZT price
and author with the locked order/queue row before mutation. Changed terms return
409 `PRICE_OFFER_CHANGED`; absent consent returns 409
`PRICE_OFFER_CONFIRMATION_REQUIRED`. Malformed snapshots fail request validation.
No migration or new synthetic price data is used. Same driver/price/author terms
can remain valid; this is terms consent, not an immutable revision/ABA token.

Web and Flutter send these terms for all four routes. Both show localized error
copy, refresh state on failure and never automatically replay a decision. Native
passenger callbacks capture the rendered order rather than reading `_order` at
tap time. Queue selection remains review only, not assignment. Maps, tariff
styling, payment providers, account roles and production configuration are unchanged.

Compatibility: old web tabs must reload, and old Android packages must update
before negotiating. Missing consent is deliberately rejected, not silently
interpreted as permission for the latest price. Ordinary direct order acceptance
is unchanged; its base-price edit races are outside this stage.

## Verification

- Complete API suite and syntax checks passed. Unit matrix covers 20 refusals
  across rider accept/decline/counter and driver accept/decline with old price,
  different driver, different author or missing consent, with no state mutation.
- Strict real local HTTP: five stale actions + missing consent all return the
  appropriate 409; exact latest terms then assign at 900/750 as appropriate.
- PostgreSQL stand fixture: both stale negotiated acceptance paths preserve
  stand/booking state; queued stale/missing terms leave primary and queue intact;
  exact queue terms promote without assignment. All DB fixtures rolled back.
- Real authenticated HTTP stand flow still preserves confirmed seats on policy
  refusal, releases them on valid negotiation assignment, and emits the rider's
  committed cancellation socket event.
- Web 186/186 tests; production build/map checks; Compose config and isolated
  API/web Docker rebuild passed. Real two-session browser QA at 320/390px changes
  the actual API proposal AFTER clicking and BEFORE forwarding the captured POST.
  It receives 409, shows the new 900/750 price, keeps the trip unassigned, and
  assigns only after another explicit click. No uncaught browser errors or panel
  horizontal overflow. Existing counter/decline/queued-offer/lost-ack flows pass.
- Screens inspected: `%TEMP%/baisapar-web-negotiation-qa/{320,390}/`
  `rider-price-changed.png`, `driver-price-changed.png`. Map loading in the early
  rider capture is not evidence of map readiness; the price panel was the target.
- Flutter 359/359 tests, including four transport snapshot/conflict/no-replay
  cases and shared error-copy/queued snapshot checks. No physical phone used.
- Earlier CI runs 35097046700 and 35097041359 for `6327120` were re-read:
  both completed SUCCESS (their previous report had the Android build pending).

## Remaining acceptance

This closes the reproduced negotiated-price consent defect, not all release
criteria. Next: driver application approval through usable driver profile/region
access end-to-end. SMS/payment/legal/domain/store configuration, authoritative
address completeness and physical moving navigation/background/performance remain
separate gates. Do not call the whole product bug-free or ready from this suite.
