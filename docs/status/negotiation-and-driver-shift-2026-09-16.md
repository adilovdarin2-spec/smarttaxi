# Negotiated assignment and driver shift consistency — 2026-09-16

## Reproduced failures

Local PostgreSQL fixtures showed direct order acceptance correctly removed a stand place, but both negotiated acceptance paths left the assigned driver `BUSY` with a `BOARDING` entry, a `WAITING` follower and `PENDING`/`CONFIRMED` seat reservations.

Using a real local HTTP request blocked on a driver row while another transaction accepted an order reproduced:

- `/api/driver/status/offline`: HTTP 200, assigned driver overwritten to `OFFLINE`.
- `/api/driver/status/online`: HTTP 200, assigned driver overwritten to `FREE`.
- Legacy `/api/drivers/me/status` (`FREE`, `OFFLINE`, `BREAK`): HTTP 200, assigned driver overwritten to each requested status.
- Automatic stale-BUSY recovery overwrote both a newly-offline driver and a newly-assigned driver to `FREE`.

## Fixed

- Both negotiated acceptance services release the stand place, cancel pending/confirmed reservations and promote the next eligible queue entry using the existing assignment transaction. Declining a price leaves the queue untouched.
- Both HTTP handlers announce the stand release after commit. The recipient of driver-offer feedback comes from the service's locked result, not an earlier unlocked peek.
- Core online/offline and legacy status endpoints lock the driver before checking active orders. Status/audit changes and stand release commit together. Legacy `BREAK` and `OFFLINE` now also release the stand; `FREE` keeps a valid stand place.
- BUSY recovery wraps pool-query callers in a transaction, re-reads the locked driver and only repairs a still-BUSY driver with no active order. It does not fabricate a FREE result for a missing update row.
- Existing legacy order source statuses and endpoint response contracts remain supported; no schema/migration changes.

## Evidence

- `stands-negotiation-db-check.js`: direct acceptance and both negotiated acceptances now produce `DRIVER_FOUND` + `BUSY`, removed queue entry (`ACCEPTED_ORDER`), promoted follower and two cancelled reservations. Savepoint rollback restores all state together; both decline directions preserve stand state. All fixtures roll back.
- `stands-negotiation-http-check.js`: real local login/dev SMS registration, stand join, confirmed reservation, order creation and both price-acceptance HTTP routes. Separate ride and stand passengers. Both routes clear live stand/reservation reads and deliver `stand_reservation_cancelled` over the stand passenger's authenticated WebSocket. Only this run's rides are cancelled during cleanup; no production account is used.
- `driver-shift-race-db-check.js`: seven deterministic contention cases using `pg_blocking_pids`. Core offline and all three legacy changes reject with 409 after assignment; online stays BUSY; recovery preserves fresh OFFLINE/BUSY. Three separate reservation-row barriers prove atomic core-offline/legacy-offline/break visibility. FREE does not remove a valid queue place. Exact local fixture rows are removed and the seed driver's initial status restored.
- API test suite and syntax: pass. Added no-DB recovery tests for fresh FREE/OFFLINE/BREAK/BUSY, with/without active orders and missing drivers; tightened shift transaction assertions. Existing routing fallback DB warning remains non-fatal.
- Local Docker rebuild and Compose config: pass; volumes preserved.
- Existing stand concurrency DB regression also passes after these changes (simultaneous joins, departure/leave/join, owner closure, sweep, boarding slot resize and atomic closure barrier).
- Existing browser stand recovery at 320px: pass, including genuine seat commits, lost acknowledgement, guarded refresh, GPS gate, protected APP seats and owner closure, no browser exceptions.
- Web and Flutter source/UI unchanged in this stage; their previous verified 179/353 suites and existing profile APK are not presented as newly rebuilt here.

## Changed files

`driver-core.routes.js`, `drivers.routes.js`, `order-dispatch.service.js`, `orders.routes.js`, `dispatch-realtime-check.js`, `price-offer-check.js`, plus the three new local integration tools above.

## Remaining

Continue broader release verification. Compare eligibility checks on direct and negotiated assignment (region changes, blocked counterpart, debt and previous cancellation) rather than assuming stand parity proves complete dispatch parity. External SMS/payment/legal/store/official-address and physical field QA gates remain open. This stage is not a zero-bug or release-complete claim.

## Publication

Code `af707fc` pushed to `origin/dev`. Railway API deployment `db288347-81fa-4bf3-b356-da66dcf4f749` reports `SUCCESS`. Read-only SHA-256 verification of all four changed runtime files on Railway matches the local committed files exactly.

Public readiness still returns 503 with SMS not configured; DB, Redis and OSRM checks pass. No production login, order, stand or payment mutations were used for verification. Web deployment and Android profile APK remain the previously verified versions because this stage only changes the shared backend.
