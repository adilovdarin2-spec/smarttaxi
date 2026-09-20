import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// One person cannot be both halves of a trip.
//
// The apps let a driver switch to "Режим пассажира" from the same login and
// order a taxi. Nothing stopped them then accepting it themselves — confirmed
// end to end against the local stack: the order came back from
// GET /driver/orders/incoming and POST /orders/:id/accept answered 200 with
// the driver assigned to their own ride.
//
// It is not a curiosity. A completed trip moves the service commission into
// that driver's debt, and a referred client's first completed order pays the
// 500 ₸ referral bonus to both sides (referrals.service.js). One person
// holding both accounts collects both halves of that bonus for a trip nobody
// took, and the only cost is a commission they set themselves by choosing the
// fare.

const { assertRiderIsNotThisDriver, isSamePerson } = await import(
  "../modules/orders/order-dispatch.service.js"
);

// Ids arrive as strings from one query and as uuid objects from another.
assert.equal(isSamePerson("u", "u"), true);
assert.equal(isSamePerson("u", { toString: () => "u" }), true);
assert.equal(isSamePerson("u", "v"), false);
// A missing id is not a match — two rows with no user are not one person.
assert.equal(isSamePerson(null, null), false);
assert.equal(isSamePerson(undefined, "u"), false);
assert.equal(isSamePerson("u", ""), false);

const DRIVER = { id: "driver-1", user_id: "user-same" };
const ORDER = { id: "order-1", client_id: "client-1" };

function riderUser(userId) {
  return async (sql, params) => {
    assert.match(sql, /SELECT user_id FROM clients WHERE id=\$1/);
    assert.deepEqual(params, ["client-1"]);
    return { rows: userId === null ? [] : [{ user_id: userId }] };
  };
}

await assert.rejects(
  () => assertRiderIsNotThisDriver(ORDER, DRIVER, riderUser("user-same")),
  (error) => error.code === "DRIVER_IS_THE_RIDER" && error.status === 403,
  "a driver must not take an order placed from their own account"
);

// Ids arrive from pg as strings in some paths and as uuid objects in others.
await assert.rejects(
  () => assertRiderIsNotThisDriver(ORDER, { ...DRIVER, user_id: { toString: () => "user-same" } },
    riderUser("user-same")),
  (error) => error.code === "DRIVER_IS_THE_RIDER"
);

// Everyone else is unaffected — this must not become a second block list.
await assertRiderIsNotThisDriver(ORDER, DRIVER, riderUser("someone-else"));
await assertRiderIsNotThisDriver(ORDER, DRIVER, riderUser(null));
await assertRiderIsNotThisDriver({ id: "o" }, DRIVER, async () => {
  throw new Error("an order with no rider row must not be looked up");
});
await assertRiderIsNotThisDriver(ORDER, { id: "d" }, async () => {
  throw new Error("a driver with no user must not be looked up");
});

// Every path that can put a driver on an order goes through the policy that
// calls this: the driver accepting, the driver's price offer being accepted,
// and the rider's offer being accepted by the driver.
const dispatch = read("../modules/orders/order-dispatch.service.js");
assert.equal(
  (dispatch.match(/await assertAssignmentPolicy\(driver, existing, executor\);/g) || []).length,
  3,
  "all three assignment paths must run the assignment policy"
);
assert.match(
  dispatch,
  /await assertRiderIsNotThisDriver\(order, driver, executor\);/,
  "and the policy must include this rule"
);

// ...and it is hidden as well as refused, the same way the block lists are:
// an order a driver can see is an order they will try to take.
assert.match(
  dispatch,
  /const notOwnOrder = `[\s\S]*?JOIN drivers rd ON rd\.user_id = rc\.user_id[\s\S]*?`/,
  "the dispatch list must exclude the driver's own orders"
);
assert.equal(
  (dispatch.match(/\$\{notOwnOrder\}/g) || []).length,
  2,
  "both driver order queries must apply it"
);

// A recurring booking inserts its orders already assigned, so it never
// reaches assertAssignmentPolicy. Without the same rule at both ends of that
// feature, the hole dispatch refuses reopens on a timer, every weekday.
const recurringRoutes = read("../modules/recurring-bookings/recurring-bookings.routes.js");
const recurringScheduler = read("../modules/recurring-bookings/recurring-bookings.scheduler.js");
assert.match(
  recurringRoutes,
  /isSamePerson\(client\.user_id, driver\.user_id\)/,
  "a standing trip with yourself must be refused when it is set up"
);
assert.match(
  recurringRoutes,
  /"DRIVER_IS_THE_RIDER"/,
  "and refused with the same code dispatch uses"
);
assert.match(
  recurringScheduler,
  /isSamePerson\(client\.user_id, driver\.user_id\)/,
  "and a booking made before that rule must not keep firing"
);
assert.match(
  recurringScheduler,
  /UPDATE recurring_bookings SET status='CANCELLED'/,
  "it is closed rather than skipped — it can never become valid, and a daily skip notice would be both wrong and endless"
);
assert.ok(
  recurringScheduler.indexOf("isSamePerson(client.user_id, driver.user_id)") <
    recurringScheduler.indexOf("INSERT INTO orders("),
  "the check must run before the order is written"
);

console.log("Self-order checks ok: refused on every assignment path, hidden from dispatch, closed off in recurring bookings, nobody else affected");
