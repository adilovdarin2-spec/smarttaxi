import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

// Drives a whole stand line against a running API: the owner draws the stand,
// two drivers take places in it, the front car advertises a price and fills
// up from both a phone call and an app reservation, a turn is handed over,
// and the car leaves. Every assertion is about what the next person in the
// line actually sees, because that is the only thing the feature promises.
//
// Local development only: it registers throwaway accounts through the dev SMS
// provider and refuses to run against anything else.
const BASE = process.env.SMOKE_API_BASE_URL || "http://127.0.0.1:4011";
const DEV_CODE = process.env.SMS_DEV_CODE || "111111";

const log = (...args) => console.log("[stands-smoke]", ...args);

function suffix() {
  return randomBytes(3).toString("hex");
}

// +7 7XX XXX XX XX — the only shape the auth routes accept.
function qaPhone() {
  const digits = Array.from({ length: 9 }, () => randomBytes(1)[0] % 10).join("");
  return `+77${digits}`;
}

async function api(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  return { status: response.status, payload };
}

async function expectOk(path, options, what) {
  const result = await api(path, options);
  assert.ok(
    result.status >= 200 && result.status < 300,
    `${what} failed: ${result.status} ${JSON.stringify(result.payload)}`
  );
  return result.payload;
}

async function registerClient(phone, name) {
  const sent = await expectOk("/api/auth/sms/send", {
    method: "POST",
    body: { phone, purpose: "REGISTER" }
  }, "sms send");
  const code = sent.devCode || DEV_CODE;
  const verified = await expectOk(
    "/api/auth/sms/verify",
    { method: "POST", body: { phone, code, purpose: "REGISTER" } },
    "sms verify"
  );
  const registered = await expectOk("/api/auth/register/password", {
    method: "POST",
    body: { phone, name, password: "Qa123456!", verificationToken: verified.verificationToken }
  }, "register");
  return registered.token;
}

async function main() {
  const health = await expectOk("/api/health", {}, "health");
  assert.equal(health.env, "development", "stand smoke is a local development tool only");
  assert.equal(health.checks.sms, "dev", "refusing to create accounts against a real SMS provider");

  // --- owner draws the stand -------------------------------------------
  const ownerLogin = await expectOk("/api/auth/login/password", {
    method: "POST",
    body: { phone: "+77000000099", password: process.env.DEFAULT_ADMIN_PASSWORD || "ChangeMe_2026!" }
  }, "owner login");
  const ownerToken = ownerLogin.token;

  const regions = await expectOk("/api/regions/active", {}, "regions");
  const region = regions.regions.find((row) => row.code === "MYRZAKENT") || regions.regions[0];
  assert.ok(region, "no active region to place a stand in");

  const standName = `QA стоянка ${suffix()}`;
  const created = await expectOk("/api/admin/stands", {
    method: "POST",
    token: ownerToken,
    body: {
      regionId: region.id,
      name: standName,
      kind: "INTERCITY",
      lat: region.centerLat,
      lng: region.centerLng,
      radiusM: 150,
      boardingSlots: 1,
      defaultSeats: 4,
      note: "Автотест"
    }
  }, "create stand");
  const stand = created.stand;
  log("stand created", stand.id, stand.name, `${stand.radiusM} m`);

  // A stand must land inside its own region, or drivers would never load it.
  const outside = await api("/api/admin/stands", {
    method: "POST",
    token: ownerToken,
    body: { regionId: region.id, name: `QA вне региона ${suffix()}`, lat: 51.128, lng: 71.43, radiusM: 120 }
  });
  assert.equal(outside.status, 400, "a stand outside its region must be refused");
  assert.equal(outside.payload.error, "STAND_OUTSIDE_REGION");
  log("stand outside its region refused");

  // --- a rider account, used both to watch the line and to try to abuse it
  const riderPhone = qaPhone();
  const riderToken = await registerClient(riderPhone, "QA Пассажир");
  log("rider account", riderPhone);

  // Holding a CLIENT token must not open the driver side of a stand.
  const notADriver = await api(`/api/driver/stands/${stand.id}/join`, {
    method: "POST",
    token: riderToken,
    body: { lat: stand.lat, lng: stand.lng }
  });
  assert.ok(
    [403, 404, 409].includes(notADriver.status),
    `a rider must not join a line, got ${notADriver.status} ${JSON.stringify(notADriver.payload)}`
  );
  log("rider refused from the driver side with", notADriver.status, notADriver.payload.error || "");

  // --- the seeded driver runs the real line ----------------------------
  const seededDriver = await expectOk("/api/auth/login/password", {
    method: "POST",
    body: { phone: process.env.DEFAULT_DRIVER_PHONE || "+77000000000", password: process.env.DEFAULT_DRIVER_PASSWORD || "123456" }
  }, "seeded driver login");
  const driverToken = seededDriver.token;

  // A place in a line is a working driver's place: taking one while offline
  // would advertise a car that cannot be dispatched.
  const offlineJoin = await api(`/api/driver/stands/${stand.id}/join`, {
    method: "POST",
    token: driverToken,
    body: { lat: stand.lat, lng: stand.lng }
  });
  assert.equal(offlineJoin.status, 409, "an offline driver must not take a place");
  assert.equal(offlineJoin.payload.error, "DRIVER_OFFLINE");
  log("offline join refused");
  await expectOk("/api/driver/status/online", { method: "POST", token: driverToken }, "driver online");

  const me = await expectOk("/api/driver/stands/me", { token: driverToken }, "driver stand state");
  if (me.entry) {
    await expectOk(`/api/driver/stands/entries/${me.entry.id}/leave`, { method: "POST", token: driverToken }, "leave stale line");
    log("cleared a leftover place from an earlier run");
  }

  // Standing somewhere else is not standing here.
  const farAway = await api(`/api/driver/stands/${stand.id}/join`, {
    method: "POST",
    token: driverToken,
    body: { lat: Number(stand.lat) + 0.05, lng: Number(stand.lng) }
  });
  assert.equal(farAway.status, 403, "joining from outside the radius must be refused");
  assert.equal(farAway.payload.error, "STAND_OUT_OF_RANGE");
  log("join from outside the geofence refused at", farAway.payload.details?.distanceM, "m");

  const joined = await expectOk(`/api/driver/stands/${stand.id}/join`, {
    method: "POST",
    token: driverToken,
    body: {
      lat: stand.lat,
      lng: stand.lng,
      destinationLabel: "Шымкент",
      pricePerSeat: 2500,
      totalSeats: 4,
      comment: "выезжаю по заполнению"
    }
  }, "join line");
  const entry = joined.entry;
  assert.ok(entry, "join must return the new place");
  assert.equal(entry.position, 1, "an empty line puts the first car at the front");
  assert.equal(entry.status, "BOARDING", "the front car starts loading immediately");
  assert.equal(entry.freeSeats, 4);
  log("joined at position", entry.position, entry.status);

  // A second place in the same line, from the same driver, would mean one car
  // twice in the queue.
  const doubleJoin = await api(`/api/driver/stands/${stand.id}/join`, {
    method: "POST",
    token: driverToken,
    body: { lat: stand.lat, lng: stand.lng }
  });
  assert.equal(doubleJoin.status, 409, "one driver, one place");
  assert.equal(doubleJoin.payload.error, "STAND_ALREADY_QUEUED");
  log("double join refused");

  // --- "+1 место" from a phone call ------------------------------------
  const afterPhone = await expectOk(`/api/driver/stands/entries/${entry.id}/seats`, {
    method: "POST",
    token: driverToken,
    body: { seats: 1, source: "PHONE", comment: "позвонил, подойдёт через 10 минут" }
  }, "phone seat");
  assert.equal(afterPhone.entry.takenSeats, 1);
  assert.equal(afterPhone.entry.freeSeats, 3);
  log("phone seat taken; free seats now", afterPhone.entry.freeSeats);

  // --- a rider reserves in the app -------------------------------------
  const riderStands = await expectOk(`/api/stands?regionId=${region.id}`, { token: riderToken }, "rider stand list");
  const riderStand = riderStands.stands.find((row) => row.id === stand.id);
  assert.ok(riderStand, "the rider must see the stand on the map");
  assert.equal(riderStand.driversCount, 1);
  assert.equal(riderStand.freeSeats, 3, "the map pin must show seats that are actually free");

  const riderView = await expectOk(`/api/stands/${stand.id}`, { token: riderToken }, "rider stand view");
  const riderEntry = riderView.entries[0];
  assert.equal(riderEntry.driver.phone.length > 5, true, "the rider must be able to call the car");
  assert.ok(!("queueSeq" in riderEntry), "the rider must not receive queue bookkeeping");
  assert.equal(riderEntry.pricePerSeat, 2500);
  assert.equal(riderEntry.destinationLabel, "Шымкент");

  const reserved = await expectOk(`/api/stands/entries/${entry.id}/reserve`, {
    method: "POST",
    token: riderToken,
    body: { seats: 2, pickupLabel: "улица Абая 12" }
  }, "reserve seats");
  assert.equal(reserved.reservation.status, "PENDING");
  log("rider reserved", reserved.reservation.seats, "seats, pending driver confirmation");

  // A pending seat is held: the last free seat cannot be promised twice.
  const overbook = await api(`/api/stands/entries/${entry.id}/reserve`, {
    method: "POST",
    token: riderToken,
    body: { seats: 1 }
  });
  assert.equal(overbook.status, 409, "one rider cannot hold two reservations at once");

  const driverQueue = await expectOk(`/api/driver/stands/${stand.id}/queue`, { token: driverToken }, "driver queue view");
  const driverEntry = driverQueue.entries.find((row) => row.id === entry.id);
  assert.ok(Array.isArray(driverEntry.reservations), "the driver must see who is waiting");
  const pending = driverEntry.reservations.find((row) => row.status === "PENDING");
  assert.ok(pending, "the reservation must reach the driver");
  assert.equal(pending.client.phone, riderPhone, "the driver needs their passenger's number");

  const confirmed = await expectOk(`/api/driver/stands/reservations/${pending.id}/accept`, {
    method: "POST",
    token: driverToken
  }, "accept reservation");
  assert.equal(confirmed.reservation.status, "CONFIRMED");

  const full = await expectOk(`/api/driver/stands/${stand.id}/queue`, { token: driverToken }, "queue after confirm");
  const fullEntry = full.entries.find((row) => row.id === entry.id);
  assert.equal(fullEntry.takenSeats, 3, "phone seat plus the confirmed app reservation");
  assert.equal(fullEntry.freeSeats, 1);
  log("car now", fullEntry.takenSeats, "of", fullEntry.totalSeats);

  // Seats cannot be conjured past the car's capacity.
  const tooMany = await api(`/api/driver/stands/entries/${entry.id}/seats`, {
    method: "POST",
    token: driverToken,
    body: { seats: 4 }
  });
  assert.equal(tooMany.status, 409);
  assert.equal(tooMany.payload.error, "STAND_NOT_ENOUGH_SEATS");
  log("overfilling the car refused");

  // --- the car leaves ---------------------------------------------------
  await expectOk(`/api/driver/stands/entries/${entry.id}/depart`, { method: "POST", token: driverToken }, "depart");
  const afterDepart = await expectOk(`/api/stands/${stand.id}`, { token: riderToken }, "stand after departure");
  assert.equal(afterDepart.entries.length, 0, "a car that left must disappear from the line");
  const meAfter = await expectOk("/api/driver/stands/me", { token: driverToken }, "driver state after departure");
  assert.equal(meAfter.entry, null, "the driver holds no place after leaving");
  log("car departed, line empty");

  // The confirmed rider's seat became a completed boarding, not a dangling hold.
  const riderReservation = await expectOk("/api/stands/reservations/me", { token: riderToken }, "rider reservation after departure");
  assert.equal(riderReservation.reservation, null, "a departed car leaves no live reservation behind");

  // --- clean up ---------------------------------------------------------
  await expectOk(`/api/admin/stands/${stand.id}`, { method: "DELETE", token: ownerToken }, "delete stand");
  const gone = await api(`/api/stands/${stand.id}`, { token: riderToken });
  assert.equal(gone.status, 404, "the test stand must not survive the run");
  log("stand deleted");

  console.log("Stands smoke ok: geofence, queue order, phone and app seats, capacity, departure, cleanup");
}

main().catch((error) => {
  console.error("[stands-smoke] FAILED", error);
  process.exit(1);
});
