import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import {
  assertDriverCanGoOnline,
  listDriverRegionApprovals,
  publicDriverRegionApproval,
  selectDriverRegion
} from "../driver-region-approvals/driver-region-approvals.service.js";
import { updateDriverLocation } from "../routing/routing.service.js";
import { ACTIVE_ORDER_STATUSES } from "../orders/order-dispatch.service.js";
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

router.get("/me/regions", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const driver = (await query("SELECT * FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
    if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
    const regions = await listDriverRegionApprovals(driver.id, query);
    res.json({
      driver,
      regions: regions
        .filter(region => region.region_is_active && region.approval_status === "APPROVED")
        .map(publicDriverRegionApproval)
    });
  } catch (e) { next(e); }
});

router.patch("/me/region", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const body = z.object({ regionId: z.string().uuid() }).parse(req.body);
    const driver = (await query("SELECT * FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
    const selected = await selectDriverRegion(driver, body.regionId, query);
    await writeAudit(query, {
      action: "driver_region_selected",
      actorUserId: req.user.id,
      entityType: "driver",
      entityId: selected.driver.id,
      metadata: { regionId: body.regionId },
      req
    });
    res.json({ driver: selected.driver, region: selected.region });
  } catch (e) { next(e); }
});

router.get("/me/active-order", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const driver = (await query("SELECT * FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
    if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
    const activeOrder = (await query(`
      SELECT o.*
      FROM orders o
      WHERE o.driver_id=$1 AND o.status = ANY($2::text[])
      ORDER BY o.created_at DESC
      LIMIT 1
    `, [driver.id, ACTIVE_ORDER_STATUSES])).rows[0] || null;
    res.json({ driver, activeOrder });
  } catch (e) { next(e); }
});

router.patch("/me/status", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const body = z.object({ status: z.enum(["FREE", "OFFLINE", "BREAK"]) }).parse(req.body);
    const driver = (await query("SELECT * FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
    if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
    if (driver.is_blocked) throw new AppError("Driver is blocked", 403, "DRIVER_BLOCKED");

    if (body.status === "FREE") {
      await assertDriverCanGoOnline(driver, query);
    }

    if (["OFFLINE", "BREAK"].includes(body.status)) {
      const active = await query("SELECT id FROM orders WHERE driver_id=$1 AND status = ANY($2::text[]) LIMIT 1", [driver.id, ACTIVE_ORDER_STATUSES]);
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

router.patch("/me/location", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const body = z.object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
      heading: z.coerce.number().min(0).max(360).optional(),
      speed: z.coerce.number().min(0).max(120).optional(),
      accuracy: z.coerce.number().min(0).max(5000).optional(),
      source: z.string().trim().max(40).optional().default("mobile")
    }).parse(req.body);
    const result = await updateDriverLocation({
      userId: req.user.id,
      location: body,
      io: req.io,
      executor: query
    });
    await writeAudit(query, {
      action: "driver_location_updated",
      actorUserId: req.user.id,
      entityType: "driver",
      entityId: result.driver.id,
      metadata: { regionId: result.location.regionId },
      req
    });
    res.json({ location: result.location });
  } catch (e) { next(e); }
});

router.get("/me/stats", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const driver = (await query("SELECT * FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
    if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
    const stats = await query(`
      SELECT COUNT(*)::int orders_total,
             COUNT(*) FILTER (WHERE status IN ('TRIP_COMPLETED','PAYMENT_PENDING','PAID','COMPLETED'))::int completed_orders,
             COALESCE(SUM(price) FILTER (WHERE status IN ('TRIP_COMPLETED','PAYMENT_PENDING','PAID','COMPLETED')),0)::int revenue_total
      FROM orders
      WHERE driver_id=$1 AND created_at >= date_trunc('day', NOW())
    `, [driver.id]);
    const activeOrder = (await query(`
      SELECT *
      FROM orders
      WHERE driver_id=$1 AND status = ANY($2::text[])
      ORDER BY created_at DESC
      LIMIT 1
    `, [driver.id, ACTIVE_ORDER_STATUSES])).rows[0] || null;
    res.json({
      driver,
      activeOrder,
      today: {
        ...stats.rows[0],
        debt: driver.debt,
        balance: driver.balance
      }
    });
  } catch (e) { next(e); }
});

router.patch("/:id/block", requireAuth, requireRole("OWNER"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({
      isBlocked: z.boolean(),
      reason: z.string().trim().max(300).optional().default("")
    }).parse(req.body);
    const before = (await query("SELECT * FROM drivers WHERE id=$1", [params.id])).rows[0];
    if (!before) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
    const result = await query(`
      UPDATE drivers
      SET is_blocked=$1, status=CASE WHEN $1=true THEN 'OFFLINE' ELSE status END
      WHERE id=$2
      RETURNING *
    `, [body.isBlocked, params.id]);
    await writeAudit(query, {
      action: body.isBlocked ? "driver_blocked" : "driver_unblocked",
      actorUserId: req.user.id,
      entityType: "driver",
      entityId: params.id,
      metadata: { reason: body.reason },
      req
    });
    res.json({ driver: result.rows[0] });
  } catch (e) { next(e); }
});

export default router;
