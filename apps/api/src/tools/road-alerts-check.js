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
  "pointInPolygon",
  "dispatchRegionRoom(region.id)"
].forEach(token => assert(routes.includes(token), `road alert route missing ${token}`));

assert(!routes.includes("dispatch:region:"), "road alert realtime room must match dispatchRegionRoom");

const unsafeSearchNeedles = [
  String.fromCharCode(0x043c, 0x0435, 0x043d, 0x0442, 0x044b),
  "avoid " + "police"
];
unsafeSearchNeedles.forEach(token => {
  assert(!routes.includes(`"${token}"`) && !routes.includes(`'${token}'`), "unsafe road alert copy present");
});

// One driver, one vote per report.
//
// /confirm and /expire only moved counters, so the same driver could tap
// either as often as they liked: eight confirmations took any report to full
// confidence, five dismissals expired any report at all — including an
// accident other drivers had just confirmed. The comment on /expire already
// said that must not be possible; nothing enforced it, and drivers read these
// while driving.
assert(
  migrations.includes("CREATE TABLE IF NOT EXISTS road_alert_votes"),
  "a vote has to be recorded somewhere, or counting it twice is free"
);
assert(
  migrations.includes("idx_road_alert_votes_one_per_driver"),
  "and the database, not the route, has to be the thing that says once"
);
assert(
  /UNIQUE INDEX IF NOT EXISTS idx_road_alert_votes_one_per_driver ON road_alert_votes\(alert_id, driver_id\)/.test(migrations),
  "one vote per driver per alert, not per driver or per alert alone"
);
["CONFIRM", "DISMISS"].forEach(vote => {
  assert(
    routes.includes(`VALUES($1,$2,'${vote}')`),
    `${vote} must be written down before the counters move`
  );
});
assert(
  (routes.match(/ON CONFLICT \(alert_id, driver_id\) DO NOTHING/g) || []).length === 2,
  "both answers must fall to the unique index rather than racing it"
);
assert(
  (routes.match(/"ROAD_ALERT_ALREADY_ANSWERED"/g) || []).length === 2,
  "a driver who already answered is told so, not silently counted again"
);
// The reporter's own retraction is not a vote: it is the person who filed it
// saying it is over, and it stays immediate.
assert(
  routes.includes("if (!isOwnReport) {"),
  "the reporter must still be able to retract their own report at once"
);
// Both counter updates now run beside the vote, so a crash between them
// cannot leave a vote recorded with nothing counted, or the reverse.
assert(
  (routes.match(/await tx\(async \(client\) => \{/g) || []).length === 2,
  "the vote and the count it causes belong in one transaction"
);

console.log("Road-safety alert checks ok");
