import multer from "multer";
import { AppError } from "../../common/errors.js";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png"]);
const MAX_SIZE_BYTES = 6 * 1024 * 1024;

function fileFilter(_req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new AppError("Unsupported file type. Use JPEG or PNG", 400, "UNSUPPORTED_FILE_TYPE"));
  }
  cb(null, true);
}

// Kept in memory, not on disk (see driver-avatar.routes.js) — the buffer
// goes straight into a driver_avatars row.
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES, files: 1 }
});

export const uploadDriverAvatar = upload.single("file");
