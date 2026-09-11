# SmartTaxi Stage 2 Backend Logic Smoke

Stage 2 checks the backend runtime path, not visual polish.

## Local runtime

```powershell
docker compose config --quiet
docker compose up -d postgres redis
$env:DATABASE_URL="postgresql://smarttaxi:smarttaxi@127.0.0.1:5434/smarttaxi"
$env:REDIS_URL="redis://127.0.0.1:6379"
$env:JWT_SECRET="local_dev_secret_please_change_32_chars"
npm --prefix apps/api run seed
npm --prefix apps/api run dev
```

In another terminal:

```powershell
curl http://127.0.0.1:4000/api/health/ready
npm --prefix apps/api run smoke:stage2
```

## What `smoke:stage2` verifies

- health endpoint sees Postgres and Redis;
- active regions are returned;
- map geocode alias works through `/api/maps/geocode`;
- tariff estimate is backend-owned and returns `priceKzt`;
- phone/SMS registration works with one-time verification;
- client creates an order with Cash/Kaspi-compatible payment foundation;
- driver goes online and accepts the order;
- order lifecycle reaches:
  - `SEARCHING_DRIVER`;
  - `DRIVER_FOUND`;
  - `DRIVER_GOING_TO_CLIENT`;
  - `DRIVER_ARRIVED`;
  - `WAITING_CLIENT`;
  - `TRIP_STARTED`;
  - `TRIP_COMPLETED`;
  - `PAID`;
- order status history is readable by the client.

## Known limits

- `smoke:stage2` assumes seed accounts exist.
- The SMS provider is still a development stub outside production.
- Route geometry uses the configured routing provider or the existing fallback route.
- Full Kazakhstan house-level address coverage requires a licensed provider or imported dataset.
