import { Router } from "express";
import { createReadStream, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import { rateLimit } from "../../common/rateLimit.js";
import {
  DOCUMENT_TYPES,
  getDriverDocumentById,
  insertDriverDocument,
  listDocumentsForApplication,
  listDocumentsForDriver,
  publicDriverDocument
} from "./driver-documents.service.js";
import { UPLOAD_ROOT, resolveApplicationOwner, resolveOwnDriver, uploadDriverDocument } from "./upload.middleware.js";

const TypeField = z.object({ type: z.enum(DOCUMENT_TYPES) });

function storedRelativePath(absolutePath) {
  return relative(UPLOAD_ROOT, absolutePath).split("\\").join("/");
}

async function saveUploadedDocument(req, { driverId = null, driverApplicationId = null }) {
  if (!req.file) throw new AppError("File is required", 400, "FILE_REQUIRED");
  const body = TypeField.parse(req.body);
  return insertDriverDocument({
    driverId,
    driverApplicationId,
    type: body.type,
    filePath: storedRelativePath(req.file.path),
    originalFilename: req.file.originalname,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size
  });
}

const router = Router();

router.get("/", requireAuth, requireRole("DRIVER"), resolveOwnDriver, async (req, res, next) => {
  try {
    const documents = await listDocumentsForDriver(req.driver.id);
    res.json({ documents: documents.map(publicDriverDocument) });
  } catch (error) { next(error); }
});

router.post("/", requireAuth, requireRole("DRIVER"), resolveOwnDriver, uploadDriverDocument, async (req, res, next) => {
  try {
    const document = await saveUploadedDocument(req, { driverId: req.driver.id });
    await writeAudit(query, {
      action: "driver_document_uploaded",
      actorUserId: req.user.id,
      entityType: "driver_document",
      entityId: document.id,
      metadata: { type: document.type },
      req
    });
    res.status(201).json({ document: publicDriverDocument(document) });
  } catch (error) { next(error); }
});

router.get("/:id/file", requireAuth, requireRole("DRIVER"), resolveOwnDriver, async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const document = await getDriverDocumentById(params.id);
    if (!document || document.driver_id !== req.driver.id) {
      throw new AppError("Document not found", 404, "DRIVER_DOCUMENT_NOT_FOUND");
    }
    const absolutePath = join(UPLOAD_ROOT, document.file_path);
    if (!existsSync(absolutePath)) throw new AppError("Document file is missing", 404, "DRIVER_DOCUMENT_FILE_MISSING");
    res.setHeader("Content-Type", document.mime_type);
    createReadStream(absolutePath).pipe(res);
  } catch (error) { next(error); }
});

export default router;

export const driverApplicationDocumentsRouter = Router();

driverApplicationDocumentsRouter.post(
  "/:applicationId/documents",
  rateLimit({ prefix: "driver-application-documents", windowMs: 60_000, max: 20 }),
  resolveApplicationOwner,
  uploadDriverDocument,
  async (req, res, next) => {
    try {
      const document = await saveUploadedDocument(req, { driverApplicationId: req.documentOwnerId });
      res.status(201).json({ document: publicDriverDocument(document) });
    } catch (error) { next(error); }
  }
);

driverApplicationDocumentsRouter.get(
  "/:applicationId/documents",
  rateLimit({ prefix: "driver-application-documents-list", windowMs: 60_000, max: 30 }),
  resolveApplicationOwner,
  async (req, res, next) => {
    try {
      const documents = await listDocumentsForApplication(req.documentOwnerId);
      res.json({ documents: documents.map(publicDriverDocument) });
    } catch (error) { next(error); }
  }
);
