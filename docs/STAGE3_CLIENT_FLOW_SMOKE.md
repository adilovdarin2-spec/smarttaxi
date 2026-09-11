# Stage 3 Client Flow Smoke

This document verifies the Stage 3 client flow: auth, address/map selection, tariff estimate, order creation, searching driver, driver found, and trip details.

## Backend

```bash
docker compose config --quiet
docker compose up -d postgres redis
docker compose up -d --build api
curl http://127.0.0.1:4000/api/health/ready
```

Expected: API is ready and Postgres/Redis are reachable.

## Web

```bash
npm --prefix apps/web run dev
```

Open:

```text
http://127.0.0.1:5173/?stage=stage3-client-flow
```

Recommended mobile viewport: `390x844`.

## Automated Client Flow Smoke

```bash
API_URL=http://127.0.0.1:4000 npm --prefix apps/api run smoke:stage3
```

This smoke checks:

- phone check for a new client;
- dev SMS verification;
- password registration;
- backend geocode via `/api/maps/geocode`;
- backend reverse geocode via `/api/maps/reverse-geocode`;
- backend tariff estimate via `/api/tariffs/estimate`;
- authenticated order creation via `/api/orders`;
- driver assignment using the seeded driver account;
- client fallback polling contract via `/api/orders/:id/status-history`.

## Manual Web Flow

1. Open the client app.
2. Open `Профиль`.
3. Register a client by phone:
   - send SMS code;
   - in development use `111111` or the returned dev code;
   - create password.
4. Return to `Главная`.
5. Tap `Откуда` and select a point or click on the map.
6. Tap `Куда едем?` and search for `Атакент базар`.
7. Select an address.
8. Confirm that tariffs, price, payment, and `Заказать` appear only after route data exists.
9. Select `Наличные` or `Kaspi`.
10. Create the order.
11. Confirm the app moves to `Ищем водителя`.
12. Simulate assignment by running the automated smoke, or log in as seeded driver and accept the order.
13. Confirm `Водитель найден` displays driver, vehicle, price, payment, and status.
14. Tap `Детали поездки`.
15. Confirm trip details show route, order ID, driver, vehicle, status, price, and payment.

## Known Remaining Mocks / Limits

- House-level address coverage depends on provider/local catalog quality and is not complete for all Kazakhstan.
- Current map renderer uses OSM tiles and backend route geometry fallback, not a native map SDK.
- SMS delivery is dev-mode only unless a production provider is configured.
- Driver assignment in automated smoke uses seeded driver credentials and is a test path, not public client UI.
