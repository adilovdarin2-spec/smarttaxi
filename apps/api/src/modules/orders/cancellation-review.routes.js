import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import {
  getCancellationReviewSummary,
  listCancellationAudits,
  publicCancellationAudit,
  reviewCancellationAudit
} from "./cancellation-review.service.js";

// The owner's side of the cancellation problem. Read-only plus one verdict
// per case — no automatic penalty lives here, by design: the decision to fine
// or block a driver stays a person's, and the existing finance and driver
// screens are where that is actually carried out.
const router = Router();
router.use(requireAuth, requireRole("OWNER", "FINANCE"));

const ListQuery = z.object({
  reviewStatus: z.enum(["PENDING", "CLEARED", "CONFIRMED_FRAUD", "DISMISSED"]).optional(),
  regionId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  minRiskScore: z.coerce.number().int().min(0).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

const ReviewBody = z.object({
  reviewStatus: z.enum(["CLEARED", "CONFIRMED_FRAUD", "DISMISSED"]),
  reviewNote: z.string().trim().max(500).optional()
});

const IdParam = z.object({ id: z.string().uuid() });

router.get("/", async (req, res, next) => {
  try {
    const params = ListQuery.parse(req.query);
    const [audits, summary] = await Promise.all([
      listCancellationAudits(params),
      getCancellationReviewSummary()
    ]);
    res.json({ audits, summary });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const row = (await query(`
      SELECT a.*, o.short_id order_short_id, o.pickup_text, o.dropoff_text,
             d.name driver_name, d.phone driver_phone,
             c.name client_name, c.phone client_phone,
             r.name region_name
      FROM order_cancellation_audits a
      LEFT JOIN orders o ON o.id=a.order_id
      LEFT JOIN drivers d ON d.id=a.driver_id
      LEFT JOIN clients c ON c.id=a.client_id
      LEFT JOIN regions r ON r.id=a.region_id
      WHERE a.id=$1
    `, [id])).rows[0];
    if (!row) throw new AppError("Cancellation review not found", 404, "CANCELLATION_AUDIT_NOT_FOUND");
    res.json({
      audit: {
        ...publicCancellationAudit(row),
        pickupText: row.pickup_text || "",
        dropoffText: row.dropoff_text || ""
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/review", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const body = ReviewBody.parse(req.body || {});
    const existing = (await query("SELECT * FROM order_cancellation_audits WHERE id=$1", [id])).rows[0];
    if (!existing) throw new AppError("Cancellation review not found", 404, "CANCELLATION_AUDIT_NOT_FOUND");
    const updated = await reviewCancellationAudit({
      auditId: id,
      reviewStatus: body.reviewStatus,
      reviewNote: body.reviewNote,
      reviewerUserId: req.user.id
    });
    await writeAudit(query, {
      action: "cancellation_review_decided",
      actorUserId: req.user.id,
      entityType: "order_cancellation_audit",
      entityId: id,
      metadata: {
        from: existing.review_status,
        to: body.reviewStatus,
        orderId: existing.order_id,
        driverId: existing.driver_id
      },
      req
    });
    res.json({ audit: publicCancellationAudit(updated) });
  } catch (error) {
    next(error);
  }
});

export default router;
