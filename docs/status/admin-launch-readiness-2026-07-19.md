# Launch-readiness cleanup + admin panel fixes — 2026-07-19

User asked, on top of the mobile dark-theme work tracked in
`mobile-driver-overnight-2026-07-15.md`: what's left before launch
(excluding Kaspi Pay, which stays deferred until the ИП/merchant account
exists — see `KASPI_PAY_READINESS_2026-07-15.md`), remove WhatsApp, retire
the OPERATOR role (OWNER absorbs it — no separate operator account), and
make the admin panel "ideal". Backend test suite (19 checks at the start,
23 by the end) and the web admin build were used as the regression
baseline throughout — both green after every change below.

## 1. What's actually left for launch (excluding Kaspi Pay)

Read `docs/RELEASE_CHECKLIST_HUMAN_ACTIONS.md`, `docs/APP_STORE_READINESS.md`,
and `docs/SECURITY_CHECKLIST.md` (all current as of 2026-07-15, re-verified
here) rather than re-deriving from scratch. Summary given to the user:

**Code work done this round** (see sections 2-4 below): WhatsApp removal,
OPERATOR role retirement, five admin-panel gaps (SOS highlighting, review
deletion, leaderboard date filter, raffles backend, commission-override UI,
driver favorite/blocked visibility).

**Known, deliberately-not-fixed risks** (flagged in `SECURITY_CHECKLIST.md`,
need a product decision, not a code fix):
- Price-negotiation commission bypass — no floor proportional to the trip
  estimate, a driver+client can agree a very low official price and settle
  the rest in cash. Needs a business call on a minimum-percent-of-estimate
  rule before it's fixable.
- Referral self-referral via multiple accounts/devices — no device
  fingerprinting exists anywhere in registration/referral flow.

**Human-only actions** (not code, tracked in `RELEASE_CHECKLIST_HUMAN_ACTIONS.md`):
back up the existing Android keystore (most urgent item there), finish ИП
registration, Apple/Google developer accounts, point `api.smarttaxi.kz`/
`smarttaxi.kz` at a real server (Railway is the only live backend right
now), fund a real Infobip SMS account, confirm Firebase project ownership,
produce store listing content/screenshots.

**Deliberately not touched**: `docker-compose.yml`'s `api` service still
publishes on all interfaces (`"4000:4000"`, flagged in
`qa-overnight-2026-07-15.md` as a pre-go-live fix) — left alone because (a)
this compose file isn't the production deploy path (Railway is — see
`DEPLOYMENT_VPS.md`'s "NOT USED IN PROD" banner), and (b) another session
had it uncommitted mid-edit for local dev (adding OSRM/MapTiler config) at
the time of this pass — touching it would have collided with in-progress
work on a file that isn't even the real security boundary.

## 2. WhatsApp OTP removal (backend only — never existed on web/mobile)

Confirmed via full-repo search: WhatsApp was purely a backend best-effort
second OTP-delivery channel (`auth/whatsapp.provider.js`, Infobip WhatsApp
Business API), already self-disabled in production (no Meta-approved
template configured — see round 38 in `mobile-driver-overnight-2026-07-15.md`,
where dropping it was already decided). Removed cleanly:
- Deleted `whatsapp.provider.js`.
- Removed its import + both call sites (`/sms/send`, `/password/reset/request`)
  and the `whatsappDelivered`/`whatsappError` audit-metadata fields in
  `auth.routes.js`.
- Removed the 6 `WHATSAPP_PROVIDER`/`INFOBIP_WHATSAPP_*` env vars from
  `env.js` and `.env.example`.

No DB schema/migration involved — those fields only ever lived in a JSONB
audit-log `metadata` column, never a dedicated table/column.

## 3. OPERATOR role retirement

OWNER was already a superset of OPERATOR everywhere — every single
`requireRole(...)` call in the whole backend that included `"OPERATOR"`
also included `"OWNER"` in the same call; there was no route OPERATOR
could reach that OWNER couldn't. This made the removal a pure allow-list
cleanup, not a permission change:

- Removed `"OPERATOR"` from ~30 `requireRole(...)` calls across
  `admin.routes.js`, `orders.routes.js`, `clients.routes.js`,
  `drivers.routes.js`, `finance.routes.js`, `support.routes.js`, and 3
  inline role-array checks (`payments.routes.js`, `routing.service.js`,
  `server.js`).
- Removed the seeded `operator@smarttaxi.local` test account from
  `seed.js` entirely (not reassigned — just deleted from the seed list).
- **Database migration** (the part that actually matters for the already-
  migrated Railway DB, not just fresh installs): added a new statement to
  `migrations.js`'s idempotent `statements` array — `UPDATE users SET
  role='OWNER' WHERE role='OPERATOR'` *before* `DROP CONSTRAINT IF EXISTS
  users_role_check` + a tightened `ADD CONSTRAINT ... CHECK (role IN
  ('CLIENT','DRIVER','OWNER','FINANCE'))`. Order matters: reassigning first
  means the constraint tightening never fails even if a live OPERATOR row
  (e.g. the old seeded account) already exists in production. Also updated
  `schema.sql`'s reference constraint and the in-place fresh-install ADD
  CONSTRAINT in `migrations.js` for consistency (these two don't affect an
  already-migrated DB, only fresh ones — the new DROP+ADD pair is what
  actually fixes Railway).
- Updated 6 static-assertion test files (`auth-seed-check.js`,
  `commission-overrides-check.js`, `recurring-bookings-check.js`,
  `referrals-check.js`, `sos-priority-check.js`, plus two untracked files
  owned by other in-progress sessions — `driver-documents-check.js` and
  `lifecycle-road-alerts-smoke.js` — edited in the working tree but not
  staged/committed here since the files themselves aren't mine to commit;
  see the git-scoping note below) that were pattern-matching the old
  OPERATOR-inclusive route text.
- **`CANCELLED_BY_OPERATOR` (an order-status enum value, unrelated to the
  role) was deliberately left alone** — renaming it would touch ~10 files
  across api/web/mobile for a cosmetic change with no functional benefit,
  not worth the churn. Its display label in the admin UI was updated from
  "Отменён оператором" to "Отменён администрацией" since that specific
  string did reference the retired role name.
- Web: `apps/web/src/app/App.jsx` already had the `/operator` route folded
  into `AdminApp` as an uncommitted change from a different session at the
  time of this pass (confirmed via `git diff` before touching anything
  nearby) — left entirely untouched, not this session's work to claim.
  `AdminApp.jsx`'s own `adminRoles` role-gate Set and its "Войдите под
  владельцем, оператором или финансовым пользователем" login-error text
  *were* edited here (this file was already being edited for the admin
  panel fixes below, so keeping its own OPERATOR references in sync was
  in scope).

Verified: full `npm test` (23 checks after all rounds below) green
throughout; `node --check` on every edited route file after each change.

## 4. Admin panel fixes

Audited `AdminApp.jsx` (17 sections) against the backend and against
`docs/status/{web,server,server-symmetry}-overnight-2026-07-15.md` for
gaps that were still open as of this session (several 2026-07-15 findings
had already been fixed by intervening commits — re-verified each one
against current source rather than trusting the old docs).

**SOS ticket highlighting** — backend already returned `isUrgent` per
`SECURITY_CHECKLIST.md`'s SOS-priority fix, but `SupportTicketCard` never
read it, so an SOS report looked identical to a routine ticket in the
admin queue. Added an `urgent` card variant (red left-border accent) and
an "Экстренно"/🆘 badge, only overridden by "Закрыто" once resolved so the
resolution status stays visible.

**Review deletion — dead button.** `AdminApp.jsx` already called `DELETE
/api/admin/reviews/:id`; the route never existed on the backend at all.
Added it: deletes the `driver_reviews` row, re-averages the driver's
`rating` (falling back to the schema's own 5.00 default when no reviews
remain, matching the exact pattern the create-review route already uses),
writes an audit log entry (same precedent as promo-code deletion).

**Leaderboard date filter — silently ignored.** `QualityPage`'s "За
розыгрыш" scope sends `dateFrom`/`dateTo` (the selected raffle's
`startsAt`/`endsAt`) to `GET /admin/leaderboard`; the route accepted no
query params at all, always returning the same all-time ranking regardless
of which raffle was picked. Fixed by filtering the `LEFT JOIN orders`
condition (not a `WHERE` clause — a driver with zero orders in the window
still needs to appear with zero counts) by `o.created_at` between the two
timestamps. Used direct `timestamptz` comparison rather than the
`::date + INTERVAL '1 day'` idiom used in the finance/tariff date-range
helpers elsewhere in this file, since raffle windows are real instants
(full ISO timestamps), not date-only strings.

**Raffles — entire feature had zero backend routes.** The admin UI
(create/list/delete, `RafflesPage`/`RaffleEditor`) was built against
`GET/POST/DELETE /api/admin/raffles`, none of which existed — every action
404'd. Raffles turned out to be simple: just a named `starts_at`/`ends_at`
window used exclusively as a leaderboard date-range preset, no
prize/entry/winner tracking at all. Added a `raffles` table (migration)
and the three routes (`OWNER`/`FINANCE`, matching the promo-codes
precedent), with a `refine()` check that `endsAt > startsAt` and an audit
log entry on create/delete.

**Commission overrides — backend done 2026-07-15, zero frontend.** The
admin CRUD (`GET/PUT/DELETE /commission-overrides`) and the trip-completion
read path were both already live; nothing in `AdminApp.jsx` called any of
it. Added a `CommissionOverrideEditor` card inside the existing driver
detail panel (not a new top-level nav section — this is a per-driver
setting, and the driver detail panel already shows rating/debt/region
approvals in the same place) — percent input, active checkbox, save/clear,
showing the current override state or "using the tariff default" when
none is set.

**Driver favorite/blocked visibility — read-only, added to driver detail.**
Mobile has full favorite/blocked-driver and favorite/blocked-client
management; web admin had no visibility into either direction at all, not
even read-only, making a support dispute ("why isn't this driver getting
this client's orders") unverifiable from the admin side. Rather than a
separate CRUD section (managing these stays a client/driver self-service
action — admin doesn't need to create or remove entries, only see them),
embedded both directions into the existing `GET /admin/drivers/:id`
response (parallel to the existing region-approvals fetch) and added a
two-column read-only list to the driver detail panel: "Клиенты о
водителе" (client_driver_preferences) and "Водитель о клиентах"
(driver_client_preferences).

All six fixes have a dedicated static-assertion test file under
`src/tools/*-check.js`, wired into `npm test` (`review-delete-check.js`,
`leaderboard-date-filter-check.js`, `raffles-check.js`,
`driver-preferences-admin-check.js`; SOS highlighting and the commission
UI are pure-frontend and covered by the web build passing, not a backend
check file).

## 5. Verification

- `npm test` in `apps/api`: 23/23 checks pass (started at 19, added 4 new
  check files this round).
- `npm run build` in `apps/web`: clean after every change (only the
  pre-existing "chunk larger than 500kB" warning, unrelated).
- Live browser check of the admin login screen (no local backend running —
  known environment limitation, see `reference_local_backend_env` memory —
  so the actual authenticated Support/Drivers/Raffles pages couldn't be
  screenshotted with real data): confirmed the "Войдите под владельцем или
  финансовым пользователем" text updated correctly after the OPERATOR
  removal, via the dev server's HMR.
- Did not attempt to test Kaspi Pay (out of scope per explicit instruction)
  or re-verify the mobile app (no mobile files touched this round).

## Git scoping note

This working tree has several other sessions' uncommitted changes at any
given time (a long-standing pattern all week — see
`feedback_commit_scope_shared_tree` guidance). Staged and committed only
the files this round actually authored:
`apps/api/{.env.example,package.json,src/config/env.js,src/db/migrations.js,
src/db/schema.sql,src/modules/admin/admin.routes.js,
src/modules/auth/auth.routes.js (whatsapp.provider.js deleted),
src/modules/{clients,drivers,finance,orders,payments,support}/*.routes.js,
src/modules/routing/routing.service.js,src/seeds/seed.js,src/server.js,
src/tools/{auth-seed,commission-overrides,recurring-bookings,referrals,
sos-priority}-check.js,src/tools/{review-delete,leaderboard-date-filter,
raffles,driver-preferences-admin}-check.js}`,
`apps/web/src/{features/admin/AdminApp.jsx,lib/mvpApi.js,styles.css}`,
this doc. Two untracked files owned by other sessions
(`driver-documents-check.js`, `lifecycle-road-alerts-smoke.js`) were
edited in the working tree (to keep their OPERATOR-referencing assertions
correct) but deliberately left unstaged — they aren't this session's files
to commit, and the edits stay on disk regardless of git state so `npm
test` still passes for anyone running it against this exact working
directory.
