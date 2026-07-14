# Web overnight — 2026-07-15 (apps/web, branch `dev`)

Autonomous frontend session covering the admin promo codes panel, admin
overview pages for recurring bookings and referrals, and wiring three
client-app stubs (favorites, promo check, support) plus a new referral
screen to the real backend. Scope was `apps/web/**` only — `apps/api`
and `apps/mobile` were not touched. Committed in small, per-feature
commits on `dev`, no `git add -A`.

Verification: `npm run check` (`vite build`) after every change, plus
live browser checks of every new/changed client screen (home, favorites,
promo, support, referral — both logged-out states, which is the only
state reachable without a live backend) with zero console errors. The
admin panel's new pages (promo codes, recurring bookings, referrals)
were code-reviewed against the same shared components already used by
the working Regions/Applications/Support pages, and further checked by
temporarily monkey-patching `fetch` in the live preview to confirm they
render with realistic sample payloads. A full logged-in admin walkthrough
against a real database was not possible — no local Postgres/Docker
available this session (see `reference_local_backend_env` memory) — so
stopped at that static/simulated verification rather than forcing a
local backend up.

---

## 1. Admin: promo codes panel

New "Промокоды" nav section in `AdminApp.jsx`. Table-style cards (code,
region, discount, min order price, usage limits, validity, status).
- Create via the existing `POST /api/admin/promo-codes`.
- Toggle active via the existing `PATCH /api/admin/promo-codes/:id/status`.
- Delete via `DELETE /api/admin/promo-codes/:id` — confirmed against
  `docs/status/server-overnight-2026-07-15.md` (backend session added
  this tonight too); maps its `409 PROMO_CODE_HAS_REDEMPTIONS` to a
  specific message telling the admin to deactivate instead.
- No "edit all fields" modal: the API only exposes create + status
  toggle + delete for promo codes, so a full-edit form would have
  silently discarded whatever it couldn't actually persist.

## 2. Admin: recurring bookings overview

Read-only "Регулярные поездки" page — `GET /api/admin/recurring-bookings`,
optional status filter (PENDING_DRIVER/ACTIVE/PAUSED/CANCELLED). Shows
client/driver names, route, days of week, time, price.

## 3. Admin: referrals overview

Read-only "Рефералы" page — `GET /api/admin/referrals`, one row per
referred client (inviter → invitee, reward amount, credited or pending).

## 4. Admin: support page lost-item visibility

The support ticket admin page already existed and already showed
`order_id`, topic and the full message — the one gap was that the
client's "Забыл вещь" topic wasn't a stable value the backend could
match on (see §7). Added a distinct badge/label for that topic once the
client side sends the correct code.

## 5. Client: favorites wired to the real API

`FavoritesSection` now loads/adds/deletes via
`GET/POST/DELETE /api/favorites/addresses`, reusing the existing
`AddressPicker` map-search component (new `mode="favorite"`) instead of
building a second address picker. Shows a login prompt when signed out,
loading/error/empty states otherwise.

## 6. Client: promo code check wired to the real API

`PromoSection` now calls `POST /api/orders/promo/validate` for real.
Since this screen lives in the menu (no active trip price to validate
against), added an "expected trip price" input alongside the code —
the endpoint requires a concrete `orderPriceKzt` to compute a discount,
so this was the honest way to keep the check meaningful rather than
faking a stub result.

## 7. Client: support submission wired to the real API

`SupportSection` now submits to `POST /api/support` (attaching the
active order id when there is one) instead of only setting local
"prepared" state and telling the user it wasn't connected yet.
Also fixed a correctness bug found while cross-checking the backend
status doc: the "Забыл вещь" topic must be sent as the literal string
`LOST_ITEM` for the backend to notify that order's driver — sending the
Russian label (what the first pass did) would have silently never
matched. Other topics stay as plain Russian text (support messages have
no topic enum otherwise).

## 8. Client: referral screen

New "Пригласить друга" menu entry / screen — own code, copy/share
button, invited count and bonus total from `GET /api/referrals/me`.
Not done: adding a "redeem a friend's code" field to registration
(backend already accepts an optional `referralCode` there). Skipped
deliberately — the registration/auth screens are explicitly called out
in memory as another parallel session's territory tonight, so this was
left alone rather than risking a conflicting edit.

## 9. General polish

- `formatError`/`authMessage` (client) and `readError` (admin) no longer
  fall back to the raw `error.message` from a failed request. With no
  backend reachable in this environment that fallback was showing
  English technical strings (e.g. `Failed to fetch`) directly to users
  — replaced with a generic friendly Russian message, on top of the
  existing per-code mappings. This affects every screen in both apps,
  not just tonight's new ones.
- Reused existing shared CSS/components everywhere (`ModalFrame`,
  `PageHeader`, `Badge`, `InfoLine`, `DataCard`, `StatePanel`,
  `SegmentedFilter`, `admin-application-card`) rather than introducing
  new one-off styles, so the new admin pages match the existing pages'
  spacing/typography/icons without a new stylesheet pass. Added only
  three small new CSS blocks (`.favorite-row-premium`,
  `.referral-code-block`, `.info-line-client`) for client-side pieces
  that had no existing equivalent.

---

## Known gaps / follow-ups

- Referral code redemption at signup (see §8) — backend-ready, not
  wired on purpose.
- A full logged-in click-through of the three new admin pages against
  a real database wasn't possible tonight (no local backend). They're
  syntax-checked, pattern-matched against working sibling pages, and
  sample-data-rendered via a temporary fetch mock in the live preview,
  but not integration-tested.
- `apps/web/src/features/client/ClientApp.jsx.tmp` — an empty, untracked
  stray file already present in the tree at session start. Left alone
  (not mine, might be another session's in-progress marker).

## Commits (chronological)

1. `Add admin promo codes CRUD, recurring bookings and referrals overview`
2. `Wire client favorites/promo/support/referral to real backend contracts`
3. `Align favorites/referral/support payloads with the real backend contract`
