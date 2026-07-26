# Recurring-bookings audit — 2026-07-26 (apps/api/recurring-bookings, mobile "Регулярные поездки")

Fourth in this session's series of targeted correctness audits (client
wallet — clean; driver wallet/payout — 2 bugs fixed; referrals — 1 major
bug fixed; recurring bookings — below). One commit on `dev`, pushed.
Overall the feature's wiring is solid — endpoints, field names, the
status lifecycle (`PENDING_DRIVER→ACTIVE/CANCELLED`, `ACTIVE↔PAUSED`), the
blocked-driver check, and days-of-week/price bounds all matched correctly
on both sides. Two things didn't.

## Fixed: `time_of_day` round-tripped as `HH:MM:SS`, not `HH:MM`

`publicBooking()` returned `row.time_of_day` verbatim. Postgres's `TIME`
column type (see `migrations.js:743`, `time_of_day TIME NOT NULL`)
comes back from `pg` as `"HH:MM:SS"` text by default — no custom type
parser is registered anywhere in `db/pool.js` — but every client always
sends and expects `"HH:MM"` (the `TimeOfDay` zod schema requires exactly
that format on creation). Net effect: immediately after creating a
booking for "08:00", both the passenger and driver "Регулярные поездки"
lists displayed "08:00:00" instead. Fixed by trimming to
`String(row.time_of_day).slice(0, 5)` in `publicBooking()`.

The existing `recurring-bookings-check.js` is a static source-text
assertion file (like this project's other `*-check.js` tools) — it never
modeled Postgres's actual `TIME` output format, which is exactly why this
went unnoticed since the feature was built. Added an assertion that would
catch a regression here. `npm test`: 28/28 pass.

## Flagged, not fixed: scheduler can silently skip a scheduled day with zero user-visible signal

`passengerRecurringEmptyText` (`app_ru.arb:131`) tells the client the
driver *will* come on schedule on the chosen days once a route is set up.
But `recurring-bookings.scheduler.js`'s `createOrderForBooking` (lines
56-69) only actually creates that day's order if, at trigger time, the
assigned driver is currently `FREE`, in the matching region, and passes
`assertDriverDispatchReady` — if any check fails, it just
`console.warn`s "will retry next tick" and returns. There's no fallback
to a different driver, no notification to the client, and no field on
the booking record (`publicBooking()`'s shape has nothing like a
"missed today" flag) for the app to surface. The booking still shows
`ACTIVE` ("Активна") as if nothing happened. A parent relying on this for
a child's school pickup has no in-app way to learn that a specific day's
ride silently didn't happen.

This is the same *class* of bug as the referral-code finding (a UI
promise the backend mechanism doesn't actually keep or report on), but
substantially larger in scope to fix properly — it needs at minimum: a
migration for some kind of per-day outcome record (or a `last_skip_reason`
column), a scheduler change to write it, a client notification
(`notifyUser` is already imported in `recurring-bookings.routes.js` for
other events, so the plumbing exists), and mobile UI on both the
passenger and driver sides to surface a "skipped today" state instead of
a blank `ACTIVE` badge. That's a proper follow-up task, not a inline
patch — flagging here rather than expanding this round's scope to build
it unprompted, consistent with how this session has handled other
real-but-larger findings (e.g. the price-negotiation commission bypass
and the self-referral gap in `admin-launch-readiness-2026-07-19.md`).

## Verification

- `npm test` (apps/api): 28/28 pass.
- No mobile changes this round, so no `flutter analyze`/`flutter test`
  needed — the only touched files are backend (`recurring-bookings.routes.js`,
  `recurring-bookings-check.js`).
