import { AppError } from "../../common/errors.js";
import { getMissingRequiredDocumentTypes } from "../driver-documents/driver-documents.service.js";

async function defaultQuery(sql, params) {
  const db = await import("../../db/pool.js");
  return db.query(sql, params);
}

function run(executor, sql, params = []) {
  return executor.query ? executor.query(sql, params) : executor(sql, params);
}

export function publicDriverRegionApproval(row) {
  if (!row) return null;
  return {
    id: row.approval_id || row.id || null,
    driverId: row.driver_id || null,
    regionId: row.region_id,
    regionCode: row.region_code || row.code,
    regionName: row.region_name || row.name,
    centerLat: Number(row.center_lat ?? row.region_center_lat ?? 40.844435),
    centerLng: Number(row.center_lng ?? row.region_center_lng ?? 68.509021),
    regionIsActive: row.region_is_active ?? row.is_active,
    status: row.approval_status || row.status || "UNAPPROVED",
    blockReason: row.block_reason || "",
    approvedAt: row.approved_at || null,
    blockedAt: row.blocked_at || null,
    updatedAt: row.approval_updated_at || row.updated_at || null
  };
}

export async function listDriverRegionApprovals(driverId, executor = defaultQuery) {
  const result = await run(executor, `
    SELECT r.id region_id,
           r.code region_code,
           r.name region_name,
           r.center_lat,
           r.center_lng,
           r.is_active region_is_active,
           a.id approval_id,
           a.driver_id,
           a.status approval_status,
           a.block_reason,
           a.approved_at,
           a.blocked_at,
           a.updated_at approval_updated_at
    FROM regions r
    LEFT JOIN driver_region_approvals a ON a.region_id=r.id AND a.driver_id=$1
    ORDER BY r.name ASC
  `, [driverId]);
  return result.rows;
}

export async function getDriverForUser(userId, executor = defaultQuery) {
  const result = await run(executor, "SELECT * FROM drivers WHERE user_id=$1", [userId]);
  return result.rows[0] || null;
}

export async function getRegion(regionId, executor = defaultQuery) {
  const result = await run(executor, "SELECT * FROM regions WHERE id=$1", [regionId]);
  return result.rows[0] || null;
}

export async function getDriverRegionApproval(driverId, regionId, executor = defaultQuery) {
  const result = await run(executor, `
    SELECT *
    FROM driver_region_approvals
    WHERE driver_id=$1 AND region_id=$2
  `, [driverId, regionId]);
  return result.rows[0] || null;
}

// A driver whose required documents (license, ID, vehicle registration)
// aren't all APPROVED must not be able to go online or receive dispatch —
// no separate "verified" flag on the driver row, this is checked live
// against driver_documents every time so a later-rejected renewal document
// locks the driver back out automatically. See
// docs/status/server-overnight-2026-07-15.md for why this replaces
// is_blocked as the enforcement point.
async function assertDriverDocumentsApproved(driver, executor) {
  const missing = await getMissingRequiredDocumentTypes(driver.id, executor);
  if (missing.length > 0) {
    throw new AppError("Driver documents are not approved", 403, "DRIVER_DOCUMENTS_NOT_APPROVED", { missing });
  }
}

export async function assertDriverRegionApproved(driver, regionId, executor = defaultQuery) {
  if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
  if (driver.is_blocked) throw new AppError("Driver is blocked", 403, "DRIVER_BLOCKED");
  await assertDriverDocumentsApproved(driver, executor);
  if (!regionId) throw new AppError("Driver region is required", 400, "DRIVER_REGION_REQUIRED");

  const region = await getRegion(regionId, executor);
  if (!region) throw new AppError("Region not found", 404, "REGION_NOT_FOUND");
  if (!region.is_active) throw new AppError("Region is inactive", 403, "REGION_INACTIVE");

  const approval = await getDriverRegionApproval(driver.id, region.id, executor);
  if (!approval) throw new AppError("Driver is not approved for this region", 403, "DRIVER_REGION_NOT_APPROVED");
  if (approval.status === "BLOCKED") throw new AppError("Driver is blocked for this region", 403, "DRIVER_REGION_BLOCKED");
  if (approval.status !== "APPROVED") throw new AppError("Driver is not approved for this region", 403, "DRIVER_REGION_NOT_APPROVED");

  return { region, approval };
}

export async function selectDriverRegion(driver, regionId, executor = defaultQuery) {
  const approved = await assertDriverRegionApproved(driver, regionId, executor);
  const result = await run(executor, `
    UPDATE drivers
    SET current_region_id=$1, last_seen_at=NOW()
    WHERE id=$2
    RETURNING *
  `, [regionId, driver.id]);
  return { driver: result.rows[0], ...approved };
}

export async function assertDriverCanGoOnline(driver, executor = defaultQuery) {
  return assertDriverRegionApproved(driver, driver?.current_region_id, executor);
}

export async function assertDriverDispatchReady(driver, executor = defaultQuery) {
  if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
  if (driver.is_blocked) throw new AppError("Driver is blocked", 403, "DRIVER_BLOCKED");
  await assertDriverDocumentsApproved(driver, executor);
  if (!driver.current_region_id) throw new AppError("Driver region is not selected", 400, "DRIVER_REGION_NOT_SELECTED");

  const region = await getRegion(driver.current_region_id, executor);
  if (!region) throw new AppError("Region not found", 404, "REGION_NOT_FOUND");
  if (!region.is_active) throw new AppError("Selected driver region is inactive", 403, "DRIVER_REGION_INACTIVE");

  const approval = await getDriverRegionApproval(driver.id, region.id, executor);
  if (!approval) throw new AppError("Driver is not approved for this region", 403, "DRIVER_REGION_NOT_APPROVED");
  if (approval.status === "BLOCKED") throw new AppError("Driver is blocked for this region", 403, "DRIVER_REGION_BLOCKED");
  if (approval.status !== "APPROVED") throw new AppError("Driver is not approved for this region", 403, "DRIVER_REGION_NOT_APPROVED");

  return { region, approval };
}

export async function setDriverRegionApproval({ driverId, regionId, status, adminUserId, reason = "" }, executor = defaultQuery) {
  if (!["APPROVED", "BLOCKED"].includes(status)) {
    throw new AppError("Invalid driver region approval status", 400, "INVALID_DRIVER_REGION_STATUS");
  }

  const driver = (await run(executor, "SELECT * FROM drivers WHERE id=$1 FOR UPDATE", [driverId])).rows[0];
  if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");

  const region = await getRegion(regionId, executor);
  if (!region) throw new AppError("Region not found", 404, "REGION_NOT_FOUND");

  const approval = (await run(executor, `
    INSERT INTO driver_region_approvals(driver_id, region_id, status, approved_by_user_id, blocked_by_user_id, block_reason, approved_at, blocked_at)
    VALUES(
      $1,
      $2,
      $3,
      CASE WHEN $3='APPROVED' THEN $4 ELSE NULL END,
      CASE WHEN $3='BLOCKED' THEN $4 ELSE NULL END,
      CASE WHEN $3='BLOCKED' THEN $5 ELSE NULL END,
      CASE WHEN $3='APPROVED' THEN NOW() ELSE NULL END,
      CASE WHEN $3='BLOCKED' THEN NOW() ELSE NULL END
    )
    ON CONFLICT (driver_id, region_id) DO UPDATE
    SET status=EXCLUDED.status,
        approved_by_user_id=CASE WHEN EXCLUDED.status='APPROVED' THEN EXCLUDED.approved_by_user_id ELSE driver_region_approvals.approved_by_user_id END,
        blocked_by_user_id=CASE WHEN EXCLUDED.status='BLOCKED' THEN EXCLUDED.blocked_by_user_id ELSE NULL END,
        block_reason=CASE WHEN EXCLUDED.status='BLOCKED' THEN EXCLUDED.block_reason ELSE NULL END,
        approved_at=CASE WHEN EXCLUDED.status='APPROVED' THEN NOW() ELSE driver_region_approvals.approved_at END,
        blocked_at=CASE WHEN EXCLUDED.status='BLOCKED' THEN NOW() ELSE NULL END,
        updated_at=NOW()
    RETURNING *
  `, [driverId, regionId, status, adminUserId, reason || null])).rows[0];

  let updatedDriver = driver;
  if (status === "BLOCKED" && driver.current_region_id === regionId) {
    updatedDriver = (await run(executor, `
      UPDATE drivers
      SET status='OFFLINE', current_region_id=NULL, last_seen_at=NOW()
      WHERE id=$1
      RETURNING *
    `, [driverId])).rows[0];
  }

  return { approval, driver: updatedDriver, region };
}
