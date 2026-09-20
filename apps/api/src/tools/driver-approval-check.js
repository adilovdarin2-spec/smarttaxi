import assert from "node:assert/strict";
import './driver-onboarding-check.js';
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertDriverCanGoOnline,
  selectDriverRegion,
  setDriverRegionApproval
} from "../modules/driver-region-approvals/driver-region-approvals.service.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const schema = readFileSync(join(root, "db", "schema.sql"), "utf8");
const migrations = readFileSync(join(root, "db", "migrations.js"), "utf8");
const adminRoutes = readFileSync(join(root, "modules", "admin", "admin.routes.js"), "utf8");
const driverRoutes = readFileSync(join(root, "modules", "drivers", "drivers.routes.js"), "utf8");

assert.match(schema, /current_region_id UUID REFERENCES regions\(id\) ON DELETE SET NULL/i, "drivers must store selected region");
assert.match(schema, /CREATE TABLE IF NOT EXISTS driver_region_approvals/i, "schema must create driver approvals table");
assert.match(schema, /status TEXT NOT NULL CHECK \(status IN \('APPROVED','BLOCKED'\)\)/i, "approval status must be APPROVED or BLOCKED only");
const approvalTable = schema.match(/CREATE TABLE IF NOT EXISTS driver_region_approvals \([\s\S]*?\n\);/i)?.[0] || "";
assert.doesNotMatch(approvalTable, /PENDING/i, "approval status must not add PENDING");
assert.match(schema, /UNIQUE\(driver_id, region_id\)/i, "driver region approval must be unique");
assert.match(migrations, /ADD COLUMN IF NOT EXISTS current_region_id/i, "migration must add selected region column");
assert.match(migrations, /CREATE TABLE IF NOT EXISTS driver_region_approvals/i, "migration must create driver approvals table");

assert.match(adminRoutes, /router\.get\("\/drivers\/:id\/regions", requireAuth, requireRole\("OWNER"\)/, "admin list endpoint must be owner/admin only");
assert.match(adminRoutes, /router\.patch\("\/drivers\/:id\/regions", requireAuth, requireRole\("OWNER"\)/, "admin approval endpoint must be owner/admin only");
assert.match(driverRoutes, /router\.get\("\/me\/regions", requireAuth, requireRole\("DRIVER"\)/, "driver regions endpoint must require driver");
assert.match(driverRoutes, /router\.patch\("\/me\/region", requireAuth, requireRole\("DRIVER"\)/, "driver region selection endpoint must require driver");
assert.match(driverRoutes, /router\.patch\("\/me\/status", requireAuth, requireRole\("DRIVER"\)/, "passenger cannot use driver status endpoint");
assert.match(driverRoutes, /if \(body\.status === "FREE"\)/, "online transition must have a FREE-only approval guard");

// A driver whose region gets approved/blocked must actually be told --
// previously this endpoint silently updated the row with no notifyUser
// call at all, unlike the adjacent document-review endpoint in the same
// file, so a driver sat on the "under review" screen indefinitely unless
// they happened to force-refresh.
assert.match(adminRoutes, /type: "DRIVER_REGION_STATUS"/, "driver region approval/block must notify the driver via notifyUser");

let activeOrderInRegion = null;

function createExecutor() {
  const state = {
    drivers: [
      { id: "driver-1", user_id: "user-driver", is_blocked: false, current_region_id: null, status: "OFFLINE" },
      { id: "driver-blocked", user_id: "user-blocked", is_blocked: true, current_region_id: "region-active", status: "OFFLINE" }
    ],
    regions: [
      { id: "region-active", code: "ACTIVE", name: "Active", is_active: true },
      { id: "region-other", code: "OTHER", name: "Other", is_active: true },
      { id: "region-inactive", code: "INACTIVE", name: "Inactive", is_active: false }
    ],
    approvals: []
  };

  return {
    state,
    async query(sql, params = []) {
      if (/SELECT \* FROM drivers WHERE id=\$1 FOR UPDATE/i.test(sql)) {
        return { rows: state.drivers.filter(driver => driver.id === params[0]) };
      }
      if (/SELECT \* FROM regions WHERE id=\$1/i.test(sql)) {
        return { rows: state.regions.filter(region => region.id === params[0]) };
      }
      if (/FROM driver_region_approvals\s+WHERE driver_id=\$1 AND region_id=\$2/i.test(sql)) {
        return { rows: state.approvals.filter(approval => approval.driver_id === params[0] && approval.region_id === params[1]) };
      }
      if (/INSERT INTO driver_region_approvals/i.test(sql)) {
        const [driverId, regionId, status, adminUserId, reason] = params;
        let row = state.approvals.find(approval => approval.driver_id === driverId && approval.region_id === regionId);
        if (!row) {
          row = { id: `approval-${state.approvals.length + 1}`, driver_id: driverId, region_id: regionId };
          state.approvals.push(row);
        }
        row.status = status;
        row.approved_by_user_id = status === "APPROVED" ? adminUserId : row.approved_by_user_id || null;
        row.blocked_by_user_id = status === "BLOCKED" ? adminUserId : null;
        row.block_reason = status === "BLOCKED" ? reason : null;
        row.approved_at = status === "APPROVED" ? "2026-01-01T00:00:00.000Z" : row.approved_at || null;
        row.blocked_at = status === "BLOCKED" ? "2026-01-01T00:01:00.000Z" : null;
        row.updated_at = "2026-01-01T00:02:00.000Z";
        return { rows: [row] };
      }
      if (/UPDATE drivers\s+SET current_region_id=\$1/i.test(sql)) {
        const driver = state.drivers.find(row => row.id === params[1]);
        driver.current_region_id = params[0];
        driver.last_seen_at = "2026-01-01T00:03:00.000Z";
        return { rows: [driver] };
      }
      if (/UPDATE drivers\s+SET status='OFFLINE', current_region_id=NULL/i.test(sql)) {
        const driver = state.drivers.find(row => row.id === params[0]);
        driver.status = "OFFLINE";
        driver.current_region_id = null;
        driver.last_seen_at = "2026-01-01T00:04:00.000Z";
        return { rows: [driver] };
      }
      // Blocking a driver out of a region is refused while they are driving a
      // trip in it. These fixtures are about the approval itself; the guard
      // has its own case below.
      if (/FROM orders WHERE driver_id=\$1 AND region_id=\$2 AND status = ANY/i.test(sql)) {
        return { rows: activeOrderInRegion ? [activeOrderInRegion] : [] };
      }

      throw new Error(`Unexpected SQL in driver approval check: ${sql}`);
    }
  };
}

const executor = createExecutor();
const driver = executor.state.drivers[0];

let approved = await setDriverRegionApproval({
  driverId: driver.id,
  regionId: "region-active",
  status: "APPROVED",
  adminUserId: "admin-1"
}, executor);
assert.equal(approved.approval.status, "APPROVED", "admin can approve driver for region");

approved = await setDriverRegionApproval({
  driverId: driver.id,
  regionId: "region-active",
  status: "APPROVED",
  adminUserId: "admin-1"
}, executor);
assert.equal(executor.state.approvals.length, 1, "approving same region twice does not duplicate rows");

const selected = await selectDriverRegion(driver, "region-active", executor);
assert.equal(selected.driver.current_region_id, "region-active", "approved driver can select allowed active region");

await assert.doesNotReject(
  () => assertDriverCanGoOnline(selected.driver, executor),
  "approved driver can go online/FREE in allowed active region"
);

await assert.rejects(
  () => assertDriverCanGoOnline({ ...driver, current_region_id: "region-other" }, executor),
  { code: "DRIVER_REGION_NOT_APPROVED" },
  "approved driver cannot go online in non-approved region"
);

await setDriverRegionApproval({
  driverId: driver.id,
  regionId: "region-inactive",
  status: "APPROVED",
  adminUserId: "admin-1"
}, executor);
await assert.rejects(
  () => assertDriverCanGoOnline({ ...driver, current_region_id: "region-inactive" }, executor),
  { code: "REGION_INACTIVE" },
  "approved driver cannot go online in inactive region"
);

await assert.rejects(
  () => assertDriverCanGoOnline(executor.state.drivers[1], executor),
  { code: "DRIVER_BLOCKED" },
  "globally blocked driver cannot go online"
);

await assert.rejects(
  () => assertDriverCanGoOnline({ ...driver, current_region_id: "region-other" }, createExecutor()),
  { code: "DRIVER_REGION_NOT_APPROVED" },
  "unapproved driver cannot go online"
);

let blocked = await setDriverRegionApproval({
  driverId: driver.id,
  regionId: "region-active",
  status: "BLOCKED",
  adminUserId: "admin-1",
  reason: "manual block"
}, executor);
assert.equal(blocked.approval.status, "BLOCKED", "admin can block driver for region");
assert.equal(blocked.driver.current_region_id, null, "blocking current selected region clears current_region_id");
assert.equal(blocked.driver.status, "OFFLINE", "blocking current selected region forces driver offline");
await assert.rejects(
  () => assertDriverCanGoOnline({ ...blocked.driver, current_region_id: "region-active" }, executor),
  { code: "DRIVER_REGION_BLOCKED" },
  "driver with BLOCKED region approval cannot go online"
);

blocked = await setDriverRegionApproval({
  driverId: driver.id,
  regionId: "region-active",
  status: "BLOCKED",
  adminUserId: "admin-1",
  reason: "manual block"
}, executor);
assert.equal(executor.state.approvals.filter(row => row.driver_id === driver.id && row.region_id === "region-active").length, 1, "blocking same region twice does not duplicate rows");

// Two routes do the same whole-account block/unblock job -- the admin
// panel only ever calls PATCH /admin/drivers/:id/block, but
// PATCH /drivers/:id/block still exists (asserted by api-check.js) and
// must not be allowed to drift back to an unlocked read + no region-clear,
// which it had before this fix.
const adminBlockBody = adminRoutes.match(/router\.patch\("\/drivers\/:id\/block",[\s\S]*?\n}\);/)?.[0] || "";
const driverBlockBody = driverRoutes.match(/router\.patch\("\/:id\/block",[\s\S]*?\n}\);/)?.[0] || "";
for (const [label, body] of [["admin.routes.js", adminBlockBody], ["drivers.routes.js", driverBlockBody]]) {
  assert.match(body, /SELECT \* FROM drivers WHERE id=\$1 FOR UPDATE/, `${label}'s block endpoint must row-lock the driver to avoid racing a concurrent request`);
  assert.match(body, /current_region_id=CASE WHEN \$1=true THEN NULL ELSE current_region_id END/, `${label}'s block endpoint must clear current_region_id when blocking, matching every other place a driver gets blocked`);
}

// A driver carrying a rider cannot simply be switched off.
//
// Blocking sets status OFFLINE and clears current_region_id, and every driver
// action on an order checks both — so the trip becomes one nobody can move:
// the driver cannot complete it, and the operator cannot cancel it either,
// because CANCELLED_BY_OPERATOR is not reachable from TRIP_STARTED. The rider
// sits in the car with a frozen map, and afterwards keeps an order that still
// counts as their active one.
for (const [name, source] of [["admin", adminRoutes], ["drivers", driverRoutes]]) {
  assert.match(
    source,
    /if \(body\.isBlocked && !before\.is_blocked\) \{/,
    `${name} block must check for a trip in progress, and only when blocking`
  );
  assert.match(
    source,
    /"SELECT id, short_id, status FROM orders WHERE driver_id=\$1 AND status = ANY\(\$2::text\[\]\) LIMIT 1"/,
    `${name} block must look for an active order`
  );
  assert.match(
    source,
    /"DRIVER_HAS_ACTIVE_ORDER",\s*\{ orderId: active\.id, shortId: active\.short_id, orderStatus: active\.status \}/,
    `${name} block must name the trip so the owner can go and close it`
  );
  // Unblocking has no trip to protect, and must not be refused by this.
  const blockRoute = source.slice(source.indexOf('/block"'));
  assert.ok(
    blockRoute.indexOf("body.isBlocked && !before.is_blocked") <
      blockRoute.indexOf("UPDATE drivers"),
    `${name} block must refuse before it writes`
  );
}
// CANCELLED_BY_OPERATOR really is unreachable once the trip has started —
// that is the whole reason the block has to be refused rather than warned
// about. If this ever changes, the refusal can soften with it.
const dispatchSource = readFileSync(join(root, "modules", "orders", "order-dispatch.service.js"), "utf8");
const operatorRule = dispatchSource.match(/CANCELLED_BY_OPERATOR: \[([^\]]*)\]/);
assert.ok(operatorRule, "the operator cancellation rule must exist");
assert.ok(
  !operatorRule[1].includes("TRIP_STARTED"),
  "an operator who can cancel a started trip would make the block refusal unnecessary"
);

// Blocking a driver out of a region puts them OFFLINE with no region at all,
// and every action on the trip they are driving is then refused — including
// by the operator, who cannot cancel from TRIP_STARTED. Same freeze as
// blocking the driver outright.
{
  const executor = createExecutor();
  const midTrip = executor.state.drivers[0];
  activeOrderInRegion = { id: "order-1", short_id: "AB12CD34", status: "TRIP_STARTED" };
  await assert.rejects(
    () => setDriverRegionApproval(
      { driverId: midTrip.id, regionId: "region-active", status: "BLOCKED", adminUserId: "admin-1" },
      executor
    ),
    (error) => error.code === "DRIVER_HAS_ACTIVE_ORDER" && error.status === 409 &&
      error.details.shortId === "AB12CD34",
    "a driver mid-trip cannot be blocked out of the region they are driving in"
  );

  // Approving is never refused — there is no trip to protect.
  activeOrderInRegion = { id: "order-1", short_id: "AB12CD34", status: "TRIP_STARTED" };
  await setDriverRegionApproval(
    { driverId: midTrip.id, regionId: "region-active", status: "APPROVED", adminUserId: "admin-1" },
    executor
  );

  // And once the trip is over the block goes through.
  activeOrderInRegion = null;
  const afterTrip = await setDriverRegionApproval(
    { driverId: midTrip.id, regionId: "region-active", status: "BLOCKED", adminUserId: "admin-1" },
    executor
  );
  assert.equal(afterTrip.approval.status, "BLOCKED");
}

console.log("Driver region approval checks ok");
