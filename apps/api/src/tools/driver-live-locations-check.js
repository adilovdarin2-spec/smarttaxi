import assert from "node:assert/strict";
import fs from "node:fs";

// This route is a single inline SELECT with no separate service function to
// fake-execute (unlike e.g. wallet.service.js's exported helpers), so this
// is a structural check on the route wiring itself rather than a behavior
// test — still worth asserting the specific safety details (route
// ordering, staleness cutoff, role gate) don't silently regress.
const root = new URL("../", import.meta.url);
const adminRoutesSource = fs.readFileSync(new URL("modules/admin/admin.routes.js", root), "utf8");
const adminAppPath = new URL(
  "../../../web/src/features/admin/AdminApp.jsx",
  import.meta.url
);
const driversLiveMapPath = new URL(
  "../../../web/src/features/admin/DriversLiveMap.jsx",
  import.meta.url
);

assert.ok(adminRoutesSource.includes('router.get("/drivers/live-locations"'), "live-locations route is registered");
assert.ok(
  adminRoutesSource.indexOf('"/drivers/live-locations"') < adminRoutesSource.indexOf('"/drivers/:id"'),
  "live-locations is registered before the /drivers/:id route — Express matches route order, " +
  "so :id would otherwise swallow 'live-locations' as if it were a driver id"
);
assert.ok(adminRoutesSource.includes("requireRole(\"OWNER\", \"FINANCE\")") && adminRoutesSource.includes("live-locations"), "route requires auth");
assert.ok(adminRoutesSource.includes("INTERVAL '10 minutes'"), "stale locations (driver's app crashed without updating status) are filtered out");
assert.ok(adminRoutesSource.includes("NOT d.is_blocked"), "blocked drivers never appear on the live map");
assert.ok(adminRoutesSource.includes("d.status IN ('FREE', 'BUSY')"), "only online drivers appear, not offline ones with a stale last-known position");

if (fs.existsSync(adminAppPath) && fs.existsSync(driversLiveMapPath)) {
  const adminAppSource = fs.readFileSync(adminAppPath, "utf8");
  const driversLiveMapSource = fs.readFileSync(driversLiveMapPath, "utf8");
  assert.ok(adminAppSource.includes("getAdminDriverLiveLocations"), "admin UI calls the live-locations API");
  assert.ok(adminAppSource.includes("DriversLiveMapSection"), "Drivers page has a live-map view mode");
  assert.ok(driversLiveMapSource.includes("maplibregl.Marker"), "map renders real markers, not a placeholder");
} else {
  console.log("Driver live-map web-source checks skipped: apps/web is not present in this runtime image");
}

console.log("Driver live-locations checks ok");
