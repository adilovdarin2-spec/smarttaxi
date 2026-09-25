import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { driverDailyStats, DRIVER_COMPLETED_STATUSES } from "../modules/drivers/driver-daily-stats.service.js";

assert.deepEqual(DRIVER_COMPLETED_STATUSES, ["TRIP_COMPLETED", "PAYMENT_PENDING", "PAID", "RATED", "COMPLETED"]);
const fixtures = [
  {driver:"one", status:"PAID", price:700, commission:105},
  {driver:"one", status:"RATED", price:700, commission:105},
  {driver:"one", status:"COMPLETED", price:800, commission:120},
  {driver:"one", status:"CANCELLED_BY_CLIENT", price:900, commission:135},
  {driver:"two", status:"PAID", price:5000, commission:750}
];
const executor = (sql, params) => {
  assert.match(sql, /WHERE driver_id=\$1 AND created_at >= date_trunc\('day', NOW\(\)\)/);
  assert.equal((sql.match(/status = ANY\(\$2::text\[\]\)/g) || []).length, 3);
  const rows = fixtures.filter(row => row.driver === params[0]);
  const completed = rows.filter(row => params[1].includes(row.status));
  return {rows:[{orders_total:rows.length,completed_orders:completed.length,
    revenue_total:completed.reduce((sum,row)=>sum+row.price,0),
    commission_total:completed.reduce((sum,row)=>sum+row.commission,0)}]};
};
const expected = {orders_total:4,completed_orders:3,revenue_total:2200,commission_total:330};
assert.deepEqual(await driverDailyStats("one", executor), expected);
fixtures[0].status = "RATED";
assert.deepEqual(await driverDailyStats("one", {query:executor}), expected, "Adding a review cannot shrink settled earnings");
assert.deepEqual(await driverDailyStats("missing", executor), {orders_total:0,completed_orders:0,revenue_total:0,commission_total:0});
for (const [file,path] of [["drivers.routes.js","/me/stats"],["driver-core.routes.js","/earnings/today"]]) {
  const source = readFileSync(new URL(`../modules/drivers/${file}`,import.meta.url),"utf8");
  const handler = source.slice(source.indexOf(`router.get("${path}"`)).split("\n});")[0];
  assert.match(handler,/requireAuth, requireRole\("DRIVER"\)/);
  assert.match(handler,/await driverDailyStats\(driver.id, query\)/, "Both clients must share the same aggregation");
}
// A driver's trip count and their earnings must agree about what "finished"
// means. The profile used to read a trips_count column that does not exist,
// so `|| 0` reported zero trips for every driver forever.
const core = readFileSync(new URL("../modules/drivers/driver-core.routes.js", import.meta.url), "utf8");
assert.match(core, /WHERE driver_id=\$1 AND status = ANY\(\$2::text\[\]\)/, "trips must be counted from orders");
assert.match(core, /DRIVER_COMPLETED_STATUSES\]\)\)\.rows\[0\]/, "the trip count must reuse the earnings status list, not a second copy");
assert.match(
  core,
  /tripsCount: driver\.trips_count == null \? null : Number\(driver\.trips_count\)/,
  "a profile that did not count trips must say null, never a false zero"
);
assert.doesNotMatch(core, /trips_count \|\| 0/, "the false-zero fallback must not come back");

console.log("Driver daily stats checks ok: paid/rated parity, legacy, cancellation, scope and endpoint wiring");
