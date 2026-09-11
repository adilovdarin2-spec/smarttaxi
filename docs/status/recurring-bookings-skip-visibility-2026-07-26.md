# Recurring bookings: skip visibility fix — 2026-07-26 (apps/api/recurring-bookings, apps/mobile)

Follow-up to `recurring-bookings-audit-2026-07-26.md`'s flagged (not
fixed) finding: the scheduler silently swallowed a day it couldn't
dispatch, with zero way for the client or driver to learn about it in the
app. This implements the fix that audit scoped out as too large for that
round.

## The gap, recapped

`recurring-bookings.scheduler.js`'s `createOrderForBooking` only creates
today's order if the assigned driver is `FREE`, in the matching region,
and passes `assertDriverDispatchReady` at trigger time. Every failure
path was a bare `console.warn` + return — no fallback driver, no
notification, no field on the booking record for the app to read. The
booking stayed `ACTIVE` ("Активна") whether or not the ride actually
happened, directly contradicting `passengerRecurringEmptyText`'s promise
that the driver *will* come on schedule.

## Fix

- **Migration** (`migrations.js`): additive `last_skip_date DATE` /
  `last_skip_reason TEXT` columns on `recurring_bookings`, plus a CHECK
  constraint restricting the reason to `CLIENT_MISSING`, `DRIVER_MISSING`,
  `ROUTE_UNAVAILABLE`, `DRIVER_OUT_OF_REGION`, `DRIVER_NOT_READY`,
  `DRIVER_BUSY`. Mirrors `last_triggered_date`'s existing shape rather
  than a separate event-log table, since only "today's outcome" needs to
  be queryable.
- **Scheduler**: new `recordSkip(bookingId, reason)` helper, called from
  every failure branch (including the row-lock race inside the
  dispatch `tx` — distinct from the "already triggered today" branch,
  which is not a failure and must never record a skip). The `UPDATE`'s
  `WHERE last_skip_date IS NULL OR last_skip_date <> CURRENT_DATE` guard
  reuses the same dedup trick as `last_triggered_date`, so a booking that
  fails all ~15 retry ticks in one `TRIGGER_WINDOW_MINUTES` window only
  records and notifies once, not once a minute. A successful dispatch
  clears `last_skip_date`/`last_skip_reason` back to `NULL` so a late
  recovery within the same window doesn't leave a stale skip flag next to
  a ride that did happen. `notifyUser` (already used elsewhere in this
  module) tells the client immediately.
- **Routes**: `/mine` and `/driver` both compute
  `(rb.last_skip_date = CURRENT_DATE) AS skipped_today` in SQL — against
  Postgres's own `CURRENT_DATE`, the same reference the scheduler itself
  reasons about, rather than redoing date/timezone comparison in JS.
  `PATCH /:id/status` does the same in its `RETURNING` clause so a
  same-day pause/resume doesn't drop the flag. `publicBooking()` now
  returns `skippedToday` (bool) and `lastSkipReason`.
- **Mobile** (`models.dart`): `RecurringBooking` gained `skippedToday` /
  `lastSkipReason`; `RECURRING_BOOKING_SKIPPED` added to the
  notifications `orderTypes` set so the push lands in the right inbox
  category.
- **Mobile UI** (`passenger_shell.dart`, `driver_shell.dart`): both
  `_RecurringBookingCard`/`_DriverRecurringBookingCard` show a distinct
  warning-toned "Пропущена сегодня" badge instead of the plain "Активна"
  one when `isActive && skippedToday`, plus an inline banner explaining
  it and that the next scheduled day is unaffected. Two new l10n keys
  (`passengerRecurringStatusSkippedToday`, `passengerRecurringSkippedTodayText`)
  added to both `app_ru.arb` and `app_kk.arb`, reused by both screens the
  same way the existing pause/resume/cancel strings already are.
- Extended `recurring-bookings-check.js` with assertions covering the new
  migration columns, every `recordSkip` call site (including the
  DRIVER_BUSY-appears-twice requirement and the already-triggered branch
  never calling it), and the SQL-computed `skipped_today` field on both
  list endpoints.

## Not changed

Admin web (`apps/web`) still returns the raw `recurring_bookings` row
via `SELECT rb.*` in `admin.routes.js`'s `/recurring-bookings` — the new
columns ride along automatically, but `publicAdminRecurringBooking()` and
the admin UI weren't touched. Out of scope for this pass; flagging here
rather than expanding scope unprompted.

## Verification

- `npm test` (apps/api): 29/29 pass (`recurring-bookings-check.js`
  included).
- `flutter analyze` (apps/mobile/smarttaxi_app): no issues.
- `flutter test`: 35/35 pass.
- No live device/backend verification — same local-environment
  constraints as prior sessions (no reachable local Postgres/Redis).
- **Parallel-session note**: `driver_shell.dart` and both `.arb` files
  were being actively edited by another concurrent session (an unrelated
  driver-support-history feature) while this change was in progress. Two
  of my edits were silently reverted mid-session by whatever operation
  that session ran and had to be reapplied; verified via `git status`/
  targeted `grep` after every reapply that nothing was lost or clobbered
  in either direction before moving on.
