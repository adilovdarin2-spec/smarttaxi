# SmartTaxi local smoke hygiene pass — 2026-09-10

## Problem confirmed

The API lifecycle itself behaved correctly, but two QA scripts left misleading
local state:

- `stage3-client-flow-smoke.js` used the driver's cancellation as cleanup. By
  design, that transition reopens the order in `SEARCHING_DRIVER` for another
  driver; it is not a terminal cancellation.
- The lifecycle smoke scripts left the reusable seed driver `FREE` after a
  successful run rather than returning it to `OFFLINE`.

That accumulated old synthetic Stage 2/3 orders in the local dispatch list and
could make the next browser/device demo show unrelated incoming work.

## Fix

- Stage 3 now asserts the correct driver-cancel reopen transition, then uses the
  authenticated client cancellation endpoint and asserts
  `CANCELLED_BY_CLIENT`.
- Stage 2, Stage 3, Stage 9 and Stage 11 now finish by calling the normal driver
  offline endpoint and assert the public `OFFLINE` result.
- Added `npm --prefix apps/api run cleanup:local-smoke`. It fails closed unless
  both the process and connected API are development and the API is loopback.
  It lists orders through the same OWNER API it mutates, refuses a partial
  result over 200 rows, and selects only the exact Stage 2/3 smoke names and
  notes. It never issues SQL `UPDATE`/`DELETE` and uses the normal owner cancel
  transition so audit and status history are retained.

## Verification and local data cleanup

- API syntax check passed.
- Complete API test chain passed.
- Full development smoke passed after the change, including explicit terminal
  Stage 3 cancellation and `OFFLINE` results for Stage 2, 3, 9 and 11.
- The guarded cleanup converted 18 old, exact-match synthetic open orders to
  `CANCELLED_BY_OPERATOR`; no rows were deleted.
- Postcondition: 0 open Stage 2/3 smoke orders and seed driver
  `+77000000000` is `OFFLINE`.

This cleanup affected only the local Docker development database and its
synthetic smoke records. No production account or endpoint was used.
