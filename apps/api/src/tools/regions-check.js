import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRegion,
  findActiveRegionForPoint,
  listActiveRegions,
  pointInPolygon,
  resolveActiveRegionForPoint,
  setRegionActive,
  updateRegion
} from "../modules/regions/regions.service.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const schema = readFileSync(join(root, "db", "schema.sql"), "utf8");
const migrations = readFileSync(join(root, "db", "migrations.js"), "utf8");
const server = readFileSync(join(root, "server.js"), "utf8");
const admin = readFileSync(join(root, "modules", "admin", "admin.routes.js"), "utf8");
const regionsRoutes = readFileSync(join(root, "modules", "regions", "regions.routes.js"), "utf8");

const atakentBoundary = [
  [69.45, 42.2],
  [69.76, 42.2],
  [69.76, 42.43],
  [69.45, 42.43],
  [69.45, 42.2]
];

assert.match(schema, /CREATE TABLE IF NOT EXISTS regions/i, "schema must create regions table");
assert.match(schema, /code TEXT UNIQUE NOT NULL/i, "regions must have unique code");
assert.match(schema, /boundary JSONB NOT NULL/i, "regions must store JSON boundary");
assert.match(schema, /is_active BOOLEAN NOT NULL DEFAULT true/i, "regions must have active flag");
assert.match(schema, /INSERT INTO regions\(code, name, boundary/i, "schema must seed a launch region");
assert.match(schema, /'ATAKENT'/, "schema must seed ATAKENT");

assert.match(migrations, /CREATE TABLE IF NOT EXISTS regions/i, "migrations must create regions table");
assert.match(migrations, /'ATAKENT'/, "migrations must seed ATAKENT");
assert.match(server, /regionsRoutes/, "server must import region routes");
assert.match(server, /app\.use\("\/api\/regions", regionsRoutes\)/, "server must mount /api/regions");
assert.match(regionsRoutes, /router\.get\("\/active"/, "public active regions endpoint must exist");

assert.match(admin, /router\.get\("\/regions"/, "admin region list endpoint must exist");
assert.match(admin, /router\.post\("\/regions"/, "admin region create endpoint must exist");
assert.match(admin, /router\.patch\("\/regions\/:id"/, "admin region update endpoint must exist");
assert.match(admin, /router\.delete\("\/regions\/:id"/, "admin region delete/deactivate endpoint must exist");

assert.equal(pointInPolygon({ lat: 42.3167, lng: 69.5958 }, atakentBoundary), true, "Atakent center must be inside polygon");
assert.equal(pointInPolygon({ lat: 43.25, lng: 76.95 }, atakentBoundary), false, "Almaty-like point must be outside Atakent polygon");

const activeRegion = {
  id: "active-region",
  code: "ATAKENT",
  name: "Atakent",
  boundary: atakentBoundary,
  is_active: true
};
const inactiveRegion = {
  id: "inactive-region",
  code: "OLD",
  name: "Inactive",
  boundary: [
    [10, 10],
    [20, 10],
    [20, 20],
    [10, 20],
    [10, 10]
  ],
  is_active: false
};

const mockExecutor = async (sql) => {
  assert.match(sql, /WHERE is_active=true/i, "active lookup must query only active regions");
  return { rows: [activeRegion] };
};

const found = await findActiveRegionForPoint({ lat: 42.3167, lng: 69.5958 }, mockExecutor);
assert.equal(found?.id, activeRegion.id, "inside point must resolve to active region");

const missing = await findActiveRegionForPoint({ lat: 15, lng: 15 }, mockExecutor);
assert.equal(missing, null, "point inside inactive-only area must not resolve when inactive regions are excluded");
assert.equal(pointInPolygon({ lat: 15, lng: 15 }, inactiveRegion.boundary), true, "inactive fixture polygon itself is valid");

await assert.rejects(
  () => resolveActiveRegionForPoint({ lat: 15, lng: 15 }, mockExecutor),
  { code: "REGION_INACTIVE" },
  "resolver must reject points outside active regions"
);

function createRegionStoreExecutor(initialRows = []) {
  const rows = initialRows.map((row) => ({ ...row }));
  let nextId = 1;

  return {
    rows,
    async query(sql, params = []) {
      if (/INSERT INTO regions/i.test(sql)) {
        const row = {
          id: `region-${nextId++}`,
          code: params[0],
          name: params[1],
          boundary: JSON.parse(params[2]),
          center_lat: params[3],
          center_lng: params[4],
          currency: params[5],
          is_active: params[6],
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z"
        };
        rows.push(row);
        return { rows: [row] };
      }

      if (/SELECT \* FROM regions WHERE id=\$1 FOR UPDATE/i.test(sql)) {
        return { rows: rows.filter((row) => row.id === params[0]) };
      }

      if (/UPDATE regions/i.test(sql)) {
        const id = params[params.length - 1];
        const row = rows.find((item) => item.id === id);
        assert.ok(row, "admin update/toggle must target an existing region");
        const setClause = sql.match(/SET\s+([\s\S]+?)\s+WHERE/i)[1];
        const assignments = setClause.split(",").map((item) => item.trim()).filter((item) => !item.startsWith("updated_at"));
        assignments.forEach((assignment, index) => {
          if (assignment.startsWith("code=")) row.code = params[index];
          if (assignment.startsWith("name=")) row.name = params[index];
          if (assignment.startsWith("boundary=")) row.boundary = JSON.parse(params[index]);
          if (assignment.startsWith("center_lat=")) row.center_lat = params[index];
          if (assignment.startsWith("center_lng=")) row.center_lng = params[index];
          if (assignment.startsWith("currency=")) row.currency = params[index];
          if (assignment.startsWith("is_active=")) row.is_active = params[index];
        });
        row.updated_at = "2026-01-01T00:01:00.000Z";
        return { rows: [row] };
      }

      if (/WHERE is_active=true/i.test(sql)) {
        return { rows: rows.filter((row) => row.is_active).sort((a, b) => a.name.localeCompare(b.name)) };
      }

      if (/SELECT \* FROM regions ORDER BY name ASC/i.test(sql)) {
        return { rows: [...rows].sort((a, b) => a.name.localeCompare(b.name)) };
      }

      throw new Error(`Unexpected SQL in region behavior test: ${sql}`);
    }
  };
}

const crudExecutor = createRegionStoreExecutor();
const created = await createRegion({
  code: "TEST",
  name: "Test Region",
  boundary: atakentBoundary,
  centerLat: 42.3167,
  centerLng: 69.5958,
  currency: "KZT",
  isActive: true
}, crudExecutor);
assert.equal(created.code, "TEST", "admin can create a region");

const nextBoundary = [
  [69.5, 42.25],
  [69.7, 42.25],
  [69.7, 42.4],
  [69.5, 42.4],
  [69.5, 42.25]
];
const renamed = await updateRegion(created.id, {
  name: "Updated Region",
  boundary: nextBoundary,
  currency: "USD"
}, crudExecutor);
assert.equal(renamed.region.name, "Updated Region", "admin can update region name");
assert.deepEqual(renamed.region.boundary, nextBoundary, "admin can update region boundary");
assert.equal(renamed.region.currency, "USD", "admin can update region currency");

const deactivated = await setRegionActive(created.id, false, crudExecutor);
assert.equal(deactivated.region.is_active, false, "admin can toggle region inactive");
const activeAfterDeactivate = await listActiveRegions(crudExecutor);
assert.equal(activeAfterDeactivate.some((region) => region.id === created.id), false, "inactive region is not returned by active endpoint service");

const reactivated = await setRegionActive(created.id, true, crudExecutor);
assert.equal(reactivated.region.is_active, true, "admin can toggle region active");
const activeAfterReactivate = await listActiveRegions(crudExecutor);
assert.equal(activeAfterReactivate.some((region) => region.id === created.id), true, "reactivated region is returned by active endpoint service");

console.log("Region foundation checks ok");
