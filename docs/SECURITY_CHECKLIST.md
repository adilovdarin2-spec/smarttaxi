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
  **Confirmed materialized on the mobile client (2026-07-15, ~05:00,
  commit `611d783`)**: the driver-side price input in
  [driver_shell.dart](../apps/mobile/smarttaxi_app/lib/features/driver/driver_shell.dart)
  — class `_PriceOfferSheet`, `_submit()`'s bound check
  (`value < 200 || value > 1000000`) — is a free numeric `TextField`
  bounded only by the exact same flat, non-proportional bounds as the
  server's `offeredPriceBounds()`. There is no client-side guardrail (no
  warning, no minimum tied to `currentPrice`/the trip estimate) before a
  driver can submit an arbitrarily low official price for any trip — the
  UI does nothing to narrow the gap this checklist entry already flags
  server-side. Same commit wired the rider-side accept/decline card in
  `apps/web`'s `ClientApp.jsx` (see `docs/status/web-overnight-2026-07-15.md`
  §10) — that side just calls the existing `/price-offer/respond`
  endpoint with no client-computed price, so it doesn't add its own
  bypass surface, only exercises the server one described above.
  **Re-verified 2026-07-15 ~10:52**: the check is still present and
  unchanged after several unrelated mobile UI commits (drawer
  consolidation, active-order banner, tariff carousel, map marker
  fixes) shifted its line number within the file — line numbers above
  are intentionally omitted rather than pinned, since this file is
  under heavy concurrent edit tonight and a stale line reference would
  be worse than none.
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
- **SOS — not prioritized in the support queue**: FIXED (2026-07-15,
  backend). `support.routes.js` (`POST /api/support`,
  `GET /api/admin/support`) now treats `topic: 'SOS'` — the exact string
  `_SafetySheet._sendSosAlert()` in
  [passenger_shell.dart:9992](../apps/mobile/smarttaxi_app/lib/features/passenger/passenger_shell.dart)
  already sends — as a distinct priority: the admin list sorts SOS reports
  first regardless of age (`ORDER BY (topic=$1) DESC, created_at DESC`,
  both the `ALL` and status-filtered queries), `publicMessage()` exposes
  `isUrgent: true` so a future admin/web UI can highlight it without
  re-deriving the topic check itself, and submitting an SOS message now
  fires `notifyUser` (in-app `notifications` row + best-effort push) to
  every active `OWNER`/`OPERATOR` user, not just whoever happens to be
  looking at the queue. Deliberately no new schema column — `topic` was
  already the one signal that mattered, a stored priority column would
  have just duplicated it. Static checks in
  `src/tools/sos-priority-check.js`. **Caveat**: `apps/web`'s admin panel
  doesn't currently have a notifications-bell UI or an SOS highlight in
  its support queue view — the backend contract (`isUrgent`, the
  `SOS_ALERT` in-app notification) is ready for it, but the surfacing on
  the admin/web side is a separate, not-yet-scoped follow-up. This
  session's scope was `apps/api` only.
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
- **Driver document-approval gating — built, verified consistent, then
  deliberately reverted (all same night, 2026-07-15)**. Full trail in
  [qa-overnight-2026-07-15.md §0](status/qa-overnight-2026-07-15.md#0-driver-cant-go-online-without-approval-chain-tracked-across-serverwebmobile).
  Backend added a real `DRIVER_DOCUMENTS_NOT_APPROVED` gate (checked
  before region approval, and on every trip-progress action via the
  shared `assertDriverDispatchReady`); this QA pass tracked it across
  three sessions and confirmed server/admin-web/mobile all agreed on the
  same error-code contract — a working example of cross-session
  reconciliation. **Then reverted by explicit product decision** (commit
  `fdbc214`, "Stop requiring driver documents to go online (per explicit
  request)" — cited reason: document upload/approval added registration
  friction and was blocking drivers over something reviewers found
  off-putting). `assertDriverRegionApproved`/`assertDriverDispatchReady`
  no longer call `assertDriverDocumentsApproved` — the code path that
  can throw `DRIVER_DOCUMENTS_NOT_APPROVED` no longer exists, and mobile
  removed its now-dead handling for that code in the same pass (`855b878`).
  **Current state, as of this checklist**: a driver can go online and
  accept trips with region approval alone — their license, ID, and
  vehicle registration are never required to be reviewed/approved,
  though the upload screens/admin review endpoints still exist for
  drivers who submit documents voluntarily. This is a deliberate,
  cleanly-executed, well-documented product tradeoff (not a bug, not a
  cross-session mismatch) — noting it here because "drivers can work
  with unverified documents" is a real, checklist-relevant fact
  regardless of how deliberately it was chosen, and a future session
  reading `server-overnight-2026-07-15.md` §8 in isolation would
  otherwise believe the gate is still active (that doc has a pointer
  added at its top flagging the reversal, per `a3cc0d3`).

## Production readiness — finalize (2026-07-15)

Final pass through every item above, marking what's actually verified
ready vs. what's still open, and whether the remaining work is a code
change or something only the business owner can do (tracked in
[RELEASE_CHECKLIST_HUMAN_ACTIONS.md](RELEASE_CHECKLIST_HUMAN_ACTIONS.md)).
Read-only review — nothing below was fixed as part of this pass unless
noted.

**Secrets — ready.**
- `.env` git-ignored: confirmed (`git check-ignore`).
- Android keystore/`key.properties`: confirmed git-ignored, confirmed
  not in git history. **But**: the keystore already exists on this
  machine with no known backup elsewhere — this is a human action, see
  `RELEASE_CHECKLIST_HUMAN_ACTIONS.md` §0 (do this first, it's the
  highest-severity open item on this whole list — losing it blocks all
  future app updates permanently).
- `apps/api/secrets/firebase-service-account.json`,
  `android/app/google-services.json`: both confirmed git-ignored.

**API — mostly ready, one config gap.**
- `JWT_SECRET` production guard: enforced in code (`env.js` throws if
  the production secret still matches a placeholder pattern) — ready.
- `RATE_LIMIT_ENABLED=true` default: ready.
- Admin auth/role checks, own-order access, lat/lng validation: all
  spot-checked against `admin.routes.js`/`orders.routes.js` this session
  — ready.
- `SMS_PROVIDER=infobip`: **ready per owner** (2026-07-20) — real Infobip
  account with a funded balance already configured in production. Local
  `.env.example` still shows `SMS_PROVIDER=dev`, which is expected (it's
  a dev-only template, never the production source of truth). See
  `RELEASE_CHECKLIST_HUMAN_ACTIONS.md` §6.
- `CORS_ORIGINS`: currently lists dev localhost ports plus
  `app.smarttaxi.kz`/`smarttaxi.kz` — **those domains don't resolve
  yet** (see below), so this list is aspirational, not wrong; revisit
  once the real domain is live to make sure it doesn't still include
  dev origins in production.

**Infrastructure — blocked on the live domain, one unresolved code gap.**
- OSRM internal-only, Postgres/Redis bound to `127.0.0.1`: both
  confirmed in `docker-compose.yml` — ready.
- Nginx + Let's Encrypt: config exists (`infra/nginx/smarttaxi.conf`)
  and is correct, but **hasn't been applied anywhere** — `api.smarttaxi.kz`
  and `smarttaxi.kz` don't currently resolve (confirmed via `curl` this
  session). This is the VPS/DNS setup itself, a human action (domain
  registrar + hosting provider access) — see
  `RELEASE_CHECKLIST_HUMAN_ACTIONS.md` §5.
- API port not bound to `127.0.0.1` in `docker-compose.yml`: **unresolved
  code gap**, still open from the "New risk areas" entry above — this
  one *is* a code/config fix, not a human action; worth doing before the
  VPS actually goes live rather than after.

**Mobile — ready, contingent on the domain above.**
- Cleartext disabled, release signing required, real (non-placeholder)
  launcher icon: all confirmed ready this session.
- "Release builds use `https://api.smarttaxi.kz`" is only true when the
  build command's `--dart-define` flags are used *and* that domain is
  actually live — neither is guaranteed yet. Not a code defect (the
  default is a deliberate, working fallback to Railway, not a mistake),
  but pick one deployment target on purpose before building the release
  artifact submitted to either store — see `APP_STORE_READINESS.md`.

**Legal — ready.**
- Terms of use, privacy policy, location-data disclosure, support
  contact, and data-deletion process: all present across the 5
  lawyer-approved documents in
  `apps/mobile/smarttaxi_app/lib/core/legal/legal_content.dart` (dated
  2026-07-06), and publicly reachable at `smarttaxi.kz/legal` (once that
  domain is live — see above) via `apps/web/src/features/legal/LegalApp.jsx`.
  Regenerated and committed the previously-untracked
  `apps/web/src/legal/legal-content.json` this pass so the live site
  can't silently drift from the source-of-truth Dart file.
- **Caveat**: these documents name "ИП Жунисова" as the operating
  entity. Confirm that registration is actually finalized (see
  `RELEASE_CHECKLIST_HUMAN_ACTIONS.md` §1) — a lawyer-approved document
  naming a not-yet-registered entity is a real gap, not a formality.

**Bottom line**: nothing found this pass is a code security defect
requiring urgent engineering work, except the API port binding (small,
mechanical fix) and the still-open price-offer/self-referral/SOS-queue
items from "New risk areas" above (product decisions, not blockers to
store submission by themselves). Everything else standing between here
and a public release is either a human action
(`RELEASE_CHECKLIST_HUMAN_ACTIONS.md`) or waiting on the live domain.
