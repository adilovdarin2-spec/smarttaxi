# Security checklist

## Secrets

- `.env` is ignored and must never be committed.
- SSH keys, Infobip API keys, JWT secrets, Android keystores, and backups must never be committed.
- `apps/mobile/smarttaxi_app/android/key.properties` is ignored.

## API

- `JWT_SECRET` must be changed in production.
- `SMS_PROVIDER=infobip` in production.
- `RATE_LIMIT_ENABLED=true` in production.
- `CORS_ORIGINS` must list only real app origins.
- Admin routes require auth and owner/operator/finance roles where applicable.
- Users must access only their own orders unless their role allows operations access.
- Latitude/longitude inputs are validated by API schemas.

## Infrastructure

- OSRM is internal-only in Docker.
- PostgreSQL and Redis are bound to `127.0.0.1` on the host.
- Nginx terminates TLS for public domains.
- Use Let's Encrypt certificates before exposing mobile builds to testers.

## Mobile

- Release builds should use `https://api.smarttaxi.kz`.
- Cleartext HTTP is disabled in the main Android network config.
- Debug builds may use cleartext for local development only.
- Android release signing must use a real upload key via ignored `key.properties`.

## Legal

Before public store submission, publish:

- terms of use;
- privacy policy;
- location-data disclosure;
- support contact;
- data deletion/contact process.

## New risk areas (QA overnight 2026-07-15 review)

Reviewed against `apps/api/src` as of the `server-overnight-2026-07-15`
feature set (price-offer, recurring bookings, promo deletion, referrals,
favorite/blocked drivers, quick messages). Read-only review — no code
changed.

- **Price negotiation ("торг") — commission bypass**: NOT MITIGATED, known
  risk. `offeredPriceBounds()` in
  [order-pricing.service.js](../apps/api/src/modules/orders/order-pricing.service.js)
  allows any offered price between a flat 200 ₸ and 1,000,000 ₸ regardless
  of the trip's estimated price — there's no floor proportional to
  distance/tariff. Commission (`service_commission`) is a percentage of
  the final `price`. Combined with `payment_method='CASH'` being allowed,
  a driver and client can agree in-app to an artificially low official
  price (down to 200 ₸) via `/api/orders/:id/price-offer` +
  `/respond`, then settle the real fare difference in cash outside the
  app — the platform has no way to detect or prevent this. Rate limiting
  is in place (20/min submit, 30/min respond in
  [orders.routes.js](../apps/api/src/modules/orders/orders.routes.js)) but
  that only throttles spam, not the underlying bypass. Needs a product
  decision (e.g. minimum price as % of estimate, or flagging orders with
  large negotiated discounts for finance review) — not a QA-session fix.
- **Recurring bookings ("школьный маршрут") — driver-only visibility**:
  VERIFIED DONE. `recurring-bookings.scheduler.js` inserts the
  auto-created order directly with `status='DRIVER_FOUND'` and
  `driver_id` pre-set — it never goes through `listOrdersForDriver`'s
  open dispatch pool, so no other driver ever sees it.
- **Promo code deletion — audit log**: VERIFIED DONE.
  `DELETE /api/admin/promo-codes/:id` writes `action: "promo_code_deleted"`
  via `writeAudit` (see
  [admin.routes.js:880](../apps/api/src/modules/admin/admin.routes.js)),
  and is blocked with `409 PROMO_CODE_HAS_REDEMPTIONS` if the code has any
  redemption history.
- **Referral program — self-referral via multiple accounts**: NOT
  MITIGATED, known risk (flagging per instruction, not fixing).
  `applyReferralCode()` in
  [referrals.service.js](../apps/api/src/modules/referrals/referrals.service.js)
  only blocks a client from referring their own single account
  (`referrer.id === clientId`). Nothing prevents the same person
  registering several accounts on different phone numbers (SIM
  farming) or the same device to refer themselves and farm the
  `referral_bonus_kzt` cashback repeatedly — there's no device
  fingerprint or phone-similarity check anywhere in the registration or
  referral flow.
- **Blocked drivers — excluded from dispatch, not just hidden in UI**:
  VERIFIED DONE. `client_driver_preferences` with `type='BLOCKED'` is
  enforced in three places in
  [order-dispatch.service.js](../apps/api/src/modules/orders/order-dispatch.service.js):
  `listOrdersForDriver` (driver never sees the order), `acceptOrderForDriver`
  (defense in depth), and `submitDriverPriceOffer` (defense in depth for a
  driver with a stale order id from before being blocked).
- **Quick messages — rate limit + fixed vocabulary only**: VERIFIED DONE.
  `POST /api/orders/:id/quick-message` validates `messageKey` against a
  hardcoded `z.enum` of 5 keys (no free-text field exists in the schema),
  and is rate limited 10/min/IP — see
  [orders.routes.js:681-694](../apps/api/src/modules/orders/orders.routes.js).
- **SOS — not prioritized in the support queue**: NOT MITIGATED, real gap
  (not just "known risk" — this is a missing feature). `support_messages`
  has no priority/urgency column, and both
  `POST /api/support` and the admin
  `GET /api/admin/support` list (see
  [support.routes.js](../apps/api/src/modules/support/support.routes.js))
  treat every topic identically, ordered only by `created_at DESC`. An
  SOS/emergency message sits in the same FIFO queue as a lost-item report
  or a general question — it is not flagged, not sorted first, and
  triggers no distinct notification to operators. `service_settings.sosPhone`
  exists for the client to *call* directly, but if the product intends an
  in-app SOS text/report path, that path currently has no priority
  handling at all.
- **VPS deployment — API port not restricted to localhost**: discrepancy
  between `docker-compose.yml` and the Nginx-fronted architecture the
  checklist assumes. The `api` service publishes `ports: - "4000:4000"`
  (all interfaces), not `127.0.0.1:4000:4000` like the `postgres`/`redis`
  services correctly do. `infra/nginx/smarttaxi.conf` proxies to
  `127.0.0.1:4000` assuming that's the only path in, but as configured the
  API is also directly reachable on port 4000 from the public internet,
  bypassing Nginx and TLS entirely unless an external firewall (e.g. VPS
  provider security group or `ufw`) blocks it — `docs/DEPLOYMENT_VPS.md`
  doesn't currently document a firewall step. Worth fixing before go-live:
  either bind `127.0.0.1:4000:4000` in `docker-compose.yml`, or add an
  explicit `ufw`/security-group step to the deployment doc.
