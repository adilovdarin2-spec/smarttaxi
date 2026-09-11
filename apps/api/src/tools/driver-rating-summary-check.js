import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const driverRoutes = readFileSync(join(root, "modules", "drivers", "drivers.routes.js"), "utf8");

assert.match(
  driverRoutes,
  /router\.get\("\/me\/rating-summary", requireAuth, requireRole\("DRIVER"\)/,
  "rating summary endpoint must require an authenticated driver"
);

const handler = driverRoutes.match(/router\.get\("\/me\/rating-summary"[\s\S]*?\n\}\);/)?.[0] || "";
assert.notEqual(handler, "", "rating summary handler must exist");
assert.match(handler, /FROM driver_reviews\s+WHERE driver_id=\$1/, "star breakdown must be scoped to the requesting driver");
assert.match(handler, /FILTER \(WHERE rating=5\)/, "breakdown must count 5-star reviews");
assert.match(handler, /FILTER \(WHERE rating=1\)/, "breakdown must count 1-star reviews");
assert.match(handler, /unnest\(tags\)/, "top tags must be derived from the tags array column");
assert.match(handler, /LEFT JOIN orders o ON o\.id = r\.order_id/, "recent reviews should resolve an order short id for display");
assert.match(handler, /rating: Number\(driver\.rating \|\| 0\)/, "top-line rating must reuse drivers.rating, the same value kept in sync on every new review");

console.log("Driver rating summary checks ok");
