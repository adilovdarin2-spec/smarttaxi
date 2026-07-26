import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

const migrations = read("../db/migrations.js");
const server = read("../server.js");
const routes = read("../modules/recurring-bookings/recurring-bookings.routes.js");
const scheduler = read("../modules/recurring-bookings/recurring-bookings.scheduler.js");
const admin = read("../modules/admin/admin.routes.js");

[
  "CREATE TABLE IF NOT EXISTS recurring_bookings",
  "days_of_week",
  "time_of_day",
  "last_triggered_date",
  "idx_recurring_bookings_client_id",
  "idx_recurring_bookings_driver_id",
  "idx_recurring_bookings_status",
  "ADD COLUMN IF NOT EXISTS recurring_booking_id UUID REFERENCES recurring_bookings(id)",
  "ADD COLUMN IF NOT EXISTS last_skip_date DATE",
  "ADD COLUMN IF NOT EXISTS last_skip_reason TEXT",
  "recurring_bookings_last_skip_reason_check"
].forEach(token => assert(migrations.includes(token), `recurring bookings migration missing ${token}`));

assert(server.includes('app.use("/api/recurring-bookings", recurringBookingsRoutes)'), "recurring bookings API route is not mounted");
assert(server.includes("startRecurringBookingsScheduler"), "recurring bookings scheduler must be started from server.js");

[
  'router.post("/", requireAuth, requireRole("CLIENT")',
  'router.post("/:id/respond", requireAuth, requireRole("DRIVER")',
  'router.get("/mine", requireAuth, requireRole("CLIENT")',
  'router.get("/driver", requireAuth, requireRole("DRIVER")',
  'router.patch("/:id/status", requireAuth, requireRole("CLIENT", "DRIVER")'
].forEach(token => assert(routes.includes(token), `recurring bookings route missing ${token}`));

// A client must not be able to book a driver they've blocked.
assert(routes.includes('type=\'BLOCKED\''), "booking creation must check client_driver_preferences for a BLOCKED driver");
assert(routes.includes('"You have blocked this driver"'), "booking creation must reject a blocked driver with a clear message");

// A still-pending booking can only be cancelled, not paused/activated directly.
assert(routes.includes('existing.status === "PENDING_DRIVER" && body.status !== "CANCELLED"'), "a PENDING_DRIVER booking must only be movable to CANCELLED via the status endpoint");

// pg returns a TIME column as "HH:MM:SS", but every client sends/expects
// "HH:MM" (see the TimeOfDay zod schema) -- publicBooking() must trim the
// seconds back off, not round-trip a format nothing asked for.
assert(routes.includes("timeOfDay: String(row.time_of_day).slice(0, 5)"), "publicBooking must format time_of_day back to HH:MM, not return pg's raw HH:MM:SS");

// A scheduler skip must be visible to the app, not just a console.warn --
// publicBooking() must surface it and /mine + /driver must both compute it
// off the same CURRENT_DATE the scheduler itself uses (not JS's clock).
assert(routes.includes("skippedToday: Boolean(row.skipped_today)"), "publicBooking must surface a skippedToday flag so a skipped day doesn't look identical to a normal ACTIVE booking");
assert(
  (routes.match(/\(rb\.last_skip_date = CURRENT_DATE\) AS skipped_today/g) || []).length === 2,
  "both /mine and /driver must compute skipped_today off CURRENT_DATE, matching the scheduler's own reference clock"
);

// Days-of-week must stay within the documented Mon..Fri (1..5) "school route" range.
assert(routes.includes("z.array(z.coerce.number().int().min(1).max(5))"), "daysOfWeek must be constrained to ISO 1 (Mon) through 5 (Fri)");

// --- Scheduler: verify the auto-created order is assigned directly to the
// booking's driver and never enters the open dispatch pool. This is the
// specific requirement flagged in SECURITY_CHECKLIST.md: "заказ создаётся
// ТОЛЬКО назначенному водителю, не открывается всем."
assert(
  scheduler.includes("VALUES($1,'DRIVER_FOUND',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'CASH',$14,$15,$16,$17,'{}'::jsonb,$18,$19,NOW())"),
  "recurring-booking auto-created orders must be inserted directly as DRIVER_FOUND with driver_id pre-set, not SEARCHING_DRIVER/NEW (which would open it to the whole dispatch pool)"
);
assert(!/status='SEARCHING_DRIVER'|status='NEW'/.test(scheduler), "recurring-booking order creation must never insert an open/undispatched status");
assert(scheduler.includes("status='ACTIVE'"), "scheduler must only fire for ACTIVE bookings");
assert(scheduler.includes("EXTRACT(ISODOW FROM NOW())::int = ANY(days_of_week)"), "scheduler must only fire on the booking's configured days of week");
assert(scheduler.includes("last_triggered_date IS NULL OR last_triggered_date <> CURRENT_DATE"), "scheduler must dedupe so a booking cannot fire twice on the same day");
assert(scheduler.includes('driverRow.status !== "FREE"'), "scheduler must skip (not force) a booking whose driver isn't currently FREE");

// A skipped trigger (no driver available, driver not dispatch-ready, region
// mismatch, etc) must be recorded and surfaced to the client -- not just
// logged where nobody but an operator tailing logs would ever see it.
assert(scheduler.includes("import { notifyOrderClient, notifyOrderDriver, notifyUser }"), "scheduler must import notifyUser to tell the client about a skipped day");
assert(scheduler.includes("async function recordSkip("), "scheduler must have a recordSkip helper instead of only console.warn on a failed dispatch");
assert(scheduler.includes("SET last_skip_date=CURRENT_DATE, last_skip_reason=$2"), "recordSkip must persist the skip against CURRENT_DATE (matching last_triggered_date's own dedup reference)");
assert(scheduler.includes("WHERE id=$1 AND (last_skip_date IS NULL OR last_skip_date <> CURRENT_DATE)"), "recordSkip must dedupe so one bad trigger window doesn't fire ~15 notifications (once per retry tick)");
[
  'await recordSkip(booking.id, "CLIENT_MISSING")',
  'await recordSkip(booking.id, "DRIVER_MISSING")',
  'await recordSkip(booking.id, "ROUTE_UNAVAILABLE")',
  'await recordSkip(booking.id, "DRIVER_OUT_OF_REGION")',
  'await recordSkip(booking.id, "DRIVER_NOT_READY")',
  'await recordSkip(booking.id, "DRIVER_BUSY")'
].forEach(token => assert(scheduler.includes(token), `scheduler is missing a recordSkip call: ${token}`));
// DRIVER_BUSY must be recorded twice: once for the outer status check,
// once for the race lost inside the row-locking tx (driver.status !== "FREE"
// outer check passing doesn't guarantee the row lock still finds it FREE).
assert(
  (scheduler.match(/recordSkip\(booking\.id, "DRIVER_BUSY"\)/g) || []).length === 2,
  "scheduler must record DRIVER_BUSY both for the outer FREE check and for losing the race inside the dispatch tx"
);
// A successful dispatch must clear any earlier same-day skip, not leave a
// stale "skipped today" next to a ride that did end up happening.
assert(scheduler.includes("last_triggered_date=CURRENT_DATE, last_skip_date=NULL, last_skip_reason=NULL"), "a successful dispatch must clear last_skip_date/last_skip_reason, not leave a stale skip flag next to a ride that did happen");
// The "already triggered today" tx branch is not a failure and must never
// be recorded as a skip -- it must be a bare early return with no recordSkip
// call attached, unlike the driver_busy branch right above it.
assert(scheduler.includes('return { status: "already_triggered" }'), "the already-triggered-today tx branch must be distinguishable from a real dispatch failure");
assert(scheduler.includes('if (result.status === "already_triggered") return;'), "the already-triggered-today branch must be a bare return, never calling recordSkip");

assert(admin.includes('router.get("/recurring-bookings", requireAuth, requireRole("OWNER", "FINANCE")'), "admin recurring-bookings overview must require OWNER/FINANCE");

// publicAdminRecurringBooking() is a separate mapper from the client/driver
// one above -- it had the same raw-HH:MM:SS bug independently, and never
// exposed skippedToday/lastSkipReason at all, so an admin diagnosing a
// recurring-booking complaint had no visibility into a skipped day either.
assert(admin.includes("timeOfDay: String(row.time_of_day).slice(0, 5)"), "publicAdminRecurringBooking must format time_of_day back to HH:MM, matching the client/driver mapper's own fix");
assert(admin.includes("skippedToday: Boolean(row.skipped_today)"), "publicAdminRecurringBooking must surface skippedToday to the admin panel");
assert(admin.includes("lastSkipReason: row.last_skip_reason || undefined"), "publicAdminRecurringBooking must surface the specific skip reason for admin diagnosis");
assert(admin.includes("(rb.last_skip_date = CURRENT_DATE) AS skipped_today"), "the admin recurring-bookings query must compute skipped_today off CURRENT_DATE, matching the client/driver endpoints");

console.log("Recurring bookings (\"школьный маршрут\") checks ok");
