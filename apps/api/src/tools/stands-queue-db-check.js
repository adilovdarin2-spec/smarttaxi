import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
const database = new URL(process.env.STAND_QA_DATABASE_URL || 'about:blank');
assert.ok(['postgres:', 'postgresql:'].includes(database.protocol) &&
  ['localhost', '127.0.0.1', '[::1]'].includes(database.hostname), 'Explicit local STAND_QA_DATABASE_URL required');
assert.notEqual(process.env.NODE_ENV, 'production');
process.env.DATABASE_URL = database.href;
const { pool, query } = await import('../db/pool.js');
const {
  departQueue,
  handOverTurn,
  joinQueue,
  leaveQueue,
  listLiveEntries,
  releaseStandPlaceForDriver,
  sweepStaleQueueEntries,
  touchPresence
} = await import("../modules/stands/stands.service.js");

// The parts of a stand line that need more than one car to be real: who is
// first, what happens when the front car leaves, and what "я отдам свою
// очередь" actually does to the order. Driving these through HTTP would mean
// standing up two approved driver accounts; this talks to the same service
// functions the routes call, against the real database, and removes every row
// it created.
//
// Needs local STAND_QA_DATABASE_URL — not part of `npm test`, which runs with no
// database. Run it against the local stack.

const tag = randomBytes(4).toString("hex");
const created = { stand: null, drivers: [], users: [] };

async function cleanup() {
  if (created.stand) {
    await query("DELETE FROM taxi_stands WHERE id=$1", [created.stand.id]);
  }
  for (const driverId of created.drivers) {
    await query("DELETE FROM driver_locations WHERE driver_id=$1", [driverId]);
    await query("DELETE FROM drivers WHERE id=$1", [driverId]);
  }
  for (const userId of created.users) {
    await query("DELETE FROM users WHERE id=$1", [userId]);
  }
}

async function makeDriver(regionId, index) {
  const user = (await query(`
    INSERT INTO users(name, phone, password_hash, role, is_active)
    VALUES($1,$2,'x','DRIVER',true)
    RETURNING *
  `, [`QA Стоянка ${tag} ${index}`, `+7799${tag.slice(0, 6)}${index}`])).rows[0];
  created.users.push(user.id);
  const driver = (await query(`
    INSERT INTO drivers(user_id, name, phone, car_model, car_color, plate, status, current_region_id)
    VALUES($1,$2,$3,'Gentra','белый',$4,'FREE',$5)
    RETURNING *
  `, [user.id, user.name, user.phone, `QA${tag}${index}`.toUpperCase().slice(0, 10), regionId])).rows[0];
  created.drivers.push(driver.id);
  // A stand belongs to one region and the service now refuses a driver who
  // was never approved to work there — the same rule dispatch already
  // enforces. These fixtures have to clear it like a real driver does.
  await query(`
    INSERT INTO driver_region_approvals(driver_id, region_id, status, approved_at)
    VALUES($1,$2,'APPROVED',NOW())
    ON CONFLICT (driver_id, region_id) DO UPDATE SET status='APPROVED', approved_at=NOW()
  `, [driver.id, regionId]);
  return driver;
}

async function positions(standId) {
  const rows = await listLiveEntries(standId);
  return rows.map((row) => `${row.driver_name.split(" ").pop()}:${row.status}`);
}

async function main() {
  const region = (await query("SELECT * FROM regions WHERE is_active=true ORDER BY name LIMIT 1")).rows[0];
  assert.ok(region, "no active region");

  created.stand = (await query(`
    INSERT INTO taxi_stands(region_id, name, kind, lat, lng, radius_m, boarding_slots, default_seats)
    VALUES($1,$2,'INTERCITY',$3,$4,200,1,4)
    RETURNING *
  `, [region.id, `QA очередь ${tag}`, region.center_lat, region.center_lng])).rows[0];
  const stand = created.stand;
  const at = { lat: Number(stand.lat), lng: Number(stand.lng) };

  const [one, two, three] = [await makeDriver(region.id, 1), await makeDriver(region.id, 2), await makeDriver(region.id, 3)];

  await joinQueue({ driver: one, standId: stand.id, ...at, destinationLabel: "Шымкент", pricePerSeat: 2500 });
  await joinQueue({ driver: two, standId: stand.id, ...at, destinationLabel: "Шымкент", pricePerSeat: 2500 });
  await joinQueue({ driver: three, standId: stand.id, ...at, destinationLabel: "Шымкент", pricePerSeat: 2000 });
  assert.deepEqual(await positions(stand.id), ["1:BOARDING", "2:WAITING", "3:WAITING"], "arrival order is the line");
  console.log("[queue-db-check] three cars in line, first is loading");

  // --- the front car leaves: the next one must move up, exactly one place
  const firstEntry = (await listLiveEntries(stand.id))[0];
  await departQueue({ driver: one, entryId: firstEntry.id });
  assert.deepEqual(await positions(stand.id), ["2:BOARDING", "3:WAITING"], "the second car takes over the front");
  console.log("[queue-db-check] front car departed, next promoted");

  // --- giving your turn to a car already behind you is a swap, not a reshuffle
  const [second, third] = await listLiveEntries(stand.id);
  await handOverTurn({ driver: two, entryId: second.id, toDriverId: three.id });
  assert.deepEqual(
    await positions(stand.id),
    ["3:BOARDING", "2:WAITING"],
    "the receiving car takes the giver's place and the giver takes theirs"
  );
  const afterSwap = await listLiveEntries(stand.id);
  assert.equal(afterSwap[0].received_turn_from_driver_id, two.id, "the swap must be attributable");
  assert.equal(afterSwap[1].gave_turn_to_driver_id, three.id);
  console.log("[queue-db-check] turn handed over as a swap");

  // A car with passengers already aboard cannot give its place away and strand them.
  await query("UPDATE taxi_stand_queue_entries SET taken_seats=2 WHERE id=$1", [afterSwap[0].id]);
  await assert.rejects(
    () => handOverTurn({ driver: three, entryId: afterSwap[0].id, toDriverId: two.id }),
    (error) => error.code === "STAND_HANDOVER_HAS_SEATS",
    "giving away a place with booked seats must be refused"
  );
  await query("UPDATE taxi_stand_queue_entries SET taken_seats=0 WHERE id=$1", [afterSwap[0].id]);
  console.log("[queue-db-check] handover with booked seats refused");

  // --- a car that drove away loses its place, but not before the grace period
  const boarding = (await listLiveEntries(stand.id))[0];
  const away = await touchPresence({
    driverId: boarding.driver_id,
    lat: at.lat + 0.05,
    lng: at.lng
  });
  assert.equal(away.inside, false, "the heartbeat must notice the car left the radius");
  assert.ok(away.distanceM > 1000);
  let swept = await sweepStaleQueueEntries(query, { standId: stand.id });
  assert.equal(swept.expired.length, 0, "a car that just stepped out must keep its place");
  console.log("[queue-db-check] car outside the radius keeps its place inside the grace period");

  // Backdate the moment it left, and the same sweep drops it.
  await query(
    "UPDATE taxi_stand_queue_entries SET outside_since=NOW() - INTERVAL '30 minutes' WHERE id=$1",
    [boarding.id]
  );
  swept = await sweepStaleQueueEntries(query, { standId: stand.id });
  assert.equal(swept.expired.length, 1, "a car gone past the grace period must lose its place");
  assert.equal(swept.expired[0].left_reason, "LEFT_AREA");
  assert.deepEqual(await positions(stand.id), ["2:BOARDING"], "the remaining car moves to the front");
  console.log("[queue-db-check] car gone past the grace period dropped, line re-promoted");

  // --- leaving by hand empties the line
  const last = (await listLiveEntries(stand.id))[0];
  await leaveQueue({ driver: two, entryId: last.id, reason: "DRIVER_LEFT" });
  assert.deepEqual(await positions(stand.id), [], "the line is empty");

  // --- a place is given up for the driver when it stops being true
  // Two things make "this car is standing here" false without the driver
  // pressing anything: going off the line, and accepting a dispatch order.
  const four = await makeDriver(region.id, 4);
  await joinQueue({ driver: four, standId: stand.id, ...at });
  assert.deepEqual(await positions(stand.id), ["4:BOARDING"]);
  const offlineRelease = await releaseStandPlaceForDriver(
    { driverId: four.id, reason: "DRIVER_OFFLINE" },
    query
  );
  assert.equal(offlineRelease.entry.left_reason, "DRIVER_OFFLINE");
  assert.deepEqual(await positions(stand.id), [], "going off the line gives up the place");

  await joinQueue({ driver: four, standId: stand.id, ...at });
  const busyRelease = await releaseStandPlaceForDriver(
    { driverId: four.id, reason: "ACCEPTED_ORDER" },
    query
  );
  assert.equal(busyRelease.entry.left_reason, "ACCEPTED_ORDER");
  assert.deepEqual(await positions(stand.id), [], "accepting an order gives up the place");
  // Releasing a place nobody holds is a no-op, not an error: both callers run
  // on every driver, most of whom are not in any line.
  assert.equal(await releaseStandPlaceForDriver({ driverId: four.id, reason: "DRIVER_OFFLINE" }, query), null);
  console.log("[queue-db-check] place released on going offline and on accepting an order");

  // --- standing at the place is not the same as being allowed to work there
  const stranger = await makeDriver(region.id, 5);
  await query("DELETE FROM driver_region_approvals WHERE driver_id=$1", [stranger.id]);
  await assert.rejects(
    () => joinQueue({ driver: stranger, standId: stand.id, ...at }),
    (error) => error.code === "DRIVER_REGION_NOT_APPROVED",
    "a driver never approved for this region must not advertise seats from it"
  );
  console.log("[queue-db-check] unapproved driver refused at the stand");

  console.log("Stand queue DB checks ok: order, promotion, handover swap, geofence grace, sweep");
}

main()
  .then(cleanup)
  .then(() => pool.end())
  .catch(async (error) => {
    console.error("[queue-db-check] FAILED", error);
    await cleanup().catch(() => {});
    await pool.end().catch(() => {});
    process.exit(1);
  });
