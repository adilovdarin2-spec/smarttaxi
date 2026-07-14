# QA overnight — 2026-07-15 (docs/**, read-only apps/**)

Autonomous QA/DevOps session. Scope: `docs/**` and root `*.md` docs plus
read-only audit of `apps/**`. No `docker compose up`, no local Postgres
touched (known machine limitation — see `reference_local_backend_env`
memory). No app code changed, only docs.

---

## 1. Checklist-vs-code audit

Cross-checked `docs/SECURITY_CHECKLIST.md`, `docs/APP_STORE_READINESS.md`,
`docs/DEPLOYMENT_VPS.md`, `docs/BACKUP_RESTORE.md` against the current
`apps/**` code (read-only).

**Все базовые пункты выполнены**, кроме одного нового расхождения:

- Secrets, `.gitignore` (`.env`, `key.properties`) — done, verified via
  `git check-ignore`.
- `JWT_SECRET` production guard, `SMS_PROVIDER` enum, `RATE_LIMIT_ENABLED`
  default `true`, `CORS_ORIGINS` origin-parsing — all enforced in
  [env.js](../../apps/api/src/config/env.js).
- Admin routes: every `admin.routes.js` route checked carries
  `requireAuth` + `requireRole(...)` with sensible role sets (OWNER-only
  for regions/settings/driver-region writes; OWNER+FINANCE for money;
  OWNER+OPERATOR+FINANCE for read-only overviews).
- Users-own-orders: `FORBIDDEN_ORDER` checks present in
  `orders.routes.js` and `order-dispatch.service.js` for every
  client/driver-scoped route touched.
- Postgres/Redis bound to `127.0.0.1` in `docker-compose.yml` — confirmed
  (`127.0.0.1:5434:5432`, `127.0.0.1:6379:6379`).
- Android: package id `kz.smarttaxi.app`, `targetSdk 35`, portrait lock,
  cleartext disabled (manifest placeholder + `network_security_config.xml`
  `cleartextTrafficPermitted="false"`), release build **fails hard**
  without `key.properties` (stronger than the doc implies), `key.properties`
  git-ignored. No `ios/` project — matches the documented hard blocker.
- `docs/DEPLOYMENT_VPS.md` smoke/seed npm scripts (`smoke:health`,
  `smoke:maps`, `smoke:stage3`, `smoke:stage9`, `seed`) all exist and
  point at real files in `apps/api/src/tools/`.
- `infra/scripts/backup-db.sh` / `restore-db.sh` match
  `docs/BACKUP_RESTORE.md` exactly (7-day retention, gzip, 5s abort window
  on restore).

**Найдено новое расхождение** (added to `SECURITY_CHECKLIST.md` under
"New risk areas"):

- `docker-compose.yml`'s `api` service publishes `"4000:4000"` (all
  interfaces), not `127.0.0.1:4000:4000` like `postgres`/`redis` do.
  `infra/nginx/smarttaxi.conf` proxies to `127.0.0.1:4000` assuming
  that's the only path in — but as configured, the API is also directly
  reachable on port 4000 from the public internet on a VPS with no
  external firewall, bypassing Nginx/TLS. `DEPLOYMENT_VPS.md` doesn't
  document a firewall (`ufw`/security-group) step. **Fix before go-live**:
  either bind `127.0.0.1:4000:4000`, or add an explicit firewall step to
  the deployment doc.
- `APP_STORE_READINESS.md`'s release-build command requires
  `--dart-define=API_BASE_URL=https://api.smarttaxi.kz`; without it,
  [app_config.dart](../../apps/mobile/smarttaxi_app/lib/core/config/app_config.dart)
  falls back to a Railway URL, not `api.smarttaxi.kz`. Noted inline in
  the doc as a build-script checklist item.

---

## 2. New risk areas requested for `SECURITY_CHECKLIST.md`

All seven added under a new "New risk areas" section. Summary
(**done** = actually implemented in code and verified; **known risk** =
no code mitigation exists, flagged for a product decision, not fixed this
session per scope):

| Risk | Status |
|---|---|
| Price negotiation — commission bypass via low official price + cash | **known risk, not mitigated** |
| Recurring bookings — order goes only to the assigned driver | **done** |
| Promo code deletion — audit log | **done** (`promo_code_deleted`) |
| Referral — self-referral via multiple accounts/devices | **known risk, not mitigated** |
| Blocked drivers — excluded from dispatch, not just UI-hidden | **done** (3 enforcement points) |
| Quick messages — rate limit + fixed vocabulary only | **done** |
| SOS — priority in support queue | **not mitigated — real gap**, not just a risk: `support_messages` has no priority column, admin queue is plain `ORDER BY created_at DESC` regardless of topic |

Full detail with file/line references is in `SECURITY_CHECKLIST.md`
itself — this doc only summarizes.

---

## 3. API contract sync check (server / web / mobile)

No `docs/status/mobile-overnight-*.md` exists yet for 2026-07-15 — only
`server-overnight-2026-07-15.md` and `web-overnight-2026-07-15.md`. Compared
those two against each other and against the actual `apps/mobile` code
directly (grep, not a status doc) for the five features named:

- **favorites (addresses)**: backend `label?/title/addressText/lat/lng`
  ↔ web `mvpApi.js` — **matches**. Web's own doc already flags that it
  self-corrected a first-pass mismatch (`label/address` → `title/addressText`)
  after reading the server doc — no outstanding issue.
- **referrals**: backend exposes both `/api/referrals/mine` and
  `/api/referrals/me` (alias, added mid-session specifically because the
  web client was already calling `/me`) — web calls `/api/referrals/me` —
  **matches**, no action needed.
- **recurring-bookings**: backend `GET /api/admin/recurring-bookings` ↔
  web admin overview page — **matches** (web's doc explicitly names this
  endpoint). Client-side booking *creation*
  (`POST /api/recurring-bookings`, the driver/client flow, not the admin
  read-only page) is **not wired in web or mobile yet** — backend-only.
- **price-offer** (driver counter-offer, `driver_offer_price_kzt` /
  `/api/orders/:id/price-offer[/respond]`): **backend-only**. Confirmed
  via grep that mobile's existing `offeredPriceKzt` field is the older,
  unrelated rider-side "своя цена" stepper — no `driver_offer` references
  anywhere in `apps/mobile/lib`. Web's client scope tonight didn't touch
  order-in-progress screens either. Not a mismatch (nobody's consuming it
  wrong), just unimplemented on both clients — first thing to wire
  tomorrow if the "торг" feature should ship.
- **quick-message**: same situation — **backend-only**, no
  `messageKey`/`quick-message` references in `apps/mobile/lib` or
  `apps/web/src` client code (only the backend route exists).
- **favorites/drivers** (favorite/blocked drivers,
  `/api/favorites/drivers`): **backend-only** — only `/favorites/addresses`
  is wired in web; neither client wires the driver favorite/block list.

**No field-name/path mismatches found** between what's actually wired on
each side — the gaps are all "backend done, no client wired yet," not
"client wired against the wrong contract." Recommended morning order:
price-offer UI (both apps) and quick-message UI (both apps) are the two
biggest gaps since they're user-facing safety/usability features already
fully backed by working, audited API routes.

---

## 4. Not done this session

- No live/integration testing — this machine has no working local
  backend (Docker hangs, native Postgres password unknown, no Redis; see
  `reference_local_backend_env` memory). Everything above is a static
  code/doc audit only.
- Did not touch `apps/**` code — read-only per scope.
