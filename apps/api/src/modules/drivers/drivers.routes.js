import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
const router = Router();

router.get("/", requireAuth, requireRole("OWNER", "OPERATOR", "FINANCE"), async (_req, res, next) => {
  try {
    const result = await query("SELECT * FROM drivers ORDER BY created_at DESC");
    res.json({ drivers: result.rows });
  } catch (e) { next(e); }
});

router.get("/me", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const result = await query("SELECT * FROM drivers WHERE user_id=$1", [req.user.id]);
    if (!result.rows[0]) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
    res.json({ driver: result.rows[0] });
  } catch (e) { next(e); }
});

router.patch("/me/status", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const body = z.object({ status: z.enum(["FREE", "OFFLINE", "BREAK"]) }).parse(req.body);
    const driver = (await query("SELECT * FROM drivers WHERE user_id=$1 AND is_blocked=false", [req.user.id])).rows[0];
    if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");

    if (["OFFLINE", "BREAK"].includes(body.status)) {
      const active = await query("SELECT id FROM orders WHERE driver_id=$1 AND status = ANY($2::text[]) LIMIT 1", [driver.id, ["DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS"]]);
      if (active.rows[0]) throw new AppError("Driver has active order", 409, "DRIVER_HAS_ACTIVE_ORDER");
    }

    const result = await query("UPDATE drivers SET status=$1,last_seen_at=NOW() WHERE user_id=$2 RETURNING *", [body.status, req.user.id]);
    await writeAudit(query, {
      action: "driver_status_updated",
      actorUserId: req.user.id,
      entityType: "driver",
      entityId: driver.id,
      metadata: { from: driver.status, to: body.status },
      req
    });
    res.json({ driver: result.rows[0] });
  } catch (e) { next(e); }
});

router.get("/me/stats", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const driver = (await query("SELECT * FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
    if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
    const stats = await query(`
      SELECT COUNT(*)::int orders_total,
             COUNT(*) FILTER (WHERE status='COMPLETED')::int completed_orders,
             COALESCE(SUM(price) FILTER (WHERE status='COMPLETED'),0)::int revenue_total
      FROM orders
      WHERE driver_id=$1 AND created_at >= date_trunc('day', NOW())
    `, [driver.id]);
    res.json({ driver, today: stats.rows[0] });
  } catch (e) { next(e); }
});

export default router;
