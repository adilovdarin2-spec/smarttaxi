# Money path audit — 2026-09-04

Read the order-completion and cancellation money paths looking for the classes
of defect this session has been finding elsewhere: double-charging, races,
contract violations, drift between two copies. **Found none.** Recording that
as a result, with the reasoning, so the next reader does not have to redo it —
and one business exposure that is not a bug.

## Completion is safe against double-charging

`POST /orders/:id/complete` credits client cashback, adds the driver's
commission to `drivers.debt`, and writes a `driver_debts` row. Charging twice
would take real money off a driver.

It cannot, on three independent grounds:

1. `SELECT * FROM orders WHERE id=$1 FOR UPDATE` — the row is locked, so two
   concurrent completions serialise.
2. `assertStatusTransition` — `TRIP_COMPLETED: ["TRIP_STARTED", "IN_PROGRESS"]`,
   so a second completion of an already-completed order is a 409.
3. Everything runs inside `tx()`, so a later failure rolls the whole thing back.

The driver row is also locked (`SELECT * FROM drivers … FOR UPDATE`) before any
of it.

### The second completion status is not a hole

`TRANSITION_RULES` carries `COMPLETED` alongside `TRIP_COMPLETED`, and only
`TRIP_COMPLETED` runs the billing block — so `COMPLETED` would look like a way
to finish a ride without the driver being charged commission.

It is not reachable. `updateStatus()` takes the status as a function argument,
not from the request body, and the eleven routes that call it pass fixed
literals; none passes `COMPLETED`. Nor does any other code write it. The same
is true of `IN_PROGRESS` and `DRIVER_ASSIGNED`.

They are compatibility entries for rows that predate the current vocabulary —
`finance.routes.js` refers to the `orders_status_check` constraint "for old
rows". **Do not tidy them away**: they appear in allowed-from lists
(`TRIP_COMPLETED` accepts `IN_PROGRESS`), so removing them would strand any
legacy order that is still in one of those states.

## Cancellation and no-show fees are correct, and mostly uncollectable

The fee logic itself is careful: the client row is locked, the charge is capped
at the balance actually present (`Math.min(nominalFee, balance)`, floored at 0),
the driver is credited only what was really collected rather than the nominal
fee, and a ledger row is written either way. A repeat cancellation is refused by
the state machine, so it is idempotent too.

**But the fee is charged solely against `clients.cashback_balance`.** There is
no other collection path — no card charge, nothing. The code says so plainly:
*"capped at whatever's actually there, since there's no client debt/credit
concept in this codebase to fall back on."*

The consequence is a business one, not a defect:

- A rider with a zero cashback balance — every new rider — pays **nothing** for
  cancelling after a driver has accepted, or for a no-show.
- The driver who drove to them is credited **nothing**, because nothing was
  collected.
- `cancellation_fee` and `no_show_fee` can be configured per tariff in the
  admin console, which suggests they are expected to bite. For most riders they
  will not.

Whether that is acceptable is the owner's call — it may well be deliberate for
launch, and charging a card for a cancellation needs the merchant account that
is still pending anyway. Worth knowing before drivers start asking why a
no-show paid them nothing.

## Not audited here

Card payments and the Kaspi path: the handoff postpones both until the legal
entity and merchant credentials exist, and the mock gateway's behaviour is not
what will ship.
