import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

const migrations = read("../db/migrations.js");
const orderRoutes = read("../modules/orders/orders.routes.js");
const favoritesRoutes = read("../modules/favorites/favorites.routes.js");
const dispatch = read("../modules/orders/order-dispatch.service.js");

// --- 1. Driver rates client ---

[
  "ALTER TABLE clients ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2) NOT NULL DEFAULT 5.00",
  "CREATE TABLE IF NOT EXISTS driver_client_preferences",
  "idx_driver_client_preferences_driver_id",
  "idx_driver_client_preferences_client_id"
].forEach(token => assert(migrations.includes(token), `server-symmetry migration missing ${token}`));

assert(orderRoutes.includes('router.post("/:id/rate-client", requireAuth, requireRole("DRIVER")'), "rate-client endpoint must require an authenticated driver");

const rateClientHandler = orderRoutes.match(/router\.post\("\/:id\/rate-client"[\s\S]*?\n\}\);/)?.[0] || "";
assert(rateClientHandler !== "", "rate-client handler must exist");
assert(rateClientHandler.includes("driverProfile.id !== existing.driver_id"), "rate-client must only allow the order's own driver");
assert(rateClientHandler.includes("SELECT id FROM client_reviews WHERE order_id=$1"), "rate-client must guard against rating the same order twice");
assert(rateClientHandler.includes('["PAID", "RATED", "COMPLETED"].includes(existing.status)'), "rate-client must require the trip be paid/completed before rating");
assert(rateClientHandler.includes("INSERT INTO client_reviews(order_id, driver_id, client_id, rating, tags, comment)"), "rate-client must write a client_reviews row");
assert(rateClientHandler.includes("UPDATE clients SET rating=$1 WHERE id=$2"), "rate-client must keep clients.rating in sync, mirroring drivers.rating");

// --- 2. Driver favorites/blocks a client ---

[
  'router.get("/clients", requireAuth, requireRole("DRIVER")',
  'router.post("/clients", requireAuth, requireRole("DRIVER")',
  'router.delete("/clients/:clientId", requireAuth, requireRole("DRIVER")'
].forEach(token => assert(favoritesRoutes.includes(token), `favorites/clients route missing ${token}`));

assert(favoritesRoutes.includes("type: z.enum([\"FAVORITE\", \"BLOCKED\"])"), "driver->client preference type must be constrained to FAVORITE/BLOCKED");
assert(favoritesRoutes.includes("ON CONFLICT (driver_id, client_id) DO UPDATE SET type=EXCLUDED.type"), "setting a client preference must upsert (one row per driver+client)");

// --- 3. Dispatch-side enforcement of the driver->client BLOCKED entry ---

assert(dispatch.includes("dcp.driver_id=$1 AND dcp.client_id=o.client_id AND dcp.type='BLOCKED'"), "listOrdersForDriver must exclude orders whose client this driver has blocked");
assert(dispatch.includes("WHERE driver_id=$1 AND client_id=$2 AND type='BLOCKED'"), "acceptOrderForDriver/submitDriverPriceOffer must re-check the driver's client block list (defense in depth for stale order ids)");
assert(dispatch.includes("assertClientNotBlockedByDriver(existing.client_id, driver.id, executor)"), "both acceptOrderForDriver and submitDriverPriceOffer must call assertClientNotBlockedByDriver");

console.log("Server symmetry (rate-client, driver favorites/blocks client) checks ok");
