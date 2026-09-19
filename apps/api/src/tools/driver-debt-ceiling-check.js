import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// A driver who owes the service too much stops being given work. That is one
// money rule, and it used to be written as a bare 15000 in two places which
// both have to agree: the driver accepting an order in the app, and the owner
// assigning one to them by hand. Two copies of a limit are two limits — raise
// one and a driver is refused in the app while the owner can still hand them a
// trip, a disagreement nobody notices until a driver is on the phone about it.
const { DRIVER_DEBT_CEILING_KZT, DRIVER_DEBT_WARNING_KZT, isOverDebtCeiling } =
  await import("../modules/drivers/driver-debt.js");

assert.equal(isOverDebtCeiling(DRIVER_DEBT_CEILING_KZT), false, "owing exactly the limit is still allowed");
assert.equal(isOverDebtCeiling(DRIVER_DEBT_CEILING_KZT + 1), true);
assert.equal(isOverDebtCeiling("0"), false, "debt arrives from pg as a string");
assert.equal(isOverDebtCeiling(`${DRIVER_DEBT_CEILING_KZT + 1}`), true);
assert.equal(isOverDebtCeiling(null), false, "a driver with no debt row owes nothing");

// The warning has to come before the cut-off, or the dashboard is telling the
// owner about drivers who have already been stopped.
assert.ok(
  DRIVER_DEBT_WARNING_KZT < DRIVER_DEBT_CEILING_KZT,
  "the early warning must be below the ceiling it warns about"
);

// Neither enforcement site may go back to stating the number itself.
for (const path of [
  "../modules/orders/order-dispatch.service.js",
  "../modules/orders/orders.routes.js",
  "../modules/admin/admin.routes.js"
]) {
  const source = read(path);
  assert.ok(
    source.includes('from "../drivers/driver-debt.js"'),
    `${path} must take the debt rule from one place`
  );
  assert.doesNotMatch(
    source,
    /debt[^\n]*>\s*\d{4,}/,
    `${path} must not restate the debt limit as a literal`
  );
}

// Both paths that can put a driver on an order enforce it.
const dispatch = read("../modules/orders/order-dispatch.service.js");
const routes = read("../modules/orders/orders.routes.js");
for (const [name, source] of [["driver accepting", dispatch], ["owner assigning", routes]]) {
  assert.match(
    source,
    /isOverDebtCeiling\(driver\.debt\)\) throw new AppError\("Debt limit exceeded", 403, "DRIVER_DEBT_LIMIT"\)/,
    `${name} an order must refuse a driver over the ceiling`
  );
}

console.log("Driver debt ceiling checks ok: one limit, both assignment paths, warning below it");
