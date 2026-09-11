import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

const adminRoutes = read("../modules/admin/admin.routes.js");

// Web admin's driver detail panel had no visibility into which clients
// favorited/blocked a driver or which clients a driver favorited/blocked —
// mobile has this, admin didn't, even read-only. GET /admin/drivers/:id
// now embeds both directions alongside the existing driver/regions payload.
const driverDetailRoute = adminRoutes.match(/router\.get\("\/drivers\/:id"[\s\S]*?\n\}\);/)?.[0] || "";
assert(driverDetailRoute, "GET /drivers/:id route must exist");
assert(driverDetailRoute.includes("FROM client_driver_preferences cdp"), "driver detail must read how clients feel about this driver");
assert(driverDetailRoute.includes("FROM driver_client_preferences dcp"), "driver detail must read how this driver feels about clients");
assert(driverDetailRoute.includes("clientPreferences: clientPreferences.rows.map(mapClientPreference)"), "driver detail response must expose clientPreferences");
assert(driverDetailRoute.includes("driverPreferences: driverPreferences.rows.map(mapClientPreference)"), "driver detail response must expose driverPreferences");

console.log("Driver favorite/blocked preferences (admin visibility) checks ok");
