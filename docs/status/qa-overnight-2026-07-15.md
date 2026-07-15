# QA overnight — 2026-07-15 (docs/**, read-only apps/**)

Autonomous QA/DevOps session. Scope: `docs/**` and root `*.md` docs plus
read-only audit of `apps/**`. No `docker compose up`, no local Postgres
touched (known machine limitation — see `reference_local_backend_env`
memory). No app code changed, only docs.

---

## 0. URGENT (2026-07-15 ~11:21) — "driver can't go online without approval" chain: repo-integrity break + a mobile/backend contract gap

Per explicit user instruction to watch this cross-cutting scenario once
commits from server/web/mobile all touch it. Found and verified by
reading code directly (not trusting any status doc's self-report),
triggered by noticing `apps/api/src/tools/price-offer-check.js` had been
externally extended (by another session) with a `driver_documents` mock
query — a signal that `assertDriverDispatchReady`'s dependency chain had
grown a new gate.

**0a. Repo-integrity break — HEAD does not boot.** `apps/api/src/server.js`
at `HEAD` (already committed, `git show HEAD:apps/api/src/server.js`
confirms it) imports:
```
import driverDocumentsRoutes, { driverApplicationDocumentsRouter } from "./modules/driver-documents/driver-documents.routes.js";
```
But `apps/api/src/modules/driver-documents/` (the whole directory:
`driver-documents.routes.js`, `driver-documents.service.js`,
`upload.middleware.js`) **has zero commits in git history** —
`git log --all -- apps/api/src/modules/driver-documents/` and
`git ls-files` both return nothing; `git status` shows the whole
directory as untracked (`??`). **A fresh `git clone` + `npm start` of
this repo right now would crash on boot** with a missing-module error —
this isn't hypothetical, it's the actual committed state. Everything
still works in this one shared working directory only because the
untracked files happen to still be sitting on disk; they'd survive a
`git stash` (stash doesn't touch untracked files by default) but not a
`git clean -fd`. The underlying `driver_documents` **database table**
migration is fine and already committed (`migrations.js` at `HEAD`
already creates it; `schema.sql` doesn't yet, but that's expected —
migrations.js runs at every boot regardless, per the established pattern
this session already noted for other recent features). **This needs
someone to `git add` and commit the `driver-documents/` module directory
as its own priority — not attempted here, it's not this QA pass's
in-progress work to commit on another session's behalf.**

**0b. Mobile doesn't handle the new `DRIVER_DOCUMENTS_NOT_APPROVED` code.**
The backend's `assertDriverCanGoOnline()` →
`assertDriverRegionApproved()` (in
[driver-region-approvals.service.js](../../apps/api/src/modules/driver-region-approvals/driver-region-approvals.service.js),
currently uncommitted — `git status` shows `M`) now checks
**documents before region approval**:
```js
async function assertDriverDocumentsApproved(driver, executor) {
  const missing = await getMissingRequiredDocumentTypes(driver.id, executor);
  if (missing.length > 0) {
    throw new AppError("Driver documents are not approved", 403, "DRIVER_DOCUMENTS_NOT_APPROVED", { missing });
  }
}
```
Mobile shipped a fix for exactly this class of problem tonight (commit
`d4ab35b`, "explain the region-approval gate on the driver line toggle,
not a bare error") — but its scope only covers region approval:
- `driver_shell.dart`'s `_setOnline()` catch block special-cases
  exactly `{'DRIVER_REGION_NOT_APPROVED', 'DRIVER_REGION_BLOCKED',
  'DRIVER_BLOCKED'}` (confirmed by reading the set literal directly) —
  `DRIVER_DOCUMENTS_NOT_APPROVED` is absent, so it falls through to the
  plain `_error` inline banner path, not the toast + auto-open-documents-
  screen path this whole fix was built for.
- `readableError()`'s friendly-message map (`driver_shell_helpers.dart`)
  lists `DRIVER_REGION_NOT_SELECTED`/`DRIVER_REGION_INACTIVE`/
  `DRIVER_REGION_NOT_APPROVED`/`DRIVER_REGION_BLOCKED`/`DRIVER_BLOCKED` —
  no entry for `DRIVER_DOCUMENTS_NOT_APPROVED` either, so even the bare
  banner likely shows a generic/technical fallback message rather than
  something a driver can act on.
- `_disabledReason()` (the *upfront* check that greys out the toggle
  before the driver even taps it) only looks at `_regions`/region
  `status` — it never fetches or checks document-approval status at
  all, so there's no proactive warning for this case either, only
  whatever `_setOnline`'s catch block does after a failed attempt.
- Net effect: since `assertDriverDocumentsApproved` runs **before** the
  region checks in the backend chain, a driver whose documents aren't
  approved yet (arguably the single most common reason a new driver
  can't go online — it's the first gate, before region review is even
  reached) gets exactly the "bare error, no explanation" experience the
  URG-EXTRA fix set out to eliminate. The fix solved the region-approval
  half of the chain and missed the documents half, even though both
  halves are enforced by the same function it's reacting to.

**Not fixed here** — this is a QA finding for the mobile/backend sessions
to reconcile, not something to patch unilaterally mid-review. The
concrete ask for whichever session picks this up: add
`DRIVER_DOCUMENTS_NOT_APPROVED` to both the `approvalCodes` set and the
`readableError` map in `driver_shell.dart`/`driver_shell_helpers.dart`
(the `missing` array in the error payload could even drive a specific
"upload these documents" message instead of a generic one).

`docs/status/server-overnight-2026-07-15.md` doesn't mention
`DRIVER_DOCUMENTS_NOT_APPROVED` or `assertDriverDocumentsApproved` at
all yet, despite a code comment in the (uncommitted)
`driver-region-approvals.service.js` pointing to that doc "for why this
replaces `is_blocked` as the enforcement point" — the doc update likely
just hasn't landed yet since the backend side of this is still
mid-flight/uncommitted (see 0a).

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

Initial pass (before ~03:00): no `docs/status/mobile-overnight-*.md`
existed yet. **Update (2026-07-15, ~06:00-06:30, via the QA loop's
periodic recheck)**: it now exists, at a non-obvious path —
`apps/mobile/smarttaxi_app/docs/status/mobile-overnight-2026-07-15.md`
(nested under the mobile app, not at the repo-root `docs/status/` like
the other three) — worth remembering for future sessions searching for
it. That session shipped a 16-item brief covering, among other things,
all five features tracked here. Re-verified every field name below
directly against `apps/mobile/smarttaxi_app/lib/core/api/api_client.dart`
(grep, not trusting the doc's own claims):

- **favorites (addresses)**: backend `label?/title/addressText/lat/lng` ↔
  web `mvpApi.js` **and** mobile `ApiClient.createFavoriteAddress` (body
  keys `label`/`title`/`addressText`, confirmed by grep) — **matches on
  both clients**, no outstanding issue.
- **favorites (drivers)**: backend `{driverId, type: FAVORITE|BLOCKED}` ↔
  mobile `ApiClient` calls to `/api/favorites/drivers` — **matches**.
  Wired mobile-side this cycle (commit `bbe0de3`); web still doesn't wire
  the driver favorite/block list (only addresses), which is a real gap
  but not a mismatch.
- **referrals**: backend `/api/referrals/mine` + `/me` alias ↔ web calls
  `/me`, mobile `ApiClient.getReferralSummary()` also calls
  `/api/referrals/me` (confirmed by grep) — **matches on both clients**.
  Registration-time code redemption (`referralCode` field, backend-ready)
  is still unwired on both clients — a real, explicitly-flagged gap on
  both sides (mobile's doc calls this out too, §12), not a mismatch.
- **recurring-bookings**: backend contract (`daysOfWeek`/`timeOfDay`/
  `priceKzt`/etc.) ↔ mobile `ApiClient.createRecurringBooking` — **matches**
  (confirmed by grep: `daysOfWeek`, `timeOfDay`, `priceKzt` all present as
  exact keys). Full client+driver flow now wired on mobile (commit
  `0f4070d`); web still only has the admin read-only overview, no
  client-facing booking creation — a gap, not a mismatch.
- **price-offer** (driver counter-offer, `driver_offer_price_kzt` /
  `/api/orders/:id/price-offer[/respond]`): wired on both clients, field
  names match (`driverOfferPriceKzt`/`driverOfferStatus` in mobile
  `models.dart` parse `driver_offer_price_kzt`/`driver_offer_status`
  correctly). **This wiring is also what confirmed the known
  commission-bypass risk is real and reachable, not just theoretical** —
  see `SECURITY_CHECKLIST.md` "New risk areas": the mobile driver price
  input (`_PriceOfferSheet` in `driver_shell.dart`) has no guardrail
  beyond mirroring the server's flat 200–1,000,000 ₸ bounds.
- **quick-message**: **update — now wired on mobile too** (commit
  `5f90802`, both client and driver sides). `ApiClient.sendQuickMessage`
  posts `{messageKey}` to `/api/orders/:id/quick-message` — matches. The
  mobile doc notes its 5-option button copy is a *local, hand-mirrored*
  copy of the server's `QUICK_MESSAGES` map, not fetched from it — flagged
  by that session as a manual-sync risk if the backend vocabulary ever
  changes; worth a shared-constants follow-up, not urgent tonight since
  the 5 keys currently match exactly.

**No field-name/path mismatches found anywhere** — every gap that exists
is "one side hasn't wired it yet," never "wired against the wrong
contract." As of this recheck, mobile has now caught up on all five
features (plus SOS, share-trip, and more — see its own status doc for the
full 16-item scope); the remaining cross-client gaps are: web missing
favorite/blocked-driver UI and client-facing recurring-booking creation,
and both clients missing referral-code entry at registration.

---

## 4. Not done this session

- No live/integration testing — this machine has no working local
  backend (Docker hangs, native Postgres password unknown, no Redis; see
  `reference_local_backend_env` memory). Everything above is a static
  code/doc audit only.
- Did not touch `apps/**` code — read-only per scope.
