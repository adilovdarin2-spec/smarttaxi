import assert from "node:assert/strict";

import { query } from "../db/pool.js";

const API_URL = (process.env.API_URL || "http://127.0.0.1:4000").replace(/\/$/, "");
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(API_URL).hostname),
  "regional reverse-address smoke is local-only"
);

const { rows } = await query(`
  WITH ranked AS (
    SELECT
      r.id AS region_id,
      r.name AS region_name,
      a.label,
      a.kind,
      a.lat,
      a.lng,
      row_number() OVER (
        PARTITION BY r.id
        ORDER BY
          CASE a.kind WHEN 'housenumber' THEN 0 WHEN 'poi' THEN 1 ELSE 2 END,
          md5(a.id::text)
      ) AS rank
    FROM regions r
    JOIN addresses a ON a.region_id = r.id
    WHERE r.is_active = true
      AND a.kind IN ('housenumber', 'poi')
      AND a.lat IS NOT NULL
      AND a.lng IS NOT NULL
  )
  SELECT region_name, label, kind, lat, lng
  FROM ranked
  WHERE rank = 1
  ORDER BY region_name
`);

assert.equal(rows.length, 13, "every active region must expose a real house or POI sample");

for (const row of rows) {
  const url = new URL("/api/routes/addresses/reverse", API_URL);
  url.searchParams.set("lat", String(row.lat));
  url.searchParams.set("lng", String(row.lng));
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.ok, true, `${row.region_name}: reverse failed (${response.status})`);
  const address = payload.address;
  assert(address, `${row.region_name}: reverse response has no address`);
  assert.equal(address.fallback, false, `${row.region_name}: exact catalogue point became a fallback`);
  assert.equal(address.source, "gazetteer_reverse", `${row.region_name}: exact catalogue point lost local authority`);
  assert.equal(address.label, row.label, `${row.region_name}: exact catalogue point changed its name`);
  assert.equal(address.kind, row.kind, `${row.region_name}: exact catalogue point changed its kind`);
  assert.equal(address.distanceMeters, 0, `${row.region_name}: exact catalogue point is not exact`);
}

const houses = rows.filter((row) => row.kind === "housenumber").length;
const pois = rows.filter((row) => row.kind === "poi").length;
console.log(`Regional reverse-address smoke ok: ${rows.length} regions (${houses} houses, ${pois} POIs)`);
