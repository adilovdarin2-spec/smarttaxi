# Server overnight — 2026-07-15 (apps/api, branch `dev`)

Autonomous backend session covering price negotiation, recurring bookings,
promo code deletion, lost-item routing, favorites, referrals, and quick
messages. Everything below is committed in small, per-feature commits on
`dev` — no force-push, no `reset --hard`, no `git add -A`.

Mobile and web-chat: sync your API clients against this list — paths and
field names here are exact, not paraphrased.

**Mid-session addition**: the admin web panel (`apps/web`) got wired up
against tonight's endpoints in parallel, on the same branch, and expected
two admin-overview endpoints that weren't in the original spec:
`GET /api/admin/recurring-bookings` and `GET /api/admin/referrals` (plus
`GET /api/referrals/me` as an alias for `/referrals/mine`, since the web
client was already written calling `/me`). Added both — see §2 and §7.

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

**Admin overview** (added mid-session, see note at top):
`GET /api/admin/recurring-bookings?status=` (optional status filter) —
role `OWNER`/`OPERATOR`/`FINANCE`, every booking with both client and
driver name/phone joined in: `{ recurringBookings: [{ id, clientId,
clientName, clientPhone, driverId, driverName, driverPhone, pickupText,
dropoffText, daysOfWeek, timeOfDay, priceKzt, status, notes,
lastTriggeredDate, createdAt }] }`.

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
- `GET /api/referrals/mine` (and `GET /api/referrals/me`, same handler —
  added mid-session, see note at top) — role `CLIENT` → `{ code,
  invitedCount, totalBonusEarned }`.
- `GET /api/admin/referrals` (added mid-session) — role
  `OWNER`/`OPERATOR`/`FINANCE`, one row per referred client:
  `{ referrals: [{ id, inviterName, inviterPhone, inviteeName,
  inviteePhone, rewardCreditedAt, rewardKzt }] }`. `rewardCreditedAt`/
  `rewardKzt` are `null` until that client's first completed order fires
  the bonus.

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

---

## 8. CRITICAL: unverified drivers could go online — fixed

> **Update 2026-07-15 late night:** the document-approval gate this section describes
> was **deliberately removed** a few hours after landing, by explicit user request (see
> `docs/status/mobile-driver-overnight-2026-07-15.md` round 4, and project memory
> `project_driver_documents_not_required`) — registration friction was judged worse than
> the verification gap this section closes. `assertDriverDocumentsApproved` and both its
> call sites are gone from `driver-region-approvals.service.js`; going online now only
> depends on region approval + `is_blocked`, as before this section's fix. The rest of
> this section is kept for historical context (why the check existed, what it looked
> like) — don't use it as current behavior.

Confirmed: `ONLINE`/dispatch eligibility only ever checked
`drivers.is_blocked`. There was no link at all between a driver being
allowed to work and either `driver_applications.status` or their uploaded
`driver_documents` review status.

**Why the fix isn't "link `driver_applications` to `drivers`, unblock on
approval" as literally proposed**: `driver_applications` (the pre-account
intake form, name/phone/car info + documents keyed by
`driver_application_id`) has no foreign key to a `drivers` row anywhere in
the schema, and nothing in this codebase creates a `drivers` row at all —
not `auth.routes.js` (`/register*` only ever creates `role='CLIENT'`
users), not any admin endpoint. Every `drivers` row today is provisioned
out-of-band (seed script or direct DB access). Building a "convert an
approved application into a driver account" flow is a real gap but a
separate, bigger feature than tonight's fix — **flagging it explicitly as
recommended future work**, not silently skipping it.

**What's actually enforceable today, and what got wired in instead**: every
driver, however their account was created, already has `driver_documents`
rows keyed by `driver_id` once they upload anything (existing feature).
So the gate is a **live check, not a stored flag**:

- `getMissingRequiredDocumentTypes(driverId)` (new,
  `driver-documents.service.js`) — for each of
  `DRIVER_LICENSE_FRONT/BACK`, `ID_CARD_FRONT/BACK`, `VEHICLE_REGISTRATION`,
  looks at that type's *most recent* submission and requires it to be
  `APPROVED`. No separate "verified" flag to keep in sync — a later
  REJECTED renewal of an already-approved document type drops the driver
  back out automatically, on the very next check, for free.
- Wired into `assertDriverRegionApproved` and `assertDriverDispatchReady`
  (`driver-region-approvals.service.js`), which already gate every online/
  dispatch path (`PATCH /drivers/me/status`, `POST /driver/status/online`,
  `GET /driver/orders/incoming`, order accept/reject/price-offer, the
  `join_drivers` socket event). One choke point, not scattered checks.
- New error: `403 DRIVER_DOCUMENTS_NOT_APPROVED` with `{ missing: [...] }`.

**Operational heads-up before this deploys**: this also gates *progressing
an already-active trip* (arrived/waiting/start/complete/cancel all go
through the same `assertDriverDispatchReady` call), same as the
pre-existing region-approval check already did. Any driver currently
online or mid-trip in production whose required documents aren't all
`APPROVED` will be unable to continue the moment this ships. Before
deploying: bulk-approve documents for any pilot/seed/test drivers via
`PATCH /admin/driver-documents/:id` (or directly in Postgres) so nobody
gets stranded mid-trip.

No migration needed for this — it's a live query against the existing
`driver_documents` table, not a new column.

## 9. Order lifecycle: search timeout, driver-cancel reopen, fees, paid waiting

Four separate gaps, all in `apps/api/src/modules/orders/` and
`finance.service.js`:

- **No driver responds** (`order-dispatch.service.js`): the dispatch model
  here is region-wide, not radius-based (the only distance query in the app
  is the anonymous-icon `/drivers/nearby` endpoint) — so "widen the search
  radius" doesn't map onto anything real to retry. Instead: `orders.*`
  responses and the `order_status_public`/dispatch socket events now
  include `search_timed_out: boolean` — `true` once an unassigned
  `SEARCHING_DRIVER`/`NEW` order has been open for 75s with nobody
  responding. Purely a derived read (`isOrderSearchTimedOut`, no new
  column, no scheduler). Cancelling from this state is already free — see
  the fee logic below, no driver ever accepted so no `cancellation_fee`
  applies. Mobile/web should show "никто не откликнулся" with cancel/keep-
  waiting once this flips true; that UI isn't part of this change.
- **Driver cancels after accepting** (`orders.routes.js` `POST
  /orders/:id/cancel`, driver role only — operator cancel is unchanged):
  no longer a dead-end `CANCELLED_BY_DRIVER`. Reopens the order
  (`status='SEARCHING_DRIVER'`, `driver_id=NULL`, waiting-related columns
  cleared), stamps `last_cancelled_by_driver_id`/`_at` on the order, and
  notifies the client (`DRIVER_CANCELLED` push). `listOrdersForDriver` and
  `acceptOrderForDriver`/`submitDriverPriceOffer`
  (`order-dispatch.service.js`) all exclude/reject that specific driver
  from that specific order going forward — they can still see and take
  every other order normally. New additive columns:
  `orders.last_cancelled_by_driver_id` (FK → drivers, `ON DELETE SET NULL`),
  `orders.last_cancelled_by_driver_at`.
- **`cancellation_fee`/`no_show_fee` were dead columns** — never read
  anywhere outside the tariff CRUD. Now live in
  `createOrderCancelledTransaction` (`finance.service.js`): `NO_SHOW`
  always charges `tariffs.no_show_fee`; `CANCELLED_BY_CLIENT` charges
  `tariffs.cancellation_fee` only if a driver had already accepted
  (`accepted_at` set) — a driver or operator cancelling never charges the
  rider. Charged out of `clients.cashback_balance` (same balance the
  existing PAID-order-cancellation refund credits into), **capped at
  whatever's actually there** — there's no client debt/credit concept in
  this codebase, so a client with insufficient balance is charged whatever
  they have, not put in the negative. The driver is credited exactly what
  was actually collected, recorded via the existing `ORDER_CANCELLED`
  financial_transactions row (`metadata.feeType`/`metadata.feeKzt`), no new
  transaction type, no CHECK constraint change.
- **`waiting_total` was a dead column** — `WAITING_CLIENT` already tracked
  `waiting_started_at`/`free_waiting_until`/`waiting_price_per_minute`, and
  `TRIP_STARTED` already froze `paid_waiting_started_at`, but nothing ever
  turned that into money. Now: `TRIP_STARTED` computes and stores
  `waiting_total` (minutes of paid waiting × price/min). `TRIP_COMPLETED`
  folds it into `orders.price`/`orders.service_commission` *and* refreshes
  `pricing_snapshot` (`finalPrice`/`serviceCommission`/`driverEarning`/
  `waitingTotal`) — the refresh matters because
  `finance.service.js#orderAmounts()` prefers `pricing_snapshot.finalPrice`
  over the live `price` column for the ledger entry, so skipping it would
  make the financial_transactions report silently under-count every trip
  with paid waiting, even though the driver was correctly paid.

New test file: `src/tools/order-lifecycle-check.js` (wired into `npm test`)
— structural assertions on the SQL/migration wiring above, a pure-function
suite for `isOrderSearchTimedOut`, and a mock-executor suite for the
cancellation/no-show fee logic (fee capped by balance, no fee before
acceptance, no fee on driver/operator cancel, no-show always charges).
`npm run syntax` and `npm test` both pass (17 checks total now).

## 10. Domain / Railway

Railway is now the only documented production target. Marked
`api.smarttaxi.kz` references as **not used in prod** (kept, not deleted)
in `.env.example`, `infra/nginx/smarttaxi.conf`, and
`docs/DEPLOYMENT_VPS.md`'s header — so a future session doesn't get
confused the way this one's predecessor did. App source code
(`apps/web/src/lib/api.js`, `apps/mobile/src/services/api.ts` — the latter
is a separate/legacy RN tree, not `apps/mobile/smarttaxi_app`) still has
`api.smarttaxi.kz` as a hardcoded fallback; left untouched since that's
runtime app code other sessions are actively working in, not config/docs —
flagging here rather than silently leaving it out of scope.

Wrote `docs/status/railway-domain-setup-2026-07-15.md`: step-by-step manual
instructions (Railway panel → Custom Domain → CNAME at the domain
registrar → wait for verification → update env vars) for attaching
`api.smarttaxi.kz` directly to the Railway service. Not executed — needs
Railway panel and DNS registrar access I don't have.

## Commits (this pass)

1. `fix(drivers): block undocumented drivers from all dispatch paths` — §8
2. `feat(orders): reopen order on driver cancel, bill paid waiting, charge cancellation/no-show fees, surface search timeout` — §9
3. `docs: mark VPS/nginx config unused, Railway is the only prod` — §10 (env/nginx/deployment doc)
4. `docs: Railway custom-domain setup instructions`
5. `docs: this section`

Migration added this pass is additive-only (2 nullable columns + 1 index,
no DROP/rename/NOT NULL backfill) — re-read specifically against "what
happens if this hits the live Railway Postgres with real drivers/orders
right now" before committing: existing rows just get `NULL` in the two new
columns, nothing references them until a driver actually cancels after
accepting.
