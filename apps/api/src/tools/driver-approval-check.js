import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertDriverCanGoOnline,
  selectDriverRegion,
  setDriverRegionApproval
} from "../modules/driver-region-approvals/driver-region-approvals.service.js";
import { REQUIRED_DOCUMENT_TYPES } from "../modules/driver-documents/driver-documents.service.js";

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
    approvals: [],
    // driver-1 has every required document APPROVED by default, so the
    // pre-existing region-approval assertions below still exercise "an
    // otherwise-eligible driver" — the new DRIVER_DOCUMENTS_NOT_APPROVED
    // coverage further down starts from a driver with none.
    driverDocuments: REQUIRED_DOCUMENT_TYPES.map((type, index) => ({
      id: `doc-${index}`,
      driver_id: "driver-1",
      type,
      status: "APPROVED",
      created_at: "2026-01-01T00:00:00.000Z"
    }))
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
      if (/SELECT DISTINCT ON \(type\) type, status\s+FROM driver_documents/i.test(sql)) {
        const [driverId] = params;
        const latestByType = new Map();
        for (const doc of state.driverDocuments.filter(row => row.driver_id === driverId)) {
          const current = latestByType.get(doc.type);
          if (!current || doc.created_at > current.created_at) latestByType.set(doc.type, doc);
        }
        return { rows: [...latestByType.values()] };
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

// --- CRITICAL: a driver without approved required documents cannot go
// online even if fully region-approved (was previously not checked at all —
// only is_blocked gated ONLINE status).
{
  const noDocsExecutor = createExecutor();
  noDocsExecutor.state.driverDocuments = [];
  await setDriverRegionApproval({
    driverId: "driver-1",
    regionId: "region-active",
    status: "APPROVED",
    adminUserId: "admin-1"
  }, noDocsExecutor);
  await assert.rejects(
    () => assertDriverCanGoOnline({ ...driver, current_region_id: "region-active" }, noDocsExecutor),
    { code: "DRIVER_DOCUMENTS_NOT_APPROVED" },
    "region-approved driver without approved required documents still cannot go online"
  );

  const rejectedDocsExecutor = createExecutor();
  rejectedDocsExecutor.state.driverDocuments = REQUIRED_DOCUMENT_TYPES.map((type, index) => ({
    id: `rejected-doc-${index}`,
    driver_id: "driver-1",
    type,
    status: type === "VEHICLE_REGISTRATION" ? "REJECTED" : "APPROVED",
    created_at: "2026-01-01T00:00:00.000Z"
  }));
  await setDriverRegionApproval({
    driverId: "driver-1",
    regionId: "region-active",
    status: "APPROVED",
    adminUserId: "admin-1"
  }, rejectedDocsExecutor);
  await assert.rejects(
    () => assertDriverCanGoOnline({ ...driver, current_region_id: "region-active" }, rejectedDocsExecutor),
    { code: "DRIVER_DOCUMENTS_NOT_APPROVED" },
    "one rejected required document is enough to block going online, even if the others are approved"
  );
}

console.log("Driver region approval checks ok");
