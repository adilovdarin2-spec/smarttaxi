import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOCUMENT_TYPES,
  getDriverDocumentById,
  getDriverDocumentFileById,
  insertDriverDocument,
  listDocumentsForApplication,
  listDocumentsForDriver,
  reviewDriverDocument
} from "../modules/driver-documents/driver-documents.service.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const schema = readFileSync(join(root, "db", "schema.sql"), "utf8");
const migrations = readFileSync(join(root, "db", "migrations.js"), "utf8");
const documentService = readFileSync(join(root, "modules", "driver-documents", "driver-documents.service.js"), "utf8");
const documentRoutes = readFileSync(join(root, "modules", "driver-documents", "driver-documents.routes.js"), "utf8");
const uploadMiddleware = readFileSync(join(root, "modules", "driver-documents", "upload.middleware.js"), "utf8");
const adminRoutes = readFileSync(join(root, "modules", "admin", "admin.routes.js"), "utf8");

assert.match(schema, /CREATE TABLE IF NOT EXISTS driver_documents/i, "schema must create driver_documents table");
assert.match(migrations, /CREATE TABLE IF NOT EXISTS driver_documents/i, "migration must create driver_documents table");
assert.match(migrations, /driver_documents_owner_check CHECK \(driver_id IS NOT NULL OR driver_application_id IS NOT NULL\)/i, "a document must belong to a driver or an application");
assert.match(schema, /driver_documents[\s\S]*data BYTEA/i, "new databases must persist document bytes");
assert.match(migrations, /ALTER TABLE driver_documents ADD COLUMN IF NOT EXISTS data BYTEA/i, "existing databases must gain document byte storage");
assert.match(uploadMiddleware, /multer\.memoryStorage\(\)/, "uploads must not depend on one replica's filesystem");
assert.match(documentService, /DOCUMENT_METADATA_COLUMNS/, "document lists must keep binary payloads out of metadata queries");

assert.match(documentRoutes, /router\.get\("\/", requireAuth, requireRole\("DRIVER"\), resolveOwnDriver/, "listing own documents must require an authenticated driver");
assert.match(documentRoutes, /router\.post\("\/", requireAuth, requireRole\("DRIVER"\), resolveOwnDriver, uploadDriverDocument/, "uploading own documents must require an authenticated driver");
assert.match(documentRoutes, /driverApplicationDocumentsRouter\.post\(\s*"\/:applicationId\/documents",\s*requireAuth/, "application upload requires the applicant session");
assert.match(
  documentRoutes.match(/driverApplicationDocumentsRouter\.post\([\s\S]*?\);/)?.[0] || "",
  /requireAuth/,
  "application-scoped documents cannot be accessed with an ID alone"
);
assert.match(adminRoutes, /router\.patch\("\/driver-documents\/:id", requireAuth, requireRole\("OWNER"\)/, "document review must be staff only");

function createExecutor() {
  const state = { documents: [] };
  let seq = 0;

  return {
    state,
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, " ").trim();

      if (s.startsWith("INSERT INTO driver_documents")) {
        const [driverId, driverApplicationId, type, filePath, originalFilename, mimeType, sizeBytes, data] = params;
        seq += 1;
        const row = {
          id: `doc-${seq}`,
          driver_id: driverId,
          driver_application_id: driverApplicationId,
          type,
          file_path: filePath,
          original_filename: originalFilename,
          mime_type: mimeType,
          size_bytes: sizeBytes,
          data,
          status: "PENDING",
          rejection_reason: null,
          reviewed_by_user_id: null,
          reviewed_at: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z"
        };
        state.documents.push(row);
        return { rows: [row] };
      }
      if (s.includes("FROM driver_documents WHERE driver_id=$1")) {
        return { rows: state.documents.filter(d => d.driver_id === params[0]) };
      }
      if (s.includes("FROM driver_documents WHERE driver_application_id=$1")) {
        return { rows: state.documents.filter(d => d.driver_application_id === params[0]) };
      }
      if (s.includes("FROM driver_documents WHERE id=$1")) {
        return { rows: state.documents.filter(d => d.id === params[0]) };
      }
      if (s.startsWith("UPDATE driver_documents SET status=$1")) {
        const [status, reason, actorUserId, id] = params;
        const row = state.documents.find(d => d.id === id);
        row.status = status;
        row.rejection_reason = status === "REJECTED" ? reason : null;
        row.reviewed_by_user_id = actorUserId;
        row.reviewed_at = "2026-01-01T00:01:00.000Z";
        row.updated_at = "2026-01-01T00:01:00.000Z";
        return { rows: [row] };
      }
      throw new Error(`Unexpected SQL in driver documents check: ${s}`);
    }
  };
}

// --- upload + list, both owner kinds ---
{
  const executor = createExecutor();
  const driverPayload = Buffer.from([0xff, 0xd8, 0xff, 0xdb]);
  await insertDriverDocument({
    driverId: "driver-1",
    type: "DRIVER_LICENSE_FRONT",
    filePath: "driver-1/license-front.jpg",
    originalFilename: "license-front.jpg",
    mimeType: "image/jpeg",
    sizeBytes: driverPayload.length,
    data: driverPayload
  }, executor);
  await insertDriverDocument({
    driverApplicationId: "app-1",
    type: "ID_CARD_FRONT",
    filePath: "app-1/id-front.jpg",
    originalFilename: "id-front.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 4,
    data: Buffer.from([1, 2, 3, 4])
  }, executor);

  const forDriver = await listDocumentsForDriver("driver-1", executor);
  assert.equal(forDriver.length, 1, "driver-scoped list only returns that driver's documents");
  assert.equal(forDriver[0].status, "PENDING", "newly uploaded documents start pending");

  const forApplication = await listDocumentsForApplication("app-1", executor);
  assert.equal(forApplication.length, 1, "application-scoped list only returns that application's documents");
  assert.equal(forApplication[0].type, "ID_CARD_FRONT", "document type is preserved");

  const storedFile = await getDriverDocumentFileById(forDriver[0].id, executor);
  assert.deepEqual(storedFile.data, driverPayload, "document bytes survive storage and can be served by every replica");
}

// --- review lifecycle ---
{
  const executor = createExecutor();
  const inserted = await insertDriverDocument({
    driverId: "driver-1",
    type: "VEHICLE_REGISTRATION",
    filePath: "driver-1/reg.pdf",
    originalFilename: "reg.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4,
    data: Buffer.from([1, 2, 3, 4])
  }, executor);

  const approved = await reviewDriverDocument({ id: inserted.id, status: "APPROVED", actorUserId: "admin-1" }, executor);
  assert.equal(approved.status, "APPROVED", "admin can approve a pending document");
  assert.equal(approved.rejection_reason, null, "approval clears any reject reason");

  const rejected = await reviewDriverDocument({ id: inserted.id, status: "REJECTED", reason: "Плохое качество фото", actorUserId: "admin-1" }, executor);
  assert.equal(rejected.status, "REJECTED", "admin can reject a document even after approval (re-review)");
  assert.equal(rejected.rejection_reason, "Плохое качество фото", "rejection stores the reason");

  await assert.rejects(
    () => reviewDriverDocument({ id: "doc-missing", status: "APPROVED", actorUserId: "admin-1" }, executor),
    { code: "DRIVER_DOCUMENT_NOT_FOUND" },
    "reviewing a missing document fails clearly"
  );

  await assert.rejects(
    () => reviewDriverDocument({ id: inserted.id, status: "PENDING", actorUserId: "admin-1" }, executor),
    { code: "INVALID_DOCUMENT_STATUS" },
    "review status must be APPROVED or REJECTED"
  );
}

assert.ok(DOCUMENT_TYPES.includes("DRIVER_LICENSE_FRONT"), "document type enum includes driver license front");
assert.ok(DOCUMENT_TYPES.includes("OTHER"), "document type enum has an OTHER fallback");

console.log("Driver documents checks ok");
