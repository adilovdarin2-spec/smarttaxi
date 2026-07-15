import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

const migrations = read("../db/migrations.js");
const adminRoutes = read("../modules/admin/admin.routes.js");
const orderRoutes = read("../modules/orders/orders.routes.js");

assert(migrations.includes("CREATE TABLE IF NOT EXISTS commission_overrides"), "commission_overrides table must exist in migrations");

// --- Admin CRUD ---

assert(adminRoutes.includes('router.get("/commission-overrides", requireAuth, requireRole("OWNER", "OPERATOR", "FINANCE")'), "listing commission overrides must be readable by OWNER/OPERATOR/FINANCE");
assert(adminRoutes.includes('router.put("/commission-overrides/:driverId", requireAuth, requireRole("OWNER", "FINANCE")'), "setting a commission override must require OWNER/FINANCE");
assert(adminRoutes.includes('router.delete("/commission-overrides/:driverId", requireAuth, requireRole("OWNER", "FINANCE")'), "removing a commission override must require OWNER/FINANCE");
assert(adminRoutes.includes("ON CONFLICT (driver_id) DO UPDATE SET percent=EXCLUDED.percent, active=EXCLUDED.active"), "setting a commission override must upsert (one row per driver)");
assert(adminRoutes.includes("percent: z.coerce.number().min(0).max(100)"), "commission override percent must be constrained to 0-100");
assert(adminRoutes.includes("commissionOverride: driver.commission_override_percent !== null"), "GET /admin/drivers/:id must surface the driver's current commission override, if any");

// --- Applied at trip completion, not retroactively ---

assert(orderRoutes.includes("SELECT percent FROM commission_overrides WHERE driver_id=$1 AND active=true"), "TRIP_COMPLETED must look up an active commission override for the order's driver");
assert(orderRoutes.includes("SET service_commission=$1"), "an active override must replace service_commission for the whole trip, not just a portion of it");
assert(orderRoutes.includes("'driverEarning', price-$1"), "an active override must refresh pricing_snapshot.driverEarning too, since finance.service.js#orderAmounts() prefers the snapshot over the raw column");
// The override lookup must run before the driver debt/balance update and
// before the ledger entry is created, or the override would silently not
// affect the money that actually moves.
const overrideIndex = orderRoutes.indexOf("commission_overrides WHERE driver_id=$1");
const driverPayoutIndex = orderRoutes.indexOf("UPDATE drivers SET debt=debt+$1");
const ledgerIndex = orderRoutes.indexOf("createOrderCompletedTransaction(updated");
assert(overrideIndex !== -1 && driverPayoutIndex !== -1 && ledgerIndex !== -1, "TRIP_COMPLETED must still contain the driver payout and ledger-entry steps");
assert(overrideIndex < driverPayoutIndex, "commission override must be resolved before the driver's debt/balance is updated");
assert(overrideIndex < ledgerIndex, "commission override must be resolved before the financial_transactions ledger entry is created");

console.log("Commission overrides (admin CRUD + trip-completion commission) checks ok");
