import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";

const router = Router();

const DriverApplication = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(32),
  carModel: z.string().trim().min(2).max(120),
  carColor: z.string().trim().max(60).optional().default(""),
  plateNumber: z.string().trim().min(2).max(40),
  year: z.coerce.number().int().min(1980).max(2100).optional(),
  comment: z.string().trim().max(500).optional().default("")
});

const SettingsUpdate = z.object({
  serviceName: z.string().trim().min(2).max(80).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  currency: z.string().trim().min(2).max(8).optional(),
  currencySymbol: z.string().trim().min(1).max(8).optional(),
  defaultCommissionPercent: z.coerce.number().min(0).max(50).optional(),
  autoApproveDrivers: z.boolean().optional(),
  autoAssignOrders: z.boolean().optional(),
  supportPhone: z.string().trim().min(3).max(32).optional(),
  sosPhone: z.string().trim().min(3).max(32).optional()
}).refine(value => Object.keys(value).length > 0, "at least one field is required");

const Review = z.object({
  orderId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  tags: z.array(z.string().trim().max(40)).max(8).optional().default([]),
  comment: z.string().trim().max(500).optional().default("")
});

function mapSettings(row) {
  return {
    serviceName: row.service_name,
    city: row.city,
    currency: row.currency,
    currencySymbol: row.currency_symbol,
    defaultCommissionPercent: Number(row.default_commission_percent),
    autoApproveDrivers: row.auto_approve_drivers,
    autoAssignOrders: row.auto_assign_orders,
    supportPhone: row.support_phone,
    sosPhone: row.sos_phone,
    updatedAt: row.updated_at
  };
}

router.get("/settings", requireAuth, requireRole("OWNER", "OPERATOR", "FINANCE"), async (_req, res, next) => {
  try {
    const result = await query("SELECT * FROM service_settings WHERE id=1");
    res.json({ settings: mapSettings(result.rows[0]) });
  } catch (error) { next(error); }
});

router.patch("/settings", requireAuth, requireRole("OWNER"), async (req, res, next) => {
  try {
    const body = SettingsUpdate.parse(req.body);
    const columns = {
      serviceName: "service_name",
      city: "city",
      currency: "currency",
      currencySymbol: "currency_symbol",
      defaultCommissionPercent: "default_commission_percent",
      autoApproveDrivers: "auto_approve_drivers",
      autoAssignOrders: "auto_assign_orders",
      supportPhone: "support_phone",
      sosPhone: "sos_phone"
    };
    const entries = Object.entries(body);
    const values = entries.map(([, value]) => value);
    const assignments = entries.map(([key], index) => `${columns[key]}=$${index + 1}`);
    const settings = await tx(async client => {
      const before = (await client.query("SELECT * FROM service_settings WHERE id=1 FOR UPDATE")).rows[0];
      const updated = (await client.query(`
        UPDATE service_settings
        SET ${assignments.join(", ")}, updated_at=NOW()
        WHERE id=1
        RETURNING *
      `, values)).rows[0];
      await writeAudit(client, {
        action: "service_settings_updated",
        actorUserId: req.user.id,
        entityType: "service_settings",
        metadata: { before, after: updated },
        req
      });
      return updated;
    });
    res.json({ settings: mapSettings(settings) });
  } catch (error) { next(error); }
});

router.post("/driver-applications", async (req, res, next) => {
  try {
    const body = DriverApplication.parse(req.body);
    const settings = (await query("SELECT auto_approve_drivers FROM service_settings WHERE id=1")).rows[0];
    const status = settings?.auto_approve_drivers ? "APPROVED" : "PENDING";
    const result = await query(`
      INSERT INTO driver_applications(full_name, phone, car_model, car_color, plate_number, year, status, comment)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `, [body.fullName, body.phone, body.carModel, body.carColor || null, body.plateNumber, body.year || null, status, body.comment]);
    res.status(201).json({ application: result.rows[0] });
  } catch (error) { next(error); }
});

router.get("/driver-applications", requireAuth, requireRole("OWNER", "OPERATOR"), async (req, res, next) => {
  try {
    const params = z.object({
      status: z.enum(["PENDING", "APPROVED", "REJECTED", "NEEDS_INFO"]).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100)
    }).parse(req.query);
    const result = params.status
      ? await query("SELECT * FROM driver_applications WHERE status=$1 ORDER BY created_at DESC LIMIT $2", [params.status, params.limit])
      : await query("SELECT * FROM driver_applications ORDER BY created_at DESC LIMIT $1", [params.limit]);
    res.json({ applications: result.rows });
  } catch (error) { next(error); }
});

router.patch("/driver-applications/:id", requireAuth, requireRole("OWNER", "OPERATOR"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({
      status: z.enum(["APPROVED", "REJECTED", "NEEDS_INFO"]),
      comment: z.string().trim().max(500).optional().default("")
    }).parse(req.body);
    const application = await tx(async client => {
      const before = (await client.query("SELECT * FROM driver_applications WHERE id=$1 FOR UPDATE", [params.id])).rows[0];
      if (!before) throw new AppError("Driver application not found", 404, "DRIVER_APPLICATION_NOT_FOUND");
      const updated = (await client.query(`
        UPDATE driver_applications
        SET status=$1, comment=$2, reviewed_at=NOW()
        WHERE id=$3
        RETURNING *
      `, [body.status, body.comment, params.id])).rows[0];
      await writeAudit(client, {
        action: "driver_application_reviewed",
        actorUserId: req.user.id,
        entityType: "driver_application",
        entityId: params.id,
        metadata: { from: before.status, to: body.status },
        req
      });
      return updated;
    });
    res.json({ application });
  } catch (error) { next(error); }
});

router.post("/driver-reviews", async (req, res, next) => {
  try {
    const body = Review.parse(req.body);
    const review = await tx(async client => {
      const order = (await client.query("SELECT * FROM orders WHERE id=$1", [body.orderId])).rows[0];
      if (!order || !order.driver_id) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
      if (order.status !== "COMPLETED") throw new AppError("Trip is not completed", 409, "INVALID_STATUS_TRANSITION");
      const created = (await client.query(`
        INSERT INTO driver_reviews(order_id, driver_id, client_id, rating, tags, comment)
        VALUES($1,$2,$3,$4,$5,$6)
        RETURNING *
      `, [order.id, order.driver_id, order.client_id, body.rating, body.tags, body.comment])).rows[0];
      const rating = (await client.query("SELECT AVG(rating)::numeric(3,2) rating FROM driver_reviews WHERE driver_id=$1", [order.driver_id])).rows[0];
      await client.query("UPDATE drivers SET rating=$1 WHERE id=$2", [rating.rating || body.rating, order.driver_id]);
      return created;
    });
    res.status(201).json({ review });
  } catch (error) { next(error); }
});

router.get("/reviews", requireAuth, requireRole("OWNER", "OPERATOR"), async (_req, res, next) => {
  try {
    const result = await query(`
      SELECT r.*, d.name driver_name, d.phone driver_phone, o.short_id
      FROM driver_reviews r
      LEFT JOIN drivers d ON d.id=r.driver_id
      LEFT JOIN orders o ON o.id=r.order_id
      ORDER BY r.created_at DESC
      LIMIT 100
    `);
    res.json({ reviews: result.rows });
  } catch (error) { next(error); }
});

router.get("/leaderboard", requireAuth, requireRole("OWNER", "OPERATOR", "FINANCE"), async (_req, res, next) => {
  try {
    const result = await query(`
      SELECT d.id, d.name, d.phone, d.car_model, d.plate, d.status, d.rating,
             COUNT(o.id)::int total_orders,
             COUNT(o.id) FILTER (WHERE o.status='COMPLETED')::int completed_orders,
             COUNT(o.id) FILTER (WHERE o.status='CANCELLED')::int cancelled_orders,
             COALESCE(SUM(o.price) FILTER (WHERE o.status='COMPLETED'),0)::int revenue_total
      FROM drivers d
      LEFT JOIN orders o ON o.driver_id=d.id
      GROUP BY d.id
      ORDER BY d.rating DESC, completed_orders DESC, revenue_total DESC
      LIMIT 100
    `);
    res.json({ leaderboard: result.rows });
  } catch (error) { next(error); }
});

export default router;
