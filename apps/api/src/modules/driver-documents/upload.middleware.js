import multer from "multer";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AppError } from "../../common/errors.js";

export const UPLOAD_ROOT = join(process.cwd(), "uploads", "driver-documents");
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);
const MAX_SIZE_BYTES = 8 * 1024 * 1024;

function sanitizeFilename(name) {
  const trimmed = String(name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
  return trimmed.slice(-80) || "file";
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const ownerId = req.documentOwnerId;
    if (!ownerId) return cb(new AppError("Document owner could not be resolved", 400, "DOCUMENT_OWNER_REQUIRED"));
    const dir = join(UPLOAD_ROOT, ownerId);
    try {
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (error) {
      cb(error);
    }
  },
  filename(_req, file, cb) {
    cb(null, `${randomUUID()}-${sanitizeFilename(file.originalname)}`);
  }
});

function fileFilter(_req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new AppError("Unsupported file type. Use JPEG, PNG or PDF", 400, "UNSUPPORTED_FILE_TYPE"));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES, files: 1 }
});

export const uploadDriverDocument = upload.single("file");

// requireAuth + requireRole("DRIVER") already ran before this — resolve the
// authenticated driver's row so multer can namespace the file under
// uploads/driver-documents/<driverId>/ instead of the raw user id.
export async function resolveOwnDriver(req, res, next) {
  try {
    const { query } = await import("../../db/pool.js");
    const driver = (await query("SELECT * FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
    if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
    req.driver = driver;
    req.documentOwnerId = driver.id;
    next();
  } catch (error) { next(error); }
}

// The application-scoped upload route is intentionally unauthenticated (it
// runs before a real account exists), so ownership is just "this application
// id exists" rather than tied to a logged-in user.
export async function resolveApplicationOwner(req, res, next) {
  try {
    const { query } = await import("../../db/pool.js");
    const applicationId = req.params.applicationId;
    const application = (await query("SELECT id FROM driver_applications WHERE id=$1", [applicationId])).rows[0];
    if (!application) throw new AppError("Driver application not found", 404, "DRIVER_APPLICATION_NOT_FOUND");
    req.documentOwnerId = application.id;
    next();
  } catch (error) { next(error); }
}
