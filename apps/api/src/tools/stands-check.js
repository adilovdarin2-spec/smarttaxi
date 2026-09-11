import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OUT_OF_RANGE_GRACE_MINUTES,
  RESERVATION_TTL_MINUTES,
  assertInsideStand,
  haversineMeters,
  publicQueueEntry,
  publicReservation,
  publicStand,
  refreshBoardingSlots,
  standRegionRoom,
  standRoom
} from "../modules/stands/stands.service.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

/* ------------------------------------------------- the geofence itself */

// Мырзакент bazaar, and a point ~95 m away along the same street.
const stand = { id: "s1", lat: 40.933_5, lng: 68.542_1, radius_m: 120, region_id: "r1", name: "Базар" };
const insideDistance = haversineMeters(stand.lat, stand.lng, 40.934_35, 68.542_1);
assert.ok(insideDistance > 80 && insideDistance < 110, `fixture drifted: ${insideDistance}`);
assert.equal(assertInsideStand(stand, { lat: 40.934_35, lng: 68.542_1 }), Math.round(insideDistance));

// 300 m away is a different street corner, not this stand.
assert.throws(
  () => assertInsideStand(stand, { lat: 40.936_2, lng: 68.542_1 }),
  (error) => error.code === "STAND_OUT_OF_RANGE" && error.details.radiusM === 120,
  "a driver outside the radius must not be able to hold a place"
);
// No position at all is not the same as being there.
assert.throws(
  () => assertInsideStand(stand, { lat: null, lng: null }),
  (error) => error.code === "STAND_LOCATION_REQUIRED"
);

/* ------------------------------------ what each audience is allowed to see */

const entryRow = {
  id: "e1",
  stand_id: "s1",
  driver_id: "d1",
  region_id: "r1",
  status: "BOARDING",
  queue_seq: 7,
  destination_label: "Шымкент",
  price_per_seat: 2500,
  total_seats: 4,
  taken_seats: 3,
  comment: "выезжаю как наберу",
  joined_at: "2026-09-11T10:00:00Z",
  last_seen_at: "2026-09-11T10:20:00Z",
  outside_since: null,
  driver_name: "Ержан",
  driver_phone: "+77010000001",
  car_model: "Gentra",
  car_color: "белый",
  plate: "123ABC13",
  rating: "4.85"
};

const riderView = publicQueueEntry(entryRow, { audience: "CLIENT", position: 1 });
assert.equal(riderView.freeSeats, 1, "free seats must be derived, never trusted from the client");
assert.equal(riderView.driver.phone, "+77010000001", "calling the car is the point of a stand");
assert.equal(riderView.position, 1);
// A rider gets the car, not the operational bookkeeping of the line.
for (const hidden of ["queueSeq", "lastSeenAt", "outsideSince", "reservations", "regionId"]) {
  assert.ok(!(hidden in riderView), `rider view must not expose ${hidden}`);
}

const driverView = publicQueueEntry(entryRow, { audience: "DRIVER", position: 1, reservations: [] });
assert.equal(driverView.queueSeq, 7);
assert.deepEqual(driverView.reservations, []);

// A rider must never receive another rider's name and number.
const reservationRow = {
  id: "res1",
  entry_id: "e1",
  stand_id: "s1",
  driver_id: "d1",
  client_id: "c1",
  seats: 2,
  status: "PENDING",
  source: "APP",
  pickup_label: "улица Абая 12",
  created_at: "2026-09-11T10:05:00Z",
  client_name: "Айгуль",
  client_phone: "+77010000002",
  driver_name: "Ержан",
  driver_phone: "+77010000001",
  stand_name: "Базар"
};
const riderReservation = publicReservation(reservationRow, { audience: "CLIENT" });
assert.ok(!("client" in riderReservation) && !("clientId" in riderReservation));
assert.equal(riderReservation.driver.phone, "+77010000001");
assert.equal(publicReservation(reservationRow).client.phone, "+77010000002", "the driver needs to reach their passenger");

assert.equal(publicStand({ ...stand, boarding_slots: 1, default_seats: 4, kind: "INTERCITY", is_active: true }).radiusM, 120);
assert.equal(standRoom("s1"), "stand:s1");
assert.equal(standRegionRoom("r1"), "region:r1:stands");

/* --------------------------------------- who is at the front of the line */

// refreshBoardingSlots is the only thing that decides which cars are loading,
// so it is worth driving directly: three cars, two boarding slots.
function fakeExecutor(liveEntries, slots) {
  const updates = [];
  return {
    updates,
    query: async (sql, params) => {
      if (sql.includes("SELECT boarding_slots")) return { rows: [{ boarding_slots: slots }] };
      if (sql.includes("SELECT id, status FROM taxi_stand_queue_entries")) return { rows: liveEntries };
      if (sql.includes("SET status='BOARDING'")) {
        updates.push({ id: params[0], status: "BOARDING" });
        return { rows: [] };
      }
      if (sql.includes("SET status='WAITING'")) {
        updates.push({ id: params[0], status: "WAITING" });
        return { rows: [] };
      }
      throw new Error(`unexpected sql: ${sql}`);
    }
  };
}

const twoSlots = fakeExecutor([
  { id: "a", status: "WAITING" },
  { id: "b", status: "WAITING" },
  { id: "c", status: "BOARDING" }
], 2);
const promoted = await refreshBoardingSlots("s1", twoSlots);
assert.deepEqual(promoted, ["a", "b"], "the first two places must start loading");
assert.deepEqual(twoSlots.updates, [
  { id: "a", status: "BOARDING" },
  { id: "b", status: "BOARDING" },
  { id: "c", status: "WAITING" }
], "a car that fell back down the line must stop loading");

// Already correct: no writes at all, so a sweep every minute is not a write
// storm against every stand in the country.
const settled = fakeExecutor([
  { id: "a", status: "BOARDING" },
  { id: "b", status: "WAITING" }
], 1);
assert.deepEqual(await refreshBoardingSlots("s1", settled), []);
assert.deepEqual(settled.updates, []);

/* ------------------------------------------------------- wiring guards */

const migrations = read("../db/migrations.js");
[
  "CREATE TABLE IF NOT EXISTS taxi_stands",
  "CREATE TABLE IF NOT EXISTS taxi_stand_queue_entries",
  "CREATE TABLE IF NOT EXISTS taxi_stand_seat_reservations",
  "radius_m INTEGER NOT NULL DEFAULT 120 CHECK (radius_m BETWEEN 20 AND 2000)",
  "idx_stand_queue_one_live_per_driver",
  "idx_stand_queue_live_seq",
  "idx_stand_reservations_one_live_per_client",
  "CHECK (taken_seats <= total_seats)",
  "outside_since"
].forEach((token) => assert.ok(migrations.includes(token), `stand migration missing ${token}`));

const service = read("../modules/stands/stands.service.js");
assert.ok(service.includes("FOR UPDATE"), "queue mutations must lock the row they move");
// Standing at the place is not the same as being allowed to work there: a
// stand belongs to exactly one region, and both ways into a line have to
// check that the driver was approved for it.
assert.equal(
  (service.match(/await assertDriverRegionApproved\(/g) || []).length,
  2,
  "joining and receiving a handed-over turn must both check region approval"
);
assert.ok(
  service.includes("status IN ('PENDING','CONFIRMED')") || service.includes("status='PENDING'"),
  "pending seats must be held against the free-seat count"
);

const routes = read("../modules/stands/stands.routes.js");
[
  'requireRole("CLIENT")',
  'driverStandsRouter.use(requireAuth, requireRole("DRIVER"))',
  "/entries/:entryId/seats",
  "/entries/:entryId/depart",
  "/entries/:entryId/handover",
  "/reservations/:reservationId/accept",
  "/reservations/:reservationId/decline",
  "broadcastStand"
].forEach((token) => assert.ok(routes.includes(token), `stand route missing ${token}`));
// The rider-facing list must never be built from the driver audience.
assert.ok(
  routes.includes('standQueueView(params.id, { audience: "CLIENT" })'),
  "the rider endpoint must request the rider view"
);

const adminRoutes = read("../modules/stands/stands.admin.routes.js");
assert.ok(adminRoutes.includes('requireRole("OWNER")'), "only the owner may draw stands");
assert.ok(adminRoutes.includes("pointInPolygon"), "a stand must land inside its own region");
assert.ok(adminRoutes.includes("STAND_HAS_LIVE_QUEUE"), "deleting a stand with drivers in it must be refused");

const server = read("../server.js");
[
  'app.use("/api/stands", standsRoutes)',
  'app.use("/api/driver/stands", driverStandsRouter)',
  'app.use("/api/admin/stands", adminStandsRoutes)',
  'socket.on("join_stand"',
  "startStandsSweeper(io)"
].forEach((token) => assert.ok(server.includes(token), `stand wiring missing ${token}`));
// The drivers' room carries phone numbers and reservations; riders must not
// be able to land in it.
assert.ok(
  server.includes('if (socket.user.role === "DRIVER") socket.join(`${standRoom(stand.id)}:drivers`)'),
  "the driver stand room must be role-gated"
);

assert.ok(OUT_OF_RANGE_GRACE_MINUTES >= 3 && OUT_OF_RANGE_GRACE_MINUTES <= 30);
assert.ok(RESERVATION_TTL_MINUTES >= 5 && RESERVATION_TTL_MINUTES <= 30);

console.log("Taxi stand checks ok: geofence, audience separation, boarding slots, seat holds, admin and socket wiring");
