# Stage 11 Driver Core QA

Stage 11 scope is the driver core and the end-to-end client to driver lifecycle. It does not include admin/operator polish, Road Assistant, or a client redesign.

## Backend Contracts

- `GET /api/driver/profile` returns the authenticated driver profile and active order.
- `POST /api/driver/status/online` moves an approved driver to the public online state.
- `POST /api/driver/status/offline` moves a driver offline only when there is no active order.
- `GET /api/driver/orders/incoming` returns open region-scoped orders for an online/free driver.
- `GET /api/driver/orders/active` returns the current active order.
- `POST /api/driver/orders/:id/reject` lets a driver skip an open order without cancelling it for the client.
- `POST /api/driver/orders/:id/accept` assigns the order and moves it to `DRIVER_FOUND`.
- `POST /api/driver/orders/:id/going-to-client` moves to `DRIVER_GOING_TO_CLIENT`.
- `POST /api/driver/orders/:id/arrived` moves to `DRIVER_ARRIVED`.
- `POST /api/driver/orders/:id/waiting` starts `WAITING_CLIENT`.
- `POST /api/driver/orders/:id/start` moves to `TRIP_STARTED`.
- `POST /api/driver/orders/:id/complete` moves to `TRIP_COMPLETED`, frees the driver, and creates finance/debt records for cash/Kaspi.
- `GET /api/driver/earnings/today` returns today's driver totals.
- `GET /api/driver/debt` returns the current driver debt/balance snapshot.

## Manual QA Checklist

1. Login as seeded driver `+77000000000 / 123456`.
2. Confirm the driver home loads without mojibake.
3. Select or verify the working region.
4. Go online.
5. Create a client order from the client app.
6. Confirm the order appears in the driver incoming list.
7. Reject one order and verify it does not break driver availability.
8. Accept a new order.
9. Confirm the active order panel shows pickup, destination, tariff, payment, price, and next action.
10. Progress through:
    - `DRIVER_FOUND`
    - `DRIVER_GOING_TO_CLIENT`
    - `DRIVER_ARRIVED`
    - `WAITING_CLIENT`
    - `TRIP_STARTED`
    - `TRIP_COMPLETED`
11. Confirm cancel is not shown after `TRIP_STARTED`.
12. Mark the order paid from operator/backend and rate from the client.
13. Confirm earnings and debt update for the driver.

## Automated QA

Run with the backend on `http://127.0.0.1:4000`:

```bash
API_URL=http://127.0.0.1:4000 npm --prefix apps/api run smoke:stage11
```

The smoke test verifies:

- driver login;
- offline/online status;
- incoming order visibility;
- reject path;
- accept path;
- active order lookup;
- full order status lifecycle;
- blocking offline while an order is active;
- paid/rated continuation from the client lifecycle;
- driver earnings and debt endpoints.

## Visual QA Evidence

- Browser route: `http://localhost:5174/driver?stage=stage11-driver-core-qa`
- Viewports checked: `390x844`, `360x800`
- Screenshot: `qa_screenshots/stage11_driver_core_360.png`
- Result: driver login, online home, region display, incoming order card, and bottom navigation rendered without console errors or visible mojibake.

## Known Risks

- Driver map routing is still the existing map abstraction, not a full turn-by-turn navigator.
- External navigation and Road Assistant are intentionally outside Stage 11.
- Visual QA still needs browser/mobile viewport inspection after the build.
- Real Android device QA is still separate from this web Stage 11 pass.
