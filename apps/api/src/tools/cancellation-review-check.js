import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REVIEW_THRESHOLD, scoreCancellation } from "../modules/orders/cancellation-review.service.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const codes = (result) => result.signals.map((signal) => signal.code);

// The case the whole feature exists for: driver accepts, drives to the rider,
// stands at the pickup point, cancels without saying why, on a cash trip.
const driverAtPickup = scoreCancellation({
  cancelledBy: "DRIVER",
  fromStatus: "DRIVER_ARRIVED",
  reasonCode: null,
  paymentMethod: "CASH",
  secondsSinceAccept: 480,
  secondsSinceArrival: 90,
  driverDistanceToPickupM: 20,
  waitingStarted: true,
  driverRepeatCount: 0,
  pairRepeatCount: 0
});
assert.ok(
  driverAtPickup.riskScore >= REVIEW_THRESHOLD,
  `a silent cancellation from the pickup point must reach review, got ${driverAtPickup.riskScore}`
);
assert.deepEqual(codes(driverAtPickup).sort(), [
  "CANCELLED_AFTER_ARRIVAL",
  "CAR_AT_PICKUP",
  "CASH_ORDER",
  "LONG_COMMITMENT",
  "NO_REASON_GIVEN",
  "WAITING_HAD_STARTED"
].sort());

// A rider who changes their mind before anybody is assigned is the ordinary
// case and must never land in the owner's queue.
const riderChangedMind = scoreCancellation({
  cancelledBy: "CLIENT",
  fromStatus: "SEARCHING_DRIVER",
  reasonCode: "CHANGED_MIND",
  paymentMethod: "CARD",
  secondsSinceAccept: null,
  secondsSinceArrival: null,
  driverDistanceToPickupM: null,
  waitingStarted: false,
  driverRepeatCount: 0,
  pairRepeatCount: 0
});
assert.equal(riderChangedMind.riskScore, 0);
assert.ok(riderChangedMind.riskScore < REVIEW_THRESHOLD, "an ordinary cancellation must stay out of review");

// A stated no-show lowers the score but does not erase a car that was
// demonstrably at the door with the waiting timer already running: the claim
// is evidence, not proof.
const claimedNoShow = scoreCancellation({
  cancelledBy: "DRIVER",
  fromStatus: "WAITING",
  reasonCode: "CLIENT_NO_SHOW",
  paymentMethod: "CASH",
  secondsSinceAccept: 600,
  secondsSinceArrival: 400,
  driverDistanceToPickupM: 15,
  waitingStarted: true,
  driverRepeatCount: 0,
  pairRepeatCount: 0
});
assert.ok(claimedNoShow.signals.some((signal) => signal.code === "CLAIMED_NO_SHOW" && signal.weight < 0));
assert.ok(
  claimedNoShow.riskScore < driverAtPickup.riskScore,
  "a stated reason must score lower than the same cancellation with no reason"
);

// The rider's side of the same scheme: "водитель попросил отменить".
const driverAskedToCancel = scoreCancellation({
  cancelledBy: "CLIENT",
  fromStatus: "DRIVER_ARRIVED",
  reasonCode: "DRIVER_ASKED_TO_CANCEL",
  paymentMethod: "CASH",
  secondsSinceAccept: 300,
  secondsSinceArrival: 60,
  driverDistanceToPickupM: 10,
  waitingStarted: false,
  driverRepeatCount: 0,
  pairRepeatCount: 0
});
assert.ok(
  driverAskedToCancel.riskScore >= REVIEW_THRESHOLD,
  `a rider cancelling at the driver's request must reach review, got ${driverAskedToCancel.riskScore}`
);

// The same two people cancelling on each other repeatedly is the pattern a
// single trip can never show.
const repeatPair = scoreCancellation({
  cancelledBy: "DRIVER",
  fromStatus: "DRIVER_ARRIVED",
  reasonCode: "CLIENT_NO_SHOW",
  paymentMethod: "CASH",
  secondsSinceAccept: 200,
  secondsSinceArrival: 30,
  driverDistanceToPickupM: 40,
  waitingStarted: false,
  driverRepeatCount: 4,
  pairRepeatCount: 2
});
assert.ok(repeatPair.signals.some((signal) => signal.code === "SAME_PAIR_REPEAT"));
assert.ok(repeatPair.signals.some((signal) => signal.code === "DRIVER_REPEAT"));
assert.ok(repeatPair.riskScore >= 60, `a repeating pair must score high, got ${repeatPair.riskScore}`);

// Scores stay inside the column's CHECK constraint whatever piles up.
const extreme = scoreCancellation({
  cancelledBy: "DRIVER",
  fromStatus: "WAITING",
  reasonCode: null,
  paymentMethod: "CASH",
  secondsSinceAccept: 9000,
  secondsSinceArrival: 9000,
  driverDistanceToPickupM: 0,
  waitingStarted: true,
  driverRepeatCount: 50,
  pairRepeatCount: 50
});
assert.ok(extreme.riskScore <= 100 && extreme.riskScore >= 0, "risk score must stay within 0..100");

// Every signal must carry the sentence the owner reads — a weight with no
// explanation is what turns a review queue into a black box.
for (const result of [driverAtPickup, claimedNoShow, repeatPair, driverAskedToCancel]) {
  for (const signal of result.signals) {
    assert.ok(typeof signal.label === "string" && signal.label.length > 5, `signal ${signal.code} has no readable label`);
    assert.equal(typeof signal.weight, "number");
  }
}

/* ------------------------------------------------------- wiring guards */

const migrations = read("../db/migrations.js");
[
  "CREATE TABLE IF NOT EXISTS order_cancellation_audits",
  "cancelled_by TEXT NOT NULL CHECK (cancelled_by IN ('DRIVER','CLIENT','OPERATOR','SYSTEM'))",
  "risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100)",
  "follow_up_status TEXT NOT NULL DEFAULT 'PENDING'",
  "idx_cancellation_audits_review",
  "last_cancel_reason_code"
].forEach((token) => assert.ok(migrations.includes(token), `cancellation audit migration missing ${token}`));

const orders = read("../modules/orders/orders.routes.js");
assert.ok(orders.includes('import { recordCancellationAudit } from "./cancellation-review.service.js"'));
// All three cancellation paths must file a review, or the one that does not
// becomes the way around the whole mechanism.
assert.equal(
  (orders.match(/await recordCancellationAudit\(/g) || []).length,
  3,
  "every cancellation path (rider, driver, operator/no-show) must record an audit"
);
assert.ok(orders.includes("DRIVER_CANCEL_REASONS"), "driver cancellation reasons must be defined");
assert.ok(orders.includes("DRIVER_ASKED_TO_CANCEL"), "the rider must be able to say the driver asked them to cancel");
assert.ok(
  orders.includes("last_cancel_reason_code=$3") && orders.includes("last_cancel_reason_code=$2"),
  "both driver and rider cancellations must persist the stated reason"
);

const reviewRoutes = read("../modules/orders/cancellation-review.routes.js");
assert.ok(reviewRoutes.includes('requireRole("OWNER", "FINANCE")'), "review queue must be owner/finance only");
assert.ok(
  !/UPDATE drivers SET (balance|debt)/.test(reviewRoutes),
  "review must not move money: the decision to fine stays a person's, on the finance screen"
);

const service = read("../modules/orders/cancellation-review.service.js");
assert.ok(
  !/UPDATE drivers SET (balance|debt)/.test(service),
  "scoring must never debit a driver automatically"
);

const server = read("../server.js");
assert.ok(server.includes('app.use("/api/admin/cancellation-reviews", cancellationReviewRoutes)'));
assert.ok(server.includes("startCancellationReviewScheduler()"), "follow-up observation scheduler must start");

console.log("Cancellation review checks ok: scoring, thresholds, signal labels, all three cancel paths, no automatic penalty");
