# Server symmetry pass — 2026-07-15 (apps/api, branch `dev`)

Two features making the driver↔client relationship symmetric: drivers can
now rate clients (mirrors the existing client-rates-driver flow), and
drivers can now favorite/block clients (mirrors the existing
client-favorites/blocks-driver flow). Committed in small, per-feature
commits on `dev` — no `git add -A`, no force-push, no `reset --hard`.
Migrations are additive only (`ADD COLUMN IF NOT EXISTS` /
`CREATE TABLE IF NOT EXISTS`), applied automatically on server start via
`runMigrations()` — no manual migration step needed on Railway.

Mobile: sync against this list — paths and field names here are exact, not
paraphrased.

---

## 1. Driver rates client

New `clients.rating NUMERIC(3,2) NOT NULL DEFAULT 5.00` — same shape as
the existing `drivers.rating`, recomputed as the average of that client's
`client_reviews` rows every time a new one is inserted. The `client_reviews`
table itself already existed in the schema (unused until now); no new
table needed.

- `POST /api/orders/:id/rate-client` — role `DRIVER`. Must be the order's
  assigned driver (`403 FORBIDDEN_ORDER` otherwise).
  Body: `{ rating: 1-5 (int), tags?: string[] (max 8, each 1-60 chars),
  comment?: string (max 500) }` — identical shape to the existing
  `POST /api/orders/:id/rate` (client rates driver).
  - Order must have a `client_id` (`409 ORDER_CLIENT_MISSING` if somehow
    missing).
  - Order must be `PAID`, `RATED`, or `COMPLETED` (`409 ORDER_NOT_COMPLETED`
    otherwise, with `{ currentStatus, requiredStatus: "PAID" }`). `RATED` is
    included deliberately: the client-rates-driver endpoint already flips
    the order to `RATED` when the client rates first, and a driver rating
    the client afterwards must not get locked out by that.
  - One rating per order (`409 ORDER_ALREADY_RATED` if `client_reviews`
    already has a row for this `order_id`).
  - Does **not** change `orders.status` itself (unlike the client-rates-
    driver endpoint, which moves the order to `RATED` — that transition
    stays owned by the client side to avoid the two ratings fighting over
    the same status field).
  - No anti-fraud auto-block — that's a driver-specific business rule tied
    to service-commission risk (see `drivers.routes.js`
    `DRIVER_AUTO_BLOCK_*`), not applied symmetrically to riders.
  - Response: `201 { order: {...same order envelope as every other orders
    endpoint...} }`.

`clients.rating` is included in `SELECT * FROM clients` responses (e.g. the
existing admin `GET /api/clients` list) automatically. It is **not** yet
exposed to the client themself anywhere (`GET /api/auth/me` only returns
the `users` row, not the `clients` profile) — flagging this as a gap if the
client-side app wants to show "your rating" on its own profile screen; a
follow-up endpoint would be needed for that, not included in this pass.

---

## 2. Driver favorites / blocks a client

New table `driver_client_preferences`: `id`, `driver_id`, `client_id`,
`type` (`FAVORITE` | `BLOCKED`), `created_at`,
`UNIQUE(driver_id, client_id)` — a client is one or the other per driver,
not both at once; re-`POST`ing with a different `type` flips it (upsert).
Exact mirror of the existing `client_driver_preferences` table, opposite
direction.

- `GET /api/favorites/clients` — role `DRIVER`. Response:
  `{ preferences: [{ id, clientId, clientName, clientPhone, type,
  createdAt }] }`.
- `POST /api/favorites/clients` — role `DRIVER`. Body:
  `{ clientId: uuid, type: "FAVORITE" | "BLOCKED" }`. `404 CLIENT_NOT_FOUND`
  if the client id doesn't exist. Response: `201 { preference: {...} }`
  (`clientName`/`clientPhone` are `null` in the create response — fetch
  `GET /api/favorites/clients` for the joined display fields).
- `DELETE /api/favorites/clients/:clientId` — role `DRIVER`. `404
  CLIENT_PREFERENCE_NOT_FOUND` if there was no preference row. `204` on
  success.

These three routes live in the same `favorites.routes.js` router as the
existing `/addresses` and `/drivers` (client-side) routes, mounted at
`/api/favorites` — no new mount point.

**Dispatch enforcement** (`order-dispatch.service.js`):
`listOrdersForDriver` now excludes any order whose `client_id` this driver
has `BLOCKED` from the open dispatch pool that driver sees — a blocked
client's orders never get broadcast to that driver, same visibility layer
as the existing client→driver block. Also re-checked (defense in depth, new
`assertClientNotBlockedByDriver` helper) inside `acceptOrderForDriver` and
`submitDriverPriceOffer`, in case the driver has a stale order id from
before blocking that client — both now throw `403
CLIENT_BLOCKED_BY_DRIVER`.

---

## Verification

No live database access this session (see repo memory: local Postgres/Redis
unavailable, Railway is the only real target) — everything below is
syntax-clean and logic-reviewed, not integration-tested against a real
database.

- `npm run syntax` (full `syntax-check.js`) — passes.
- `npm test` — all 18 checks pass, including the new
  `src/tools/server-symmetry-check.js` (structural assertions on the
  migration/route/dispatch wiring above) and an added case in
  `src/tools/price-offer-check.js` covering `CLIENT_BLOCKED_BY_DRIVER` on
  `submitDriverPriceOffer`.
- Migrations were **not** applied against the live Railway Postgres this
  session — they run automatically on next server start
  (`runMigrations()`), same as every other migration in this codebase.

## Commits (this pass)

1. `feat(orders): driver rates client, mirroring client-rates-driver`
2. `feat(favorites): driver favorites/blocks a client, mirroring client-side`
3. `docs: this section`
