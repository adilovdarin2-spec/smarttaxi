import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OUT_OF_RANGE_GRACE_MINUTES,
  RESERVATION_TTL_MINUTES,
  assertInsideStand,
  assertHandoverLocation,
  assertStandDriverAvailable,
  haversineMeters,
  publicQueueEntry,
  publicReservation,
  publicStand,
  refreshBoardingSlots,
  standRegionRoom,
  touchPresence,
  standRoom
} from "../modules/stands/stands.service.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const { ACTIVE_ORDER_STATUSES } = await import('../modules/orders/active-order-statuses.js');
const dispatchStatuses = await import('../modules/orders/order-dispatch.service.js');
assert.equal(dispatchStatuses.ACTIVE_ORDER_STATUSES, ACTIVE_ORDER_STATUSES, 'Stands and dispatch must use the same active statuses');
assert.ok(ACTIVE_ORDER_STATUSES.includes('DRIVER_ASSIGNED') && ACTIVE_ORDER_STATUSES.includes('IN_PROGRESS'));

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

const fixNow = Date.parse('2026-09-16T12:00:00Z');
const freshFix = { lat: stand.lat, lng: stand.lng, accuracy: 10, updated_at: new Date(fixNow) };
assert.equal(assertHandoverLocation(stand, freshFix, { now: fixNow }), 0);
for (const fix of [null, {}, { ...freshFix, updated_at: null }, { ...freshFix, updated_at: 'bad' },
  { ...freshFix, updated_at: new Date(fixNow - 30_001) }, { ...freshFix, updated_at: new Date(fixNow + 5001) },
  ...[null, -1, 61, Infinity, NaN].map(accuracy => ({ ...freshFix, accuracy })),
  ...[null, NaN, Infinity, 91].map(lat => ({ ...freshFix, lat })),
  ...[null, NaN, Infinity, 181].map(lng => ({ ...freshFix, lng })),
]) {
  assert.throws(() => assertHandoverLocation(stand, fix, { now: fixNow }),
    error => error.code === 'STAND_HANDOVER_LOCATION_REQUIRED');
}
assert.equal(assertHandoverLocation(stand, { ...freshFix, accuracy: 60, updated_at: new Date(fixNow - 30_000) }, { now: fixNow }), 0);
assert.equal(assertHandoverLocation(stand, { ...freshFix, accuracy: null }, { now: fixNow, queuePresence: true }), 0);
assert.throws(() => assertHandoverLocation(stand, { ...freshFix, lat: stand.lat + 0.1 }, { now: fixNow }),
  error => error.code === 'STAND_OUT_OF_RANGE');
const noQueries = () => { throw new Error('Unavailable drivers must not reach order queries'); };
for (const [driver, code] of [[null, 'DRIVER_NOT_FOUND'], [{ is_blocked: true }, 'DRIVER_BLOCKED'],
  [{ status: 'OFFLINE' }, 'DRIVER_OFFLINE'], [{ status: 'BREAK' }, 'DRIVER_OFFLINE'],
  [{ status: 'BUSY' }, 'DRIVER_HAS_ACTIVE_ORDER']]) {
  await assert.rejects(() => assertStandDriverAvailable(driver, noQueries), error => error.code === code);
}
let availabilityQueries = 0;
for (const status of [null, ...ACTIVE_ORDER_STATUSES]) {
  const check = () => assertStandDriverAvailable({ id: 'driver', status: 'FREE' }, async (sql, params) => {
    availabilityQueries++;
    assert.ok(sql.startsWith('SELECT id FROM orders'), 'Eligibility must not write or repair driver status');
    assert.deepEqual(params, ['driver', ACTIVE_ORDER_STATUSES]);
    return { rows: status ? [{ id: 'order', status }] : [] };
  });
  if (status) await assert.rejects(check, error => error.code === 'DRIVER_HAS_ACTIVE_ORDER');
  else await check();
}
assert.equal(availabilityQueries, 8);

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
const heldView = publicQueueEntry({ ...entryRow, taken_seats: 1, pending_seats: 3, manual_seats: 1 });
assert.equal(heldView.freeSeats, 0, 'Pending app requests hold the remaining capacity');
assert.equal(heldView.pendingSeats, 3);
assert.equal(heldView.manualSeats, 1);
const heldRider = publicQueueEntry({ ...entryRow, taken_seats: 1, pending_seats: 3, manual_seats: 1 }, { audience: 'CLIENT' });
assert.equal(heldRider.freeSeats, 0);
assert.ok(!('manualSeats' in heldRider) && !('reservations' in heldRider), 'Aggregate availability does not expose passenger or manual bookkeeping');

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

/* ----------------------------- missing GPS never renews queue presence */
const presenceWrites = [];
const presenceExecutor = async (sql, params) => {
  if (sql.includes('SELECT e.*')) return { rows: [{ id: 'e1', stand_id: 's1',
    stand_lat: stand.lat, stand_lng: stand.lng, radius_m: stand.radius_m }] };
  assert.ok(sql.includes('UPDATE taxi_stand_queue_entries'));
  presenceWrites.push({ sql, params });
  return { rows: [] };
};
for (const point of [ {}, { lat: null, lng: null }, { lat: stand.lat },
  { lat: NaN, lng: stand.lng }, { lat: stand.lat, lng: Infinity },
  { lat: 91, lng: stand.lng }, { lat: stand.lat, lng: 181 },
  { lat: String(stand.lat), lng: stand.lng } ]) {
  const result = await touchPresence({ driverId: 'd1', ...point }, presenceExecutor);
  assert.equal(result.inside, null);
  assert.equal(result.distanceM, null);
}
assert.deepEqual(presenceWrites, [], 'Unknown GPS must not extend last_seen_at or clear outside_since');
assert.equal((await touchPresence({ driverId: 'd1', lat: stand.lat, lng: stand.lng }, presenceExecutor)).inside, true);
assert.equal(presenceWrites[0].params[3], true);
assert.equal((await touchPresence({ driverId: 'd1', lat: stand.lat + 0.01, lng: stand.lng }, presenceExecutor)).inside, false);
assert.equal(presenceWrites[1].params[3], false);
assert.ok(presenceWrites[1].sql.includes('COALESCE(outside_since, NOW())'), 'Repeated outside fixes preserve the first exit time');
assert.equal(await touchPresence({ driverId: 'absent' }, async () => ({ rows: [] })), null);

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

// A place in a line is released for the driver the moment it stops being true,
// not left for the sweeper: going off the line, and accepting a dispatch order.
const driverCore = read("../modules/drivers/driver-core.routes.js");
const dispatch = read("../modules/orders/order-dispatch.service.js");
const orders = read("../modules/orders/orders.routes.js");
assert.ok(
  driverCore.includes("releaseStandPlaceForDriver(") && driverCore.includes("DRIVER_OFFLINE"),
  "going off the line must release the stand place"
);
assert.ok(
  dispatch.includes("releaseStandPlaceForDriver(") && dispatch.includes("ACCEPTED_ORDER"),
  "accepting a dispatch order must release the stand place"
);
assert.ok(
  orders.includes("announceStandRelease(req.io, standRelease)"),
  "the released place must be announced to the line and the stranded riders"
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

// Two requests arriving together both read "no place yet" and both insert;
// the partial unique index rejects the loser. Unhandled, that reached the
// driver as a 500 and a generic "server error" instead of the same plain
// "вы уже в очереди" the sequential path gives.
assert.ok(
  service.includes('const UNIQUE_VIOLATION = "23505";'),
  "the unique-violation translator must be present"
);
["idx_stand_queue_one_live_per_driver", "idx_stand_reservations_one_live_per_client"].forEach((index) => {
  assert.ok(service.includes(index), `${index} must be translated into its rule, not surfaced raw`);
  assert.ok(
    migrations.includes(index),
    `${index} is referenced by the translator but no longer created`
  );
});
["joinQueue", "reserveSeat"].forEach((fn) => {
  const start = service.indexOf(`export async function ${fn}(`);
  assert.ok(start > 0, `${fn} must exist`);
  const body = service.slice(start, service.indexOf("\nexport ", start + 1));
  assert.ok(body.includes("return await tx("), `${fn} must await its transaction or the catch never sees the rejection`);
  assert.ok(body.includes("throw translateUniqueViolation(error);"), `${fn} must translate a lost insert race`);
});

// Closing a stand takes a driver's place and a rider's seat away through no
// action of their own. Both used to find out by watching the screen empty: the
// generic stand_updated says the stand changed, not that your place is gone.
assert.ok(
  adminRoutes.includes("RETURNING *") && adminRoutes.includes("left_reason='STAND_CLOSED'"),
  "closing a stand must keep the rows it cleared so the people behind them can be told"
);
assert.ok(
  adminRoutes.includes("await notifyDroppedDrivers(req.io, closedEntries);"),
  "a driver whose line was closed must be told"
);
assert.ok(
  adminRoutes.includes('await notifyStrandedRiders(req.io, closedReservations, { reason: "STAND_CLOSED" });'),
  "a rider whose seat was closed must be told, and told which case it was"
);

// Each way of losing a place is a different thing to be told. "Машина уехала.
// Выберите другую машину" is wrong when the whole stand just closed — there is
// no other car there to choose.
const notify = read("../modules/stands/stands.notify.js");
for (const reason of ["LEFT_AREA", "STAND_CLOSED", "NO_SIGNAL"]) {
  assert.ok(notify.includes(`${reason}:`), `a place lost to ${reason} needs its own wording`);
}
assert.ok(notify.includes("SEAT_LOST_COPY"), "a seat lost to a closed stand needs its own wording");
assert.ok(
  notify.includes("Закажите машину обычным заказом"),
  "a rider at a closed stand must be pointed somewhere that still exists"
);
// The sweeper writes NO_SIGNAL, so that is the key the wording must be under.
assert.ok(service.includes("'NO_SIGNAL'"), "the sweeper's reason and the notice's key must match");

// Blocking a driver forces them offline, but a place in a line is held
// separately and used to outlive it: the car stayed in the queue and riders
// kept seeing it as loading, with its free seats and the driver's phone
// number, so they could ring a blocked driver and get in.
const adminPanel = read("../modules/admin/admin.routes.js");
assert.ok(
  adminPanel.includes('reason: "DRIVER_BLOCKED"'),
  "blocking a driver must release their place in a stand line"
);
assert.ok(
  adminPanel.includes("await announceStandRelease(req.io, standRelease);"),
  "the line has to be told, or the rider screens keep the car until they refresh"
);
// Only on the way in: unblocking must not disturb a line the driver has since
// rejoined.
const blockRoute = adminPanel.slice(adminPanel.indexOf('router.patch("/drivers/:id/block"'));
assert.ok(
  /if \(body\.isBlocked\) \{\s+standRelease = await releaseStandPlaceForDriver\(/.test(blockRoute),
  "releasing the place must be conditional on actually blocking"
);

// Being offline is enough to refuse a place, on its own. The check used to
// also require a selected region, so a driver with none — the state blocking
// leaves them in — walked past it and advertised a car dispatch cannot reach.
const standRoutes = read("../modules/stands/stands.routes.js");
assert.ok(
  standRoutes.includes('if (driver.status === "OFFLINE") {'),
  "an offline driver must be refused a place whatever their region"
);
assert.ok(
  !standRoutes.includes('driver.current_region_id && driver.status === "OFFLINE"'),
  "the region must not be able to short-circuit the offline check"
);

console.log("Taxi stand checks ok: geofence, audience separation, boarding slots, seat holds, admin and socket wiring");
