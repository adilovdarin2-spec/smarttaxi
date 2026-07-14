import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

const migrations = read("../db/migrations.js");
const server = read("../server.js");
const routes = read("../modules/favorites/favorites.routes.js");
const dispatch = read("../modules/orders/order-dispatch.service.js");

[
  "CREATE TABLE IF NOT EXISTS client_favorite_addresses",
  "idx_client_favorite_addresses_client_id",
  "CREATE TABLE IF NOT EXISTS client_driver_preferences",
  "idx_client_driver_preferences_client_id",
  "idx_client_driver_preferences_driver_id"
].forEach(token => assert(migrations.includes(token), `favorites migration missing ${token}`));

assert(server.includes('app.use("/api/favorites", favoritesRoutes)'), "favorites API route is not mounted");

[
  'router.get("/addresses", requireAuth, requireRole("CLIENT")',
  'router.post("/addresses", requireAuth, requireRole("CLIENT")',
  'router.delete("/addresses/:id", requireAuth, requireRole("CLIENT")',
  'router.get("/drivers", requireAuth, requireRole("CLIENT")',
  'router.post("/drivers", requireAuth, requireRole("CLIENT")',
  'router.delete("/drivers/:driverId", requireAuth, requireRole("CLIENT")'
].forEach(token => assert(routes.includes(token), `favorites route missing ${token}`));

// Field-name contract other clients (web/mobile) must match exactly —
// pinned here because a prior QA pass already caught a web session
// guessing the wrong field names (label/address) before reading this
// contract. See docs/status/server-overnight-2026-07-15.md §5.
assert(routes.includes("title: z.string().trim().min(1).max(80)"), "favorite address body must use the field name `title`, not e.g. `name`");
assert(routes.includes("addressText: z.string().trim().min(2).max(180)"), "favorite address body must use the field name `addressText`, not e.g. `address`");
assert(routes.includes('label: z.enum(["HOME", "WORK", "OTHER"]).default("OTHER")'), "favorite address label must be one of HOME/WORK/OTHER, defaulting to OTHER");

// A driver is FAVORITE or BLOCKED, never both — re-POSTing with a different
// type flips it via upsert rather than creating a second row.
assert(routes.includes("type: z.enum([\"FAVORITE\", \"BLOCKED\"])"), "driver preference type must be constrained to FAVORITE/BLOCKED");
assert(routes.includes("ON CONFLICT (client_id, driver_id) DO UPDATE SET type=EXCLUDED.type"), "setting a driver preference must upsert (one row per client+driver), not accumulate duplicate rows");

// Dispatch-side enforcement of BLOCKED — the actual security-relevant part:
// see SECURITY_CHECKLIST.md "заблокированные водители" entry. This check
// only pins that the source still contains the three enforcement points;
// deeper behavioral coverage of the exclusion logic itself lives in
// order-dispatch tests, not duplicated here.
assert(dispatch.includes("bp.client_id=o.client_id AND bp.driver_id=$1 AND bp.type='BLOCKED'"), "listOrdersForDriver must exclude orders whose client has blocked this driver");
assert(dispatch.includes('WHERE client_id=$1 AND driver_id=$2 AND type=\'BLOCKED\''), "acceptOrderForDriver/submitDriverPriceOffer must re-check the client's block list (defense in depth for stale order ids)");

console.log("Favorite addresses / favorite & blocked drivers checks ok");
