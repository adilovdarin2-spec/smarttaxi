# Admin panel role-gating audit — 2026-07-25 (apps/web/src/features/admin)

Follow-up to `navigator-cameras-2026-07-25.md`. Continuation of an open-ended
"keep finding and fixing real bugs" instruction. Scope: `AdminApp.jsx` and
`DriversLiveMap.jsx`. Three commits on `dev`, pushed and live-deployed
(Railway auto-deploys `smarttaxi-web` on push).

## Fix 1: FINANCE admins could click order actions that always 403'd

`OrderRow` rendered assign-driver/cancel/advance-status buttons for any
logged-in admin regardless of role, but the backend
(`orders.routes.js`'s `requireRole`) restricts assign-driver and cancel to
OWNER-only, and the status-advance chain to DRIVER+OWNER except the final
step (`mark-paid`), which is OWNER+FINANCE. A FINANCE admin clicking any of
these got a generic, actively-false "no panel access" error — they do have
panel access, just not for that one action. Fixed by computing
`canAssign`/`canCancel`/`canAdvance` from the same `canManageOwnerOnly`
(`role==="OWNER"`) / `canAdjustFinance` (`role==="OWNER"||"FINANCE"`) props
already threaded through the rest of the app, gating `mark-paid` specifically
to `canAdjustFinance`. Also corrected the shared FORBIDDEN error message
(`readError`) since the old wording was simply false for this case.

## Fix 2: dead dashboard tile for FINANCE

The "Активных дорожных событий" dashboard tile linked to the `roadAlerts`
page, which is OWNER-only (hidden from FINANCE at the nav level already).
FINANCE saw a real, non-zero count and a button-shaped click target that
silently did nothing — the same "looks interactive, isn't" trap the sidebar
was already built to avoid. Hidden behind the same `isOwner` check.

## Fix 3: quality page couldn't distinguish "no reviews" from "can't see reviews"

`GET /admin/reviews` is OWNER-only server-side. A FINANCE admin previously
saw "Отзывов пока нет" (no reviews yet) — a false "service quality is
flawless" reading. The `quality` loader now catches the 403 specifically
and returns `reviewsRestricted: true`; the page shows "Доступно только
владельцу" on the two review-derived stat cards and a distinct
"отзывы доступны только владельцу" empty-state instead.

## Fix 4: one finance-tab failure blanked all four tabs

The `finance` loader used `Promise.all` across 7 calls (regions, drivers,
tariffs, summary, driverDebts, reports, transactions) — any one failing
(a slow query, a bad date-range filter) took down the whole page behind one
generic error, same class of bug the orders/tariffs/quality loaders had
already been fixed for earlier in the project (see the `Promise.allSettled`
precedent already in place there). Rewrote to `allSettled`: regions/
drivers/tariffs still throw (they feed every tab's filter dropdowns, so a
failure there really does block the whole page); the 4 actual finance tabs
(overview/reports/debts/transactions) now fail independently, each showing
its own `InlineMessage` while the other three keep working.

## Fix 5: live driver map force-recentered every 15s poll

`DriversLiveMap.jsx`'s `fitBounds`/`easeTo` ran on every poll tick because
`points` is a fresh array each render (recomputed from a fresh `drivers`
prop every 15s). A dispatcher manually panning/zooming to watch one area
got yanked back to fit-all every 15 seconds — defeating the point of a map
they can navigate themselves. Added `hasFittedRef` so the camera only
auto-fits the first time real driver positions appear; marker positions
still update live every poll regardless.

## Fix 6 (trivial): dead `onBlockDriver` prop

Follow-up audit found `onBlockDriver` passed into `DriversPage` but never
referenced in its body — driver blocking only happens via
`DriverDetailPanel`'s own `onBlock` (same underlying `setDriverBlocked`
function, passed there separately). Removed the dead pass-through, no
behavior change.

## Audits that came back clean (verified, not just assumed)

- **Every other admin action** (regions, tariffs, road-alerts, promo codes,
  driver block/region-set/commission, payout review, raffles, settings,
  broadcast, review deletion, support respond/reopen) was checked against
  its actual backend `requireRole` and already matched correctly — the
  Orders bug above was the only real gap of this class in the file.
  `canEditSettings` and `canManageOwnerOnly` turned out to be literally the
  same check (`role==="OWNER"`) under two names — harmless duplication, not
  a bug, not worth the churn of collapsing given how many call sites each
  threads through.
- **Client-wallet mobile screen** (`client_wallet_screen.dart` +
  `client_wallet_models.dart` + `api_client.dart`, the feature built in the
  previous round): field names match the backend response shape exactly,
  `MIN_TOPUP_KZT` is enforced and shown client-side, card-list state stays
  correctly synced after add/remove/set-default, and — the check that
  mattered most — the PENDING-forever top-up status (real Kaspi Pay
  charging isn't wired yet, by design) is disclosed to the user up front
  and on every request row, never implying an instant top-up that silently
  never completes.
- **Kaspi Pay scaffolding** (`kaspi-pay-check.js`): real provider class with
  mock fallback when unconfigured, HMAC webhook signature verification,
  status mapping, and refund guardrails all still pass. No regression.
- **SQL injection spot-check** on the finance module's dynamic query
  builder (`finance.service.js`'s `getFinanceReports`): the `groupBy` query
  param is only ever used as an object-property lookup into a hardcoded
  whitelist map (`day`/`region`/`driver`/`tariff`/`paymentMethod`) — the
  actual SQL fragments it resolves to are fixed string literals, never
  derived from the input itself. All real filter values go through `$N`
  parameterized placeholders. No vulnerability.

## Verification

- `npm run build` in `apps/web`: clean after each change.
- `npm test` in `apps/api`: 28/28 checks pass (full suite, unrelated to
  these frontend-only changes but run as a regression baseline anyway).
- `flutter analyze` in `apps/mobile/smarttaxi_app`: no issues.
- Did not attempt a live role-switching browser test (would need real
  OWNER/FINANCE credentials and a working local backend, neither available
  per `reference_local_backend_env`) — verified via code review against
  the exact backend `requireRole` calls instead, and confirmed via the
  same `{...props}` prop-spread pattern already used successfully
  elsewhere in this file for role props.
