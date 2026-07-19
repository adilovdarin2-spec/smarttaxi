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
  "ADD COLUMN IF NOT EXISTS recurring_booking_id UUID REFERENCES recurring_bookings(id)"
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

assert(admin.includes('router.get("/recurring-bookings", requireAuth, requireRole("OWNER", "FINANCE")'), "admin recurring-bookings overview must require OWNER/FINANCE");

console.log("Recurring bookings (\"школьный маршрут\") checks ok");
