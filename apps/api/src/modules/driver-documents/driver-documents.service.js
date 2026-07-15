import { AppError } from "../../common/errors.js";

async function defaultQuery(sql, params) {
  const db = await import("../../db/pool.js");
  return db.query(sql, params);
}

function run(executor, sql, params = []) {
  return executor.query ? executor.query(sql, params) : executor(sql, params);
}

export const DOCUMENT_TYPES = [
  "DRIVER_LICENSE_FRONT",
  "DRIVER_LICENSE_BACK",
  "ID_CARD_FRONT",
  "ID_CARD_BACK",
  "VEHICLE_REGISTRATION",
  "INSURANCE_POLICY",
  "PROFILE_PHOTO",
  "OTHER"
];

// The minimum set a driver must have on file, each APPROVED, before they're
// allowed to actually work — see getMissingRequiredDocumentTypes below.
// INSURANCE_POLICY/PROFILE_PHOTO/OTHER stay optional.
export const REQUIRED_DOCUMENT_TYPES = [
  "DRIVER_LICENSE_FRONT",
  "DRIVER_LICENSE_BACK",
  "ID_CARD_FRONT",
  "ID_CARD_BACK",
  "VEHICLE_REGISTRATION"
];

// Live check (no separate "driver is verified" flag to keep in sync) — a
// driver counts as approved to work only if every required type's most
// recent submission is APPROVED. A required type that was APPROVED and then
// re-submitted (e.g. license renewal) and REJECTED on review drops out
// automatically, without any extra event-handling code, because this always
// looks at the latest row per type rather than "has ever been approved".
export async function getMissingRequiredDocumentTypes(driverId, executor = defaultQuery) {
  const result = await run(executor, `
    SELECT DISTINCT ON (type) type, status
    FROM driver_documents
    WHERE driver_id=$1 AND type = ANY($2::text[])
    ORDER BY type, created_at DESC
  `, [driverId, REQUIRED_DOCUMENT_TYPES]);
  const approvedTypes = new Set(result.rows.filter(row => row.status === "APPROVED").map(row => row.type));
  return REQUIRED_DOCUMENT_TYPES.filter(type => !approvedTypes.has(type));
}

export function publicDriverDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    driverId: row.driver_id,
    driverApplicationId: row.driver_application_id,
    type: row.type,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    rejectionReason: row.rejection_reason || null,
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function insertDriverDocument({
  driverId = null,
  driverApplicationId = null,
  type,
  filePath,
  originalFilename,
  mimeType,
  sizeBytes
}, executor = defaultQuery) {
  const result = await run(executor, `
    INSERT INTO driver_documents(driver_id, driver_application_id, type, file_path, original_filename, mime_type, size_bytes)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    RETURNING *
  `, [driverId, driverApplicationId, type, filePath, originalFilename, mimeType, sizeBytes]);
  return result.rows[0];
}

export async function listDocumentsForDriver(driverId, executor = defaultQuery) {
  const result = await run(executor, `
    SELECT * FROM driver_documents WHERE driver_id=$1 ORDER BY created_at DESC
  `, [driverId]);
  return result.rows;
}

export async function listDocumentsForApplication(applicationId, executor = defaultQuery) {
  const result = await run(executor, `
    SELECT * FROM driver_documents WHERE driver_application_id=$1 ORDER BY created_at DESC
  `, [applicationId]);
  return result.rows;
}

export async function getDriverDocumentById(id, executor = defaultQuery) {
  const result = await run(executor, "SELECT * FROM driver_documents WHERE id=$1", [id]);
  return result.rows[0] || null;
}

export async function reviewDriverDocument({ id, status, reason = "", actorUserId }, executor = defaultQuery) {
  if (!["APPROVED", "REJECTED"].includes(status)) {
    throw new AppError("Invalid document status", 400, "INVALID_DOCUMENT_STATUS");
  }
  const existing = await getDriverDocumentById(id, executor);
  if (!existing) throw new AppError("Document not found", 404, "DRIVER_DOCUMENT_NOT_FOUND");

  const result = await run(executor, `
    UPDATE driver_documents
    SET status=$1,
        rejection_reason=CASE WHEN $1='REJECTED' THEN $2 ELSE NULL END,
        reviewed_by_user_id=$3,
        reviewed_at=NOW(),
        updated_at=NOW()
    WHERE id=$4
    RETURNING *
  `, [status, reason, actorUserId, id]);
  return result.rows[0];
}
