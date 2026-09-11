# Commission overrides — 2026-07-15 (apps/api, branch `dev`)

Found while auditing the schema for tables defined but never read anywhere
(same category of finding as `client_reviews` before today's server-
symmetry pass): `commission_overrides` (`driver_id` PK, `percent`,
`active`, `updated_at`) existed in the schema from the start with **zero**
references anywhere in `modules/`. Confirmed with the user before building
anything on top of it, since it affects driver payout math on the only
production system (Railway): implement it, and apply only to **new**
orders completing from now on — never retroactively recomputed for
already-`TRIP_COMPLETED` orders. No new migration — the table already
existed additively.

Admin/web: sync against this list for the commission-override UI.

---

## Admin CRUD

- `GET /api/admin/commission-overrides` — role `OWNER`/`OPERATOR`/`FINANCE`.
  Response: `{ commissionOverrides: [{ driverId, driverName, driverPhone,
  driverPlate, percent, active, updatedAt }] }`.
- `PUT /api/admin/commission-overrides/:driverId` — role `OWNER`/`FINANCE`
  only (same role split as tariffs/promo-codes: everyone can view, only
  those two can change money-affecting settings). Body:
  `{ percent: 0-100, active?: boolean (default true) }`. Upserts — one row
  per driver, re-`PUT`ting replaces the existing value. `404
  DRIVER_NOT_FOUND` if the driver id doesn't exist. Response:
  `201 { commissionOverride: {...} }` (`driverName`/`driverPhone`/
  `driverPlate` are `null` in the create response, same convention as
  `favorites.routes.js`'s create responses — fetch the list endpoint for
  the joined display fields).
- `DELETE /api/admin/commission-overrides/:driverId` — role
  `OWNER`/`FINANCE`. Removes the override entirely (driver reverts to
  whatever their tariff's flat `service_commission_percent` is). `404
  COMMISSION_OVERRIDE_NOT_FOUND` if there was no override row. `204` on
  success.
- `GET /api/admin/drivers/:id` (existing endpoint) now also returns
  `commissionOverride: { percent, active, updatedAt } | null` alongside
  the existing `driver`/`activeOrder`/`regions` fields, so the driver
  detail screen can show the current override without a second request.

`active: false` keeps the override row (and its `percent`) around without
applying it — same "flip it off without losing the number" pattern as
`tariffs.is_active` — versus `DELETE`, which removes it outright.

---

## Where it takes effect

`orders.routes.js`'s `updateStatus` handler, `TRIP_COMPLETED` branch only
(`apps/api/src/modules/orders/orders.routes.js`, right after the existing
paid-waiting-time fold-in, before cashback/driver-payout/ledger). If the
order's `driver_id` has an `active=true` row in `commission_overrides`,
`orders.service_commission` (and `pricing_snapshot.serviceCommission`/
`driverEarning`) are recomputed from the **whole** final trip price
(base fare + paid waiting) at the override's `percent`, replacing whatever
was computed from the tariff's flat `service_commission_percent` at order
creation. Runs strictly before:

- the driver debt/balance update (so a `CASH`/`KASPI` trip debits the
  driver, and a prepaid trip credits their balance, using the overridden
  amount), and
- `createOrderCompletedTransaction` (`finance.service.js`), so the
  `financial_transactions` ledger entry reports the overridden commission
  too — `finance.service.js#orderAmounts()` prefers
  `pricing_snapshot.serviceCommission` over the raw column, so both had to
  be updated together or the ledger would silently disagree with what the
  driver was actually charged.

**Not applied**: at order creation (no driver is assigned yet — dispatch
here is open/region-wide, not pre-matched, so there's nothing to look up
until a driver accepts) or anywhere else pricing is estimated
(`order-pricing.service.js`'s `calculatePricingComponents` is a pure
function with no driver context and was deliberately left untouched).
**No behavior change for any driver without an override** — the
no-override path recomputes the exact same tariff-rate formula that was
already there, just consolidated into one step instead of the previous
base-then-waiting two-step addition (mathematically identical, since
commission is a flat percentage applied to a sum either way).

---

## Verification

No live database access this session (repo memory: local Postgres/Redis
unavailable) — everything above is syntax-clean and logic-reviewed, not
integration-tested against a real database, same caveat as the rest of
this branch's work today.

- `npm run syntax` — passes.
- `npm test` — all 19 checks pass, including the new
  `src/tools/commission-overrides-check.js` (structural assertions: CRUD
  routes exist with the right roles, the override lookup exists inside
  `TRIP_COMPLETED`, and — the part that actually matters — the override
  lookup runs textually *before* both the driver payout update and the
  ledger-entry call, so a wrong ordering here would fail the test rather
  than silently ship).
- Did not attempt a full mock-executor functional test of `updateStatus`
  itself (unlike `order-lifecycle-check.js`'s fee tests, which call
  `finance.service.js`'s exported functions directly) — `updateStatus` is
  an internal, non-exported handler wired straight to Express `req`/`res`,
  and building a full mock request/transaction harness for it wasn't
  justified for this pass; flagging as a gap if a future session wants
  real functional coverage here.

## Commits (this pass)

1. `feat(admin): commission overrides CRUD + apply at trip completion`
2. `docs: this section`
