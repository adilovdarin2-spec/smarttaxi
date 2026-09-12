import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CLIENT_CANCEL_REASONS,
  DRIVER_CANCEL_REASONS,
  riderMustGiveReason,
} from "../src/features/shared/cancellationReasons.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// The web apps carry the same stand line and the same cancellation questions
// as the phone. These check the parts that are easy to get quietly wrong: the
// reason codes the server will accept, Russian counts, and the promises the
// rider screen is allowed to make.

test("reason codes match the ones the API accepts", () => {
  // A code the server does not know is rejected as a validation error at the
  // worst possible moment — the driver is at the door and the rider waiting.
  assert.deepEqual(DRIVER_CANCEL_REASONS.map((row) => row.code), [
    "CLIENT_NO_SHOW",
    "CLIENT_ASKED",
    "WRONG_ADDRESS",
    "CAR_PROBLEM",
    "TOO_FAR",
    "OTHER",
  ]);
  assert.deepEqual(CLIENT_CANCEL_REASONS.map((row) => row.code), [
    "CHANGED_MIND",
    "DRIVER_ASKED_TO_CANCEL",
    "WAITED_TOO_LONG",
    "FOUND_ANOTHER_CAR",
    "WRONG_ADDRESS",
    "OTHER",
  ]);
  for (const row of [...DRIVER_CANCEL_REASONS, ...CLIENT_CANCEL_REASONS]) {
    assert.ok(row.label.length > 4, `reason ${row.code} has no readable label`);
  }
});

test("the rider is asked why only once a driver is on the way", () => {
  // Before anybody is assigned there is nobody to explain to, and asking would
  // put a dialog in front of the most ordinary action in the app.
  assert.equal(riderMustGiveReason(null), false);
  assert.equal(riderMustGiveReason({ id: "o1" }), false);
  assert.equal(riderMustGiveReason({ id: "o1", driver_id: null }), false);
  assert.equal(riderMustGiveReason({ id: "o1", driver_id: "d1" }), true);
});

test("the dialog cannot cancel a trip without an answer", () => {
  const source = read("../src/features/shared/CancellationReasonDialog.jsx");
  assert.match(source, /disabled=\{!selected \|\| busy\}/);
  // Backing out must keep the trip, so the dismiss path carries no payload.
  assert.match(source, /onClick=\{onCancel\}/);
  assert.match(source, /Не отменять/);
});

test("Russian counts read correctly at one, two and five", () => {
  const cases = [
    [1, "1 машина в очереди", "1 свободное место"],
    [2, "2 машины в очереди", "2 свободных места"],
    [5, "5 машин в очереди", "5 свободных мест"],
    [11, "11 машин в очереди", "11 свободных мест"],
    [21, "21 машина в очереди", "21 свободное место"],
    [0, "0 машин в очереди", "0 свободных мест"],
  ];
  return import("../src/features/shared/standFormat.mjs").then(({ carsInLine, freeSeatsLabel }) => {
    for (const [count, cars, seats] of cases) {
      assert.equal(carsInLine(count), cars);
      assert.equal(freeSeatsLabel(count), seats);
    }
  });
});

test("the driver panel measures the geofence the same way the server does", async () => {
  const { distanceMeters } = await import("../src/features/shared/standFormat.mjs");
  // One degree of latitude is ~111.3 km everywhere.
  assert.ok(Math.abs(distanceMeters({ lat: 40, lng: 68 }, { lat: 41, lng: 68 }) - 111195) < 500);
  // The stand and a point ~55 m up the same street.
  const near = distanceMeters({ lat: 40.663032, lng: 68.553626 }, { lat: 40.663526, lng: 68.553626 });
  assert.ok(near > 40 && near < 70, `expected ~55 m, got ${near}`);
  assert.equal(distanceMeters(null, { lat: 1, lng: 1 }), null);
});

test("the rider screen only offers seats in cars that are loading", () => {
  const source = read("../src/features/client/ClientStandsSection.jsx");
  assert.match(
    source,
    /entries \|\| \[\]\)\.filter\(entry => entry\.status === "BOARDING"\)/,
    "a car waiting its turn cannot promise a seat",
  );
  // A rider already holding a seat is not offered a second one anywhere.
  assert.match(source, /disabled=\{busy \|\| Boolean\(reservation\) \|\| entry\.freeSeats <= 0\}/);
});

test("both web apps send the stated reason with the cancellation", () => {
  const api = read("../src/lib/mvpApi.js");
  assert.match(api, /reasonCode: reason\.reasonCode/);
  assert.match(api, /cancelDriverOrder\(orderId, reason = null\)/);
  assert.match(api, /cancelPublicOrder\(orderId, riderPhone, reason = null\)/);

  const driver = read("../src/features/driver/DriverApp.jsx");
  assert.match(driver, /cancelDriverOrder\(order\.id, reason\)/);
  assert.match(driver, /isDriver\s+busy=/, "the driver dialog must be the driver variant");

  const client = read("../src/features/client/ClientApp.jsx");
  assert.match(client, /riderMustGiveReason\(order\)/);
  assert.match(client, /cancelOrderWithReason/);
});

test("the stand panels never show one audience the other's data", () => {
  const driver = read("../src/features/driver/DriverStandsPanel.jsx");
  const client = read("../src/features/client/ClientStandsSection.jsx");
  // The driver needs their passenger's number; the rider screen must never
  // render another rider's, and the API never sends it there.
  assert.match(driver, /reservation\.client\?\.phone/);
  assert.doesNotMatch(client, /\.client\?\.phone/);
  assert.doesNotMatch(client, /queueSeq/);
});
