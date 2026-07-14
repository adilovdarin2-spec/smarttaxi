# Server overnight — 2026-07-15 (apps/api, branch `dev`)

Autonomous backend session covering price negotiation, recurring bookings,
promo code deletion, lost-item routing, favorites, referrals, and quick
messages. Everything below is committed in small, per-feature commits on
`dev` — no force-push, no `reset --hard`, no `git add -A`.

Mobile and web-chat: sync your API clients against this list — paths and
field names here are exact, not paraphrased.

---

## 1. Driver price counter-offer ("торг")

New `orders` columns: `driver_offer_price_kzt`, `driver_offer_status`
(`PENDING` | `ACCEPTED` | `DECLINED`), `driver_offer_by_driver_id`,
`driver_offer_created_at`, `driver_offer_responded_at`. Surfaced in every
order response (they're part of `orders.*`) and in the real-time socket
payload (`publicOrderEvent`) as `driver_offer_price_kzt`,
`driver_offer_status`, `driver_offer_by_driver_id`.

- `POST /api/orders/:id/price-offer` — role `DRIVER`. Body: `{ priceKzt }`.
  Order must still be `SEARCHING_DRIVER`/`NEW` (open) and unassigned; stays
  open to every other driver. Bounds-checked the same way as the rider's
  `offeredPriceKzt` (200–1,000,000 ₸). Notifies the client
  (`DRIVER_PRICE_OFFER`). Rate limited 20/min/IP.
- `POST /api/orders/:id/price-offer/respond` — role `CLIENT`, must own the
  order. Body: `{ accept: boolean }`.
  - `accept: true` — assigns that driver, sets `price` to the offered
    amount, order → `DRIVER_FOUND`, `driver_offer_status` → `ACCEPTED`.
    Notifies the driver (`DRIVER_PRICE_OFFER_ACCEPTED`).
  - `accept: false` — `driver_offer_status` → `DECLINED`, order stays open,
    driver can re-offer at a different price. Notifies the driver
    (`DRIVER_PRICE_OFFER_DECLINED`).
  - Rate limited 30/min/IP.
- Both routes also exist under `/api/driver/orders/...` (same router,
  double-mounted like the rest of `orders.routes.js`).

---

## 2. Recurring bookings ("школьный маршрут")

New table `recurring_bookings`: `id`, `client_id`, `driver_id`,
`pickup_text/lat/lng`, `dropoff_text/lat/lng`, `days_of_week INTEGER[]`
(ISO day numbers, 1=Mon..5=Fri), `time_of_day TIME`, `price_kzt`,
`status` (`PENDING_DRIVER` | `ACTIVE` | `PAUSED` | `CANCELLED`), `notes`,
`last_triggered_date` (internal dedup guard, not in the original field
list but required to actually satisfy "no duplicate same day"). New
`orders.recurring_booking_id` links an auto-created order back to its
booking.

- `POST /api/recurring-bookings` — role `CLIENT`. Body: `{ driverId,
  pickupText, pickupLat, pickupLng, dropoffText, dropoffLat, dropoffLng,
  daysOfWeek: number[1-5], timeOfDay: "HH:MM", priceKzt, notes? }`. Rejects
  a driver the client has `BLOCKED` (see §6). → `PENDING_DRIVER`, notifies
  the driver.
- `POST /api/recurring-bookings/:id/respond` — role `DRIVER`. Body:
  `{ accept: boolean }` → `ACTIVE` or `CANCELLED`. Notifies the client.
- `GET /api/recurring-bookings/mine` — role `CLIENT`, own bookings.
- `GET /api/recurring-bookings/driver` — role `DRIVER`, own bookings.
- `PATCH /api/recurring-bookings/:id/status` — role `CLIENT` or `DRIVER`
  (whichever side owns it). Body: `{ status: "ACTIVE"|"PAUSED"|"CANCELLED" }`.
  Can't move a still-`PENDING_DRIVER` booking to anything but `CANCELLED`.

**Scheduler**: `recurring-bookings.scheduler.js`, `setInterval` every 60s.
For each `ACTIVE` booking where today matches `days_of_week` and the
current time is within 15 minutes before `time_of_day` (and it hasn't
already fired today), it directly creates a normal `orders` row —
`status='DRIVER_FOUND'`, `driver_id` pre-set, `payment_method='CASH'`,
`price` = the booking's fixed `price_kzt` — skipping the open dispatch
pool entirely. Skips (and retries next minute) if the driver isn't
online/free/in-region; distance/duration come from OSRM best-effort and
default to 0 if routing is unavailable (price isn't distance-based here,
so that's non-critical).

**Known limitation**: the "is it time yet" check compares against the
database server's own `NOW()` (Postgres — UTC on Railway), not a
configured service time zone. `timeOfDay` should be submitted already
adjusted to that reference. Flagging this now rather than guessing at an
offset — worth a real fix once the app has a service-wide time zone
setting.

---

## 3. Promo codes — deletion

- `DELETE /api/admin/promo-codes/:id` — role `OWNER` or `FINANCE`.
  Blocks with `409 PROMO_CODE_HAS_REDEMPTIONS` if the code has any
  `promo_code_redemptions` — deactivate via the existing
  `PATCH /api/admin/promo-codes/:id/status` instead so past orders keep an
  explanation for their price. A never-used code deletes cleanly (`204`).
  Audited as `promo_code_deleted`.

---

## 4. Lost items → driver notified

No new endpoint — `POST /api/support` (existing) now also pushes to the
order's driver when `orderId` is set and `topic === "LOST_ITEM"`
(`notifyOrderDriver`, type `LOST_ITEM`), in addition to landing in the
admin support queue as before.

---

## 5. Favorite addresses

New table `client_favorite_addresses`: `id`, `client_id`, `label`
(`HOME` | `WORK` | `OTHER`), `title`, `address_text`, `lat`, `lng`,
`created_at`.

- `GET /api/favorites/addresses` — role `CLIENT`.
- `POST /api/favorites/addresses` — body `{ label?, title, addressText, lat, lng }`.
- `DELETE /api/favorites/addresses/:id`.

---

## 6. Favorite / blocked drivers

New table `client_driver_preferences`: `id`, `client_id`, `driver_id`,
`type` (`FAVORITE` | `BLOCKED`), `created_at`, `UNIQUE(client_id, driver_id)`
— a driver is one or the other per client, not both at once; re-`POST`ing
with a different `type` flips it (upsert).

- `GET /api/favorites/drivers` — role `CLIENT`.
- `POST /api/favorites/drivers` — body `{ driverId, type }`.
- `DELETE /api/favorites/drivers/:driverId`.

**Dispatch enforcement**: `order-dispatch.service.js#listOrdersForDriver`
excludes any order whose client has this driver `BLOCKED` from the open
pool a driver sees — a blocked driver never even sees the order exists.
Also re-checked (defense in depth) inside `acceptOrderForDriver` and the
new `submitDriverPriceOffer`, in case a driver has a stale order ID from
before being blocked.

---

## 7. Referral program

New `clients.referral_code` (auto-generated 6-char code, unambiguous
alphabet, backfilled lazily on first `GET /referrals/mine` for
pre-existing clients) and `clients.referred_by_client_id`. New
`service_settings.referral_bonus_kzt` (default 500 ₸, editable via the
existing `PATCH /api/admin/settings` as `referralBonusKzt`).

- `POST /api/auth/register` and `POST /api/auth/register/password` (the
  one the mobile app actually uses) both accept an optional
  `referralCode` field now. Invalid/unknown codes are silently ignored,
  not rejected — registration never fails because of a bad referral code.
- On a referred client's **first** `TRIP_COMPLETED` order (checked by
  counting their completed orders, not a separate flag — naturally
  idempotent), `referral_bonus_kzt` is credited to **both** the referred
  client and the referrer via the existing `cashback_transactions` ledger,
  `type='REFERRAL_BONUS'`.
- `GET /api/referrals/mine` — role `CLIENT` → `{ code, invitedCount,
  totalBonusEarned }`.

---

## 8. Quick messages in trip

- `POST /api/orders/:id/quick-message` — role `CLIENT` or `DRIVER`, must
  be a participant on that order. Body: `{ messageKey }`, one of:
  `I_ARRIVED`, `WAITING_AT_ENTRANCE`, `RUNNING_LATE_2MIN`,
  `PLEASE_COME_OUT`, `ON_MY_WAY`. The server maps the key to Russian text
  (fixed vocabulary, no free text) and delivers it to the other party via
  the existing push path. Rate limited 10/min/IP. Response:
  `{ delivered: true, messageKey, text }`.

---

## 9. Verified, not changed

- `GET /api/orders/track/:token` — confirmed it only returns status,
  tariff, pickup/dropoff text, driver name/car/plate, and driver location
  while the trip is active. No phone numbers, no price, no rider identity.
- `GET /api/regions/service-settings` — confirmed `sosPhone` (and
  `supportPhone`, `currency`, `currencySymbol`, `city`) come through
  correctly from `service_settings`. Note the actual path is
  `/api/regions/service-settings`, not `/api/regions` itself.

---

## Commits (chronological)

1. `feat(orders): driver price counter-offer ("торг")`
2. `feat(favorites): favorite addresses + favorite/blocked drivers`
3. `feat(admin): allow deleting never-redeemed promo codes`
4. `feat(support): notify the driver on lost-item reports`
5. `feat(orders): quick status messages between rider and driver`
6. `feat(referrals): referral program with first-order bonus`
7. `feat(recurring-bookings): "school route" recurring trips`

All verified with `node --check` per file and `npm run syntax` (full
`syntax-check.js` pass) after the last commit — no syntax errors.

Not done tonight, both deliberately: `npm test`'s smoke-check suite
wasn't run, and the new migration statements were never applied to any
database, including the live Railway Postgres this session already had
access to from earlier work — running either against a database this
session didn't have fresh, scoped authorization to modify wasn't
something to do unilaterally overnight. Treat everything above as
syntax-clean and logic-reviewed, not integration-tested. Before this
ships: run migrations once against a real (ideally staging) Postgres and
run `npm test`.
