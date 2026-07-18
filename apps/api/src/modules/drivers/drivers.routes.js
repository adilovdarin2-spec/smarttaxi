import { Router } from "express";
import { createHash } from "crypto";
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
import { ACTIVE_ORDER_STATUSES, syncDriverAvailability } from "../orders/order-dispatch.service.js";
const router = Router();

function nearbyPublicId(driverId) {
  return createHash("sha256").update(`smarttaxi-nearby:${driverId}`).digest("hex").slice(0, 16);
}

router.get("/nearby", requireAuth, async (req, res, next) => {
  try {
    const input = z.object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
      limit: z.coerce.number().int().min(1).max(5).optional().default(5)
    }).parse(req.query);

    const result = await query(`
      WITH latest_locations AS (
        SELECT DISTINCT ON (driver_id)
               driver_id, region_id, lat, lng, heading, updated_at
        FROM driver_locations
        ORDER BY driver_id, updated_at DESC
      )
      SELECT d.id,
             l.lat,
             l.lng,
             l.heading,
             l.updated_at,
             (
               6371 * acos(
                 LEAST(1, GREATEST(-1,
                   cos(radians($1)) * cos(radians(l.lat::double precision)) *
                   cos(radians(l.lng::double precision) - radians($2)) +
                   sin(radians($1)) * sin(radians(l.lat::double precision))
                 ))
               )
             ) AS distance_km
      FROM drivers d
      JOIN latest_locations l ON l.driver_id = d.id
      WHERE d.status = 'FREE'
        AND d.is_blocked = false
        AND l.updated_at >= NOW() - INTERVAL '2 hours'
      ORDER BY distance_km ASC NULLS LAST
      LIMIT $3
    `, [input.lat, input.lng, input.limit]);

    const drivers = result.rows.map(row => {
      const distanceKm = Number(row.distance_km || 0);
      return {
        id: nearbyPublicId(row.id),
        lat: Number(row.lat),
        lng: Number(row.lng),
        bearing: row.heading === null ? null : Number(row.heading),
        etaMin: Math.max(2, Math.min(18, Math.round((distanceKm / 0.45) + 1))),
        anonymous: true
      };
    });

    res.json({ drivers });
  } catch (e) { next(e); }
});

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
    const driver = await syncDriverAvailability(result.rows[0], query);
    res.json({ driver });
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
    let driver = (await query("SELECT * FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
    if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
    driver = await syncDriverAvailability(driver, query);
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
    let driver = (await query("SELECT * FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
    if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
    driver = await syncDriverAvailability(driver, query);
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

router.get("/me/rating-summary", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const driver = (await query("SELECT * FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
    if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");

    const summary = (await query(`
      SELECT
        COUNT(*)::int review_count,
        COUNT(*) FILTER (WHERE rating=5)::int stars_5,
        COUNT(*) FILTER (WHERE rating=4)::int stars_4,
        COUNT(*) FILTER (WHERE rating=3)::int stars_3,
        COUNT(*) FILTER (WHERE rating=2)::int stars_2,
        COUNT(*) FILTER (WHERE rating=1)::int stars_1
      FROM driver_reviews
      WHERE driver_id=$1
    `, [driver.id])).rows[0];

    const tags = (await query(`
      SELECT tag, COUNT(*)::int count
      FROM driver_reviews, unnest(tags) tag
      WHERE driver_id=$1
      GROUP BY tag
      ORDER BY count DESC, tag ASC
      LIMIT 5
    `, [driver.id])).rows;

    const recent = (await query(`
      SELECT r.rating, r.tags, r.comment, r.created_at, o.short_id
      FROM driver_reviews r
      LEFT JOIN orders o ON o.id = r.order_id
      WHERE r.driver_id=$1
      ORDER BY r.created_at DESC
      LIMIT 10
    `, [driver.id])).rows;

    res.json({
      rating: Number(driver.rating || 0),
      reviewCount: summary.review_count,
      breakdown: {
        5: summary.stars_5,
        4: summary.stars_4,
        3: summary.stars_3,
        2: summary.stars_2,
        1: summary.stars_1
      },
      topTags: tags.map(row => ({ tag: row.tag, count: row.count })),
      recent: recent.map(row => ({
        rating: row.rating,
        tags: row.tags,
        comment: row.comment,
        createdAt: row.created_at,
        orderShortId: row.short_id || null
      }))
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
