import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
const database = new URL(process.env.STAND_QA_DATABASE_URL || 'about:blank');
assert.ok(['postgres:', 'postgresql:'].includes(database.protocol) &&
  ['localhost', '127.0.0.1', '[::1]'].includes(database.hostname), 'Explicit local STAND_QA_DATABASE_URL required');
assert.notEqual(process.env.NODE_ENV, 'production');
process.env.DATABASE_URL = database.href;
const { pool, query } = await import('../db/pool.js');
const {
  cancelReservation,
  joinQueue,
  departQueue,
  reserveSeat,
  respondToReservation,
  sweepStaleQueueEntries
} = await import("../modules/stands/stands.service.js");

// The rider's half of a stand: booking a seat in somebody's car, and what the
// seat count does while that booking lives. The queue check next door covers
// who stands where; nothing covered this, and it is where a stand can quietly
// go wrong — two riders promised the same last seat, a cancelled booking that
// never gives the seat back, a car that fills up with holds nobody confirmed.
//
// Talks to the same service functions the routes call, against the real
// database, and removes every row it created.
//
// Needs local STAND_QA_DATABASE_URL — not part of `npm test`, which runs with
// no database. Run it against the local stack.

const tag = randomBytes(4).toString("hex");
const created = { stand: null, drivers: [], clients: [], users: [] };

async function cleanup() {
  if (created.stand) {
    await query("DELETE FROM taxi_stands WHERE id=$1", [created.stand.id]);
  }
  for (const driverId of created.drivers) {
    await query("DELETE FROM driver_locations WHERE driver_id=$1", [driverId]);
    await query("DELETE FROM drivers WHERE id=$1", [driverId]);
  }
  for (const clientId of created.clients) {
    await query("DELETE FROM clients WHERE id=$1", [clientId]);
  }
  for (const userId of created.users) {
    await query("DELETE FROM users WHERE id=$1", [userId]);
  }
}

async function makeUser(role, index) {
  const user = (await query(`
    INSERT INTO users(name, phone, password_hash, role, is_active)
    VALUES($1,$2,'x',$3,true)
    RETURNING *
  `, [`QA Бронь ${tag} ${role} ${index}`, `+7798${tag.slice(0, 6)}${index}`, role])).rows[0];
  created.users.push(user.id);
  return user;
}

async function makeDriver(regionId, index) {
  const user = await makeUser('DRIVER', index);
  const driver = (await query(`
    INSERT INTO drivers(user_id, name, phone, car_model, car_color, plate, status, current_region_id)
    VALUES($1,$2,$3,'Gentra','белый',$4,'FREE',$5)
    RETURNING *
  `, [user.id, user.name, user.phone, `QB${tag}${index}`.toUpperCase().slice(0, 10), regionId])).rows[0];
  created.drivers.push(driver.id);
  await query(`
    INSERT INTO driver_region_approvals(driver_id, region_id, status, approved_at)
    VALUES($1,$2,'APPROVED',NOW())
    ON CONFLICT (driver_id, region_id) DO UPDATE SET status='APPROVED', approved_at=NOW()
  `, [driver.id, regionId]);
  return driver;
}

async function makeClient(index) {
  const user = await makeUser('CLIENT', 50 + index);
  const client = (await query(`
    INSERT INTO clients(user_id, name, phone)
    VALUES($1,$2,$3)
    RETURNING *
  `, [user.id, user.name, user.phone])).rows[0];
  created.clients.push(client.id);
  return client;
}

async function seatCounts(entryId) {
  const row = (await query(
    "SELECT total_seats, taken_seats FROM taxi_stand_queue_entries WHERE id=$1",
    [entryId]
  )).rows[0];
  return { total: Number(row.total_seats), taken: Number(row.taken_seats) };
}

async function reservationStatus(reservationId) {
  const row = (await query(
    "SELECT status FROM taxi_stand_seat_reservations WHERE id=$1",
    [reservationId]
  )).rows[0];
  return row?.status || "GONE";
}

async function main() {
  const region = (await query("SELECT * FROM regions WHERE is_active=true ORDER BY name LIMIT 1")).rows[0];
  assert.ok(region, "no active region");

  created.stand = (await query(`
    INSERT INTO taxi_stands(region_id, name, kind, lat, lng, radius_m, boarding_slots, default_seats)
    VALUES($1,$2,'INTERCITY',$3,$4,200,1,4)
    RETURNING *
  `, [region.id, `QA бронь ${tag}`, region.center_lat, region.center_lng])).rows[0];
  const stand = created.stand;
  const at = { lat: Number(stand.lat), lng: Number(stand.lng) };

  const driver = await makeDriver(region.id, 1);
  const [anna, bolat, dina] = [await makeClient(1), await makeClient(2), await makeClient(3)];

  const joined = await joinQueue({
    driver, standId: stand.id, ...at, destinationLabel: "Шымкент", pricePerSeat: 2500
  });
  const entry = (await query(
    "SELECT * FROM taxi_stand_queue_entries WHERE id=$1", [joined.entryId]
  )).rows[0];
  assert.equal(entry.status, "BOARDING", "the only car in line is the one loading");
  assert.deepEqual(await seatCounts(entry.id), { total: 4, taken: 0 });

  // --- a hold is not a seat yet, but it is not free either -----------------
  const first = await reserveSeat({ client: anna, entryId: entry.id, seats: 2 });
  assert.equal(first.reservation.status, "PENDING");
  assert.deepEqual(await seatCounts(entry.id), { total: 4, taken: 0 },
    "a pending hold must not take the seat before the driver agrees");

  // ...but it must count against what anyone else can ask for, or two riders
  // each get promised the last seat.
  await assert.rejects(
    () => reserveSeat({ client: bolat, entryId: entry.id, seats: 3 }),
    (error) => error.code === "STAND_NOT_ENOUGH_SEATS",
    "pending seats are held against the free count"
  );
  const second = await reserveSeat({ client: bolat, entryId: entry.id, seats: 2 });
  assert.equal(second.reservation.status, "PENDING", "the rest of the car is still bookable");
  console.log("[reservations-db-check] a hold reserves without taking the seat");

  // --- one live booking per rider -----------------------------------------
  await assert.rejects(
    () => reserveSeat({ client: anna, entryId: entry.id, seats: 1 }),
    (error) => error.code === "STAND_RESERVATION_EXISTS",
    "a rider cannot hold two seats in two cars at once"
  );
  console.log("[reservations-db-check] one live booking per rider");

  // --- the driver agrees: now the seat is taken ---------------------------
  const confirmed = await respondToReservation({
    driver, reservationId: first.reservation.id, accept: true
  });
  assert.equal(confirmed.reservation.status, "CONFIRMED");
  assert.deepEqual(await seatCounts(entry.id), { total: 4, taken: 2 },
    "confirming moves the seats from held to taken");

  // --- the driver says no: nothing changes hands --------------------------
  const declined = await respondToReservation({
    driver, reservationId: second.reservation.id, accept: false
  });
  assert.equal(declined.reservation.status, "DECLINED");
  assert.deepEqual(await seatCounts(entry.id), { total: 4, taken: 2 },
    "a declined booking must not take a seat");
  // And the refused rider is free to ask again.
  const retry = await reserveSeat({ client: bolat, entryId: entry.id, seats: 2 });
  assert.equal(retry.reservation.status, "PENDING");
  console.log("[reservations-db-check] accepted seats are taken, declined ones are not");

  // --- the rider changes their mind: the seat comes back ------------------
  const cancelled = await cancelReservation({ rider: anna, reservationId: first.reservation.id });
  assert.equal(cancelled.reservation.status, "CANCELLED");
  assert.equal(cancelled.seatsReturned, 2, "a confirmed seat has to be given back");
  assert.deepEqual(await seatCounts(entry.id), { total: 4, taken: 0 },
    "cancelling a confirmed booking returns the seats to the car");
  // Cancelling twice must not hand the seats back a second time.
  const again = await cancelReservation({ rider: anna, reservationId: first.reservation.id });
  assert.equal(again.seatsReturned, 0, "a cancelled booking cannot return its seats twice");
  assert.deepEqual(await seatCounts(entry.id), { total: 4, taken: 0 });
  console.log("[reservations-db-check] cancelling returns the seat exactly once");

  // --- a booking nobody answered ------------------------------------------
  await query(
    "UPDATE taxi_stand_seat_reservations SET expires_at = NOW() - INTERVAL '1 minute' WHERE id=$1",
    [retry.reservation.id]
  );
  await assert.rejects(
    () => respondToReservation({ driver, reservationId: retry.reservation.id, accept: true }),
    (error) => error.code === "STAND_RESERVATION_EXPIRED",
    "a driver cannot accept a booking the rider has stopped waiting on"
  );
  // The rider does not have to wait for the sweeper to ask again.
  const afterTimeout = await reserveSeat({ client: bolat, entryId: entry.id, seats: 1 });
  assert.equal(afterTimeout.reservation.status, "PENDING");
  assert.equal(await reservationStatus(retry.reservation.id), "EXPIRED",
    "the timed-out hold is resolved, not left blocking the rider");
  console.log("[reservations-db-check] a timed-out hold expires and frees the rider");

  // --- the sweeper cleans up what nobody touched --------------------------
  await query(
    "UPDATE taxi_stand_seat_reservations SET expires_at = NOW() - INTERVAL '1 minute' WHERE id=$1",
    [afterTimeout.reservation.id]
  );
  const swept = await sweepStaleQueueEntries(query, { standId: stand.id });
  assert.ok(
    swept.expiredReservations.some((row) => row.id === afterTimeout.reservation.id),
    "the sweeper expires holds the rider walked away from"
  );
  assert.deepEqual(await seatCounts(entry.id), { total: 4, taken: 0 });
  console.log("[reservations-db-check] the sweeper expires abandoned holds");

  // --- a car that is not loading takes no bookings ------------------------
  const behind = await makeDriver(region.id, 2);
  const behindJoin = await joinQueue({
    driver: behind, standId: stand.id, ...at, destinationLabel: "Шымкент", pricePerSeat: 2500
  });
  const waiting = (await query(
    "SELECT * FROM taxi_stand_queue_entries WHERE id=$1", [behindJoin.entryId]
  )).rows[0];
  assert.equal(waiting.status, "WAITING", "only the front car loads");
  await assert.rejects(
    () => reserveSeat({ client: dina, entryId: waiting.id, seats: 1 }),
    (error) => error.code === "STAND_ENTRY_NOT_BOARDING",
    "a rider cannot book a seat in a car that is not taking passengers yet"
  );
  console.log("[reservations-db-check] only a loading car takes bookings");

  // --- the car leaves with a booking on it --------------------------------
  const onDeparting = await reserveSeat({ client: dina, entryId: entry.id, seats: 1 });
  await respondToReservation({ driver, reservationId: onDeparting.reservation.id, accept: true });
  assert.deepEqual(await seatCounts(entry.id), { total: 4, taken: 1 });
  await departQueue({ driver, entryId: entry.id });
  assert.equal(
    await reservationStatus(onDeparting.reservation.id),
    "BOARDED",
    "a confirmed booking on a car that drove off is a completed ride, not a live hold"
  );
  // A hold nobody had confirmed is the opposite: that rider is still standing
  // there, so it must be cancelled rather than quietly counted as boarded.
  const strandedRider = await reserveSeat({ client: bolat, entryId: waiting.id, seats: 1 });
  await departQueue({ driver: behind, entryId: waiting.id });
  assert.equal(
    await reservationStatus(strandedRider.reservation.id),
    "CANCELLED",
    "an unanswered hold on a departing car is cancelled, not marked boarded"
  );
  console.log("[reservations-db-check] departure boards confirmed seats and cancels unanswered ones");

  console.log("Stand reservation DB checks ok: holds, capacity, confirm, decline, cancel, expiry, sweep, departure");
}

try {
  await main();
} finally {
  await cleanup();
  await pool.end();
}
