import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

const schema = read("../db/schema.sql");
const migrations = read("../db/migrations.js");
const server = read("../server.js");
const routes = read("../modules/road-alerts/road-alerts.routes.js");

[
  "road_alerts",
  "region_id UUID NOT NULL REFERENCES regions",
  "driver_id UUID NOT NULL REFERENCES drivers",
  "SPEED_CAMERA",
  "TRAFFIC_JAM",
  "ROAD_CLOSED",
  "confirmations_count"
].forEach(token => assert(schema.includes(token), `road alert schema missing ${token}`));

[
  "CREATE TABLE IF NOT EXISTS road_alerts",
  "idx_road_alerts_region_status_created_at",
  "idx_road_alerts_driver_id",
  "idx_road_alerts_expires_at"
].forEach(token => assert(migrations.includes(token), `road alert migration missing ${token}`));

assert(server.includes('app.use("/api/driver/road-alerts", roadAlertsRoutes)'), "road alert API route is not mounted");

[
  'router.get("/", requireAuth, requireRole("DRIVER")',
  'router.post("/", requireAuth, requireRole("DRIVER")',
  'router.patch("/:id/confirm", requireAuth, requireRole("DRIVER")',
  'router.patch("/:id/expire", requireAuth, requireRole("DRIVER")',
  "ROAD_HAZARD",
  "ACCIDENT",
  "ROAD_WORK",
  "SPEED_CAMERA",
  "TRAFFIC_JAM",
  "ROAD_CLOSED",
  "OTHER",
  "unsafeCommentPattern",
  "pointInPolygon"
].forEach(token => assert(routes.includes(token), `road alert route missing ${token}`));

const unsafeSearchNeedles = [
  String.fromCharCode(0x043c, 0x0435, 0x043d, 0x0442, 0x044b),
  "avoid " + "police"
];
unsafeSearchNeedles.forEach(token => {
  assert(!routes.includes(`"${token}"`) && !routes.includes(`'${token}'`), "unsafe road alert copy present");
});

console.log("Road-safety alert checks ok");
