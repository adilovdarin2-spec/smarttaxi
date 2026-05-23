import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import { createRegion, listRegions, publicRegion, setRegionActive, updateRegion } from "../regions/regions.service.js";
import {
  listDriverRegionApprovals,
  publicDriverRegionApproval,
  setDriverRegionApproval
} from "../driver-region-approvals/driver-region-approvals.service.js";
import {
  adminTariff,
  createAdminTariff,
  getAdminTariff,
  listAdminTariffs,
  setAdminTariffStatus,
  updateAdminTariff
} from "../tariffs/tariffs.service.js";
import { calculatePricingComponents } from "../orders/order-pricing.service.js";

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

const BoundaryPoint = z.tuple([
  z.coerce.number().min(-180).max(180),
  z.coerce.number().min(-90).max(90)
]);

const RegionCreate = z.object({
  code: z.string().trim().toUpperCase().min(2).max(32),
  name: z.string().trim().min(2).max(120),
  boundary: z.array(BoundaryPoint).min(4),
  centerLat: z.coerce.number().min(-90).max(90),
  centerLng: z.coerce.number().min(-180).max(180),
  currency: z.string().trim().min(2).max(8).default("KZT"),
  isActive: z.boolean().default(true)
});

const RegionUpdate = RegionCreate.partial().refine(value => Object.keys(value).length > 0, "at least one field is required");

const DriverRegionApprovalUpdate = z.object({
  regionId: z.string().uuid(),
  status: z.enum(["APPROVED", "BLOCKED"]),
  reason: z.string().trim().max(300).optional().default("")
});

const TariffBase = {
  regionId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  displayName: z.string().trim().max(120).optional().default(""),
  description: z.string().trim().max(500).optional().default(""),
  basePrice: z.coerce.number().int().min(0).max(1000000),
  pricePerKm: z.coerce.number().int().min(0).max(1000000),
  pricePerMinute: z.coerce.number().int().min(0).max(1000000),
  minimumPrice: z.coerce.number().int().min(0).max(1000000),
  serviceCommissionPercent: z.coerce.number().min(0).max(100),
  cashbackPercent: z.coerce.number().min(0).max(100).optional().default(0),
  surgeMultiplier: z.coerce.number().min(1).max(10),
  freeWaitingMinutes: z.coerce.number().int().min(0).max(300).default(0),
  waitingPricePerMinute: z.coerce.number().int().min(0).max(1000000).default(0),
  cancellationFee: z.coerce.number().int().min(0).max(1000000).default(0),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
  isActive: z.boolean().default(true)
};

const TariffCreate = z.object(TariffBase);
const TariffUpdate = z.object(Object.fromEntries(
  Object.entries(TariffBase).map(([key, schema]) => [key, schema.optional()])
)).refine(value => Object.keys(value).length > 0, "at least one field is required");

const TariffStatusUpdate = z.object({
  isActive: z.boolean()
});

const TariffPreviewDraft = z.object({
  basePrice: z.coerce.number().int().min(0).max(1000000),
  pricePerKm: z.coerce.number().int().min(0).max(1000000),
  pricePerMinute: z.coerce.number().int().min(0).max(1000000),
  minimumPrice: z.coerce.number().int().min(0).max(1000000),
  serviceCommissionPercent: z.coerce.number().min(0).max(100),
  surgeMultiplier: z.coerce.number().min(1).max(10),
  freeWaitingMinutes: z.coerce.number().int().min(0).max(300).default(0),
  waitingPricePerMinute: z.coerce.number().int().min(0).max(1000000).default(0),
  cancellationFee: z.coerce.number().int().min(0).max(1000000).default(0)
});

const TariffPricePreview = z.object({
  regionId: z.string().uuid().optional(),
  tariffId: z.string().uuid().optional(),
  tariff: TariffPreviewDraft.optional(),
  distanceKm: z.coerce.number().gt(0).max(300),
  durationMin: z.coerce.number().gt(0).max(600),
  waitingMinutes: z.coerce.number().min(0).max(1440).default(0),
  includeCancellationFee: z.boolean().optional().default(false)
}).passthrough();

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

function numberValue(row, key) {
  return Number(row?.[key] || 0);
}

function draftToTariffRow(draft) {
  return {
    id: draft.id || "preview",
    region_id: draft.regionId || draft.region_id || null,
    name: draft.name || "Preview",
    display_name: draft.displayName || draft.display_name || draft.name || "Preview",
    base_price: draft.basePrice ?? draft.base_price,
    price_per_km: draft.pricePerKm ?? draft.price_per_km,
    price_per_minute: draft.pricePerMinute ?? draft.price_per_minute,
    min_price: draft.minimumPrice ?? draft.minPrice ?? draft.min_price,
    service_commission_percent: draft.serviceCommissionPercent ?? draft.service_commission_percent,
    cashback_percent: draft.cashbackPercent ?? draft.cashback_percent ?? 0,
    surge_multiplier: draft.surgeMultiplier ?? draft.surge_multiplier,
    free_waiting_minutes: draft.freeWaitingMinutes ?? draft.free_waiting_minutes ?? 0,
    waiting_price_per_minute: draft.waitingPricePerMinute ?? draft.waiting_price_per_minute ?? 0,
    cancellation_fee: draft.cancellationFee ?? draft.cancellation_fee ?? 0,
    sort_order: draft.sortOrder ?? draft.sort_order ?? 0,
    is_active: true
  };
}

router.get("/dashboard", requireAuth, requireRole("OWNER", "OPERATOR", "FINANCE"), async (req, res, next) => {
  try {
    const [
      regions,
      drivers,
      orders,
      applications,
      settings
    ] = await Promise.all([
      query("SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE is_active)::int active FROM regions"),
      query(`
        SELECT COUNT(*)::int total,
               COUNT(*) FILTER (WHERE status='FREE')::int online,
               COUNT(*) FILTER (WHERE status='BUSY')::int busy,
               COUNT(*) FILTER (WHERE is_blocked)::int blocked
        FROM drivers
      `),
      query(`
        SELECT COUNT(*)::int total,
               COUNT(*) FILTER (WHERE status='NEW')::int searching,
               COUNT(*) FILTER (WHERE status IN ('DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS'))::int active,
               COUNT(*) FILTER (WHERE status='COMPLETED')::int completed
        FROM orders
      `),
      query("SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE status='PENDING')::int pending FROM driver_applications"),
      query("SELECT * FROM service_settings WHERE id=1")
    ]);

    res.json({
      user: req.user,
      settings: settings.rows[0] ? mapSettings(settings.rows[0]) : null,
      cards: [
        {
          key: "regions",
          label: "Активные регионы",
          value: numberValue(regions.rows[0], "active"),
          hint: `Всего регионов: ${numberValue(regions.rows[0], "total")}`
        },
        {
          key: "drivers",
          label: "Водители на линии",
          value: numberValue(drivers.rows[0], "online"),
          hint: `Заняты: ${numberValue(drivers.rows[0], "busy")}`
        },
        {
          key: "orders",
          label: "Активные заказы",
          value: numberValue(orders.rows[0], "active"),
          hint: `В поиске: ${numberValue(orders.rows[0], "searching")}`
        },
        {
          key: "applications",
          label: "Заявки водителей",
          value: numberValue(applications.rows[0], "pending"),
          hint: `Всего заявок: ${numberValue(applications.rows[0], "total")}`
        }
      ],
      summary: {
        regions: regions.rows[0],
        drivers: drivers.rows[0],
        orders: orders.rows[0],
        applications: applications.rows[0]
      }
    });
  } catch (error) { next(error); }
});

router.get("/drivers", requireAuth, requireRole("OWNER", "OPERATOR", "FINANCE"), async (_req, res, next) => {
  try {
    const result = await query(`
      SELECT d.id, d.name, d.phone, d.car_model, d.car_color, d.plate, d.status,
             d.rating, d.balance, d.debt, d.is_blocked, d.last_seen_at, d.created_at,
             r.name region_name,
             COUNT(o.id)::int total_orders,
             COUNT(o.id) FILTER (WHERE o.status='COMPLETED')::int completed_orders
      FROM drivers d
      LEFT JOIN regions r ON r.id=d.current_region_id
      LEFT JOIN orders o ON o.driver_id=d.id
      GROUP BY d.id, r.name
      ORDER BY d.created_at DESC
      LIMIT 100
    `);
    res.json({ drivers: result.rows });
  } catch (error) { next(error); }
});

router.get("/drivers/:id", requireAuth, requireRole("OWNER", "OPERATOR", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const driver = (await query(`
      SELECT d.*, r.name region_name, r.code region_code,
             active.id active_order_id,
             active.short_id active_order_short_id,
             active.status active_order_status,
             active.pickup_text active_order_pickup,
             active.dropoff_text active_order_dropoff
      FROM drivers d
      LEFT JOIN regions r ON r.id=d.current_region_id
      LEFT JOIN LATERAL (
        SELECT id, short_id, status, pickup_text, dropoff_text
        FROM orders
        WHERE driver_id=d.id AND status=ANY($2::text[])
        ORDER BY created_at DESC
        LIMIT 1
      ) active ON true
      WHERE d.id=$1
    `, [params.id, ["DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS"]])).rows[0];
    if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
    const approvals = await listDriverRegionApprovals(params.id, query);
    res.json({
      driver,
      activeOrder: driver.active_order_id ? {
        id: driver.active_order_id,
        shortId: driver.active_order_short_id,
        status: driver.active_order_status,
        pickupText: driver.active_order_pickup,
        dropoffText: driver.active_order_dropoff
      } : null,
      regions: approvals.map(publicDriverRegionApproval)
    });
  } catch (error) { next(error); }
});

router.patch("/drivers/:id/block", requireAuth, requireRole("OWNER", "OPERATOR"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({
      isBlocked: z.boolean(),
      reason: z.string().trim().max(300).optional().default("")
    }).parse(req.body);
    const driver = await tx(async client => {
      const before = (await client.query("SELECT * FROM drivers WHERE id=$1 FOR UPDATE", [params.id])).rows[0];
      if (!before) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
      const updated = (await client.query(`
        UPDATE drivers
        SET is_blocked=$1,
            status=CASE WHEN $1=true THEN 'OFFLINE' ELSE status END,
            current_region_id=CASE WHEN $1=true THEN NULL ELSE current_region_id END,
            last_seen_at=NOW()
        WHERE id=$2
        RETURNING *
      `, [body.isBlocked, params.id])).rows[0];
      await writeAudit(client, {
        action: body.isBlocked ? "driver_blocked" : "driver_unblocked",
        actorUserId: req.user.id,
        entityType: "driver",
        entityId: params.id,
        metadata: { before: { isBlocked: before.is_blocked, status: before.status, regionId: before.current_region_id }, reason: body.reason },
        req
      });
      return updated;
    });
    res.json({ driver });
  } catch (error) { next(error); }
});

router.get("/audit-logs", requireAuth, requireRole("OWNER", "OPERATOR", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(100)
    }).parse(req.query);
    const result = await query(`
      SELECT a.id, a.action, a.actor_user_id, a.entity_type, a.entity_id,
             a.metadata, a.ip, a.user_agent, a.created_at,
             u.name actor_name, u.role actor_role
      FROM audit_logs a
      LEFT JOIN users u ON u.id=a.actor_user_id
      ORDER BY a.created_at DESC
      LIMIT $1
    `, [params.limit]);
    res.json({ logs: result.rows });
  } catch (error) { next(error); }
});

router.get("/regions", requireAuth, requireRole("OWNER", "OPERATOR", "FINANCE"), async (_req, res, next) => {
  try {
    const regions = await listRegions(query);
    res.json({ regions: regions.map(publicRegion) });
  } catch (error) { next(error); }
});

router.post("/regions", requireAuth, requireRole("OWNER"), async (req, res, next) => {
  try {
    const body = RegionCreate.parse(req.body);
    const region = await tx(async client => {
      const created = await createRegion(body, client);
      await writeAudit(client, {
        action: "region_created",
        actorUserId: req.user.id,
        entityType: "region",
        entityId: created.id,
        metadata: { code: created.code, isActive: created.is_active },
        req
      });
      return created;
    });
    res.status(201).json({ region: publicRegion(region) });
  } catch (error) { next(error); }
});

router.patch("/regions/:id", requireAuth, requireRole("OWNER"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = RegionUpdate.parse(req.body);
    const result = await tx(async client => {
      const updated = await updateRegion(params.id, body, client);
      await writeAudit(client, {
        action: "region_updated",
        actorUserId: req.user.id,
        entityType: "region",
        entityId: params.id,
        metadata: { before: updated.before, after: updated.region },
        req
      });
      return updated;
    });
    res.json({ region: publicRegion(result.region) });
  } catch (error) { next(error); }
});

router.delete("/regions/:id", requireAuth, requireRole("OWNER"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const result = await tx(async client => {
      const updated = await setRegionActive(params.id, false, client);
      await writeAudit(client, {
        action: "region_deactivated",
        actorUserId: req.user.id,
        entityType: "region",
        entityId: params.id,
        metadata: { before: updated.before, after: updated.region },
        req
      });
      return updated;
    });
    res.json({ region: publicRegion(result.region) });
  } catch (error) { next(error); }
});

router.get("/tariffs", requireAuth, requireRole("OWNER", "OPERATOR", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({
      regionId: z.string().uuid().optional()
    }).parse(req.query);
    const tariffs = await listAdminTariffs(params, query);
    res.json({ tariffs: tariffs.map(adminTariff) });
  } catch (error) { next(error); }
});

router.post("/tariffs/preview-price", requireAuth, requireRole("OWNER", "OPERATOR", "FINANCE"), async (req, res, next) => {
  try {
    const body = TariffPricePreview.parse(req.body);
    let tariff;
    let currency = "KZT";

    if (body.tariffId) {
      tariff = await getAdminTariff(body.tariffId, query);
      if (body.regionId && tariff.region_id !== body.regionId) {
        throw new AppError("Tariff does not belong to selected region", 409, "TARIFF_REGION_MISMATCH");
      }
      currency = tariff.currency || currency;
    } else {
      const draft = TariffPreviewDraft.parse(body.tariff || body);
      tariff = draftToTariffRow(draft);
      if (body.regionId) {
        const region = (await query("SELECT currency FROM regions WHERE id=$1", [body.regionId])).rows[0];
        if (!region) throw new AppError("Region not found", 404, "REGION_NOT_FOUND");
        currency = region.currency || currency;
      }
    }

    const preview = calculatePricingComponents(tariff, {
      distanceKm: body.distanceKm,
      durationMin: body.durationMin,
      waitingMinutes: body.waitingMinutes,
      includeCancellationFee: body.includeCancellationFee
    });

    const response = {
      ...preview,
      currency,
      tariff: adminTariff(tariff)
    };
    res.json({ ...response, preview: response });
  } catch (error) { next(error); }
});

router.post("/tariffs", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const body = TariffCreate.parse(req.body);
    const tariff = await tx(async client => {
      const region = (await client.query("SELECT id FROM regions WHERE id=$1", [body.regionId])).rows[0];
      if (!region) throw new AppError("Region not found", 404, "REGION_NOT_FOUND");
      const created = await createAdminTariff(body, client);
      await writeAudit(client, {
        action: "tariff_created",
        actorUserId: req.user.id,
        entityType: "tariff",
        entityId: created.id,
        metadata: { regionId: created.region_id, name: created.name, isActive: created.is_active },
        req
      });
      return created;
    });
    res.status(201).json({ tariff: adminTariff(await getAdminTariff(tariff.id, query)) });
  } catch (error) { next(error); }
});

router.patch("/tariffs/:id", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = TariffUpdate.parse(req.body);
    const result = await tx(async client => {
      if (body.regionId) {
        const region = (await client.query("SELECT id FROM regions WHERE id=$1", [body.regionId])).rows[0];
        if (!region) throw new AppError("Region not found", 404, "REGION_NOT_FOUND");
      }
      const updated = await updateAdminTariff(params.id, body, client);
      await writeAudit(client, {
        action: "tariff_updated",
        actorUserId: req.user.id,
        entityType: "tariff",
        entityId: params.id,
        metadata: { before: updated.before, after: updated.tariff },
        req
      });
      return updated.tariff;
    });
    res.json({ tariff: adminTariff(await getAdminTariff(result.id, query)) });
  } catch (error) { next(error); }
});

router.patch("/tariffs/:id/status", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = TariffStatusUpdate.parse(req.body);
    const result = await tx(async client => {
      const updated = await setAdminTariffStatus(params.id, body.isActive, client);
      await writeAudit(client, {
        action: body.isActive ? "tariff_activated" : "tariff_deactivated",
        actorUserId: req.user.id,
        entityType: "tariff",
        entityId: params.id,
        metadata: { before: updated.before, after: updated.tariff },
        req
      });
      return updated.tariff;
    });
    res.json({ tariff: adminTariff(await getAdminTariff(result.id, query)) });
  } catch (error) { next(error); }
});

router.get("/drivers/:id/regions", requireAuth, requireRole("OWNER"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const driver = (await query("SELECT * FROM drivers WHERE id=$1", [params.id])).rows[0];
    if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
    const regions = await listDriverRegionApprovals(params.id, query);
    res.json({ driver, regions: regions.map(publicDriverRegionApproval) });
  } catch (error) { next(error); }
});

router.patch("/drivers/:id/regions", requireAuth, requireRole("OWNER"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = DriverRegionApprovalUpdate.parse(req.body);
    const result = await tx(async client => {
      const updated = await setDriverRegionApproval({
        driverId: params.id,
        regionId: body.regionId,
        status: body.status,
        adminUserId: req.user.id,
        reason: body.reason
      }, client);
      await writeAudit(client, {
        action: body.status === "APPROVED" ? "driver_region_approved" : "driver_region_blocked",
        actorUserId: req.user.id,
        entityType: "driver_region_approval",
        entityId: updated.approval.id,
        metadata: { driverId: params.id, regionId: body.regionId, status: body.status, reason: body.reason },
        req
      });
      return updated;
    });
    res.json({
      approval: publicDriverRegionApproval(result.approval),
      driver: result.driver
    });
  } catch (error) { next(error); }
});

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
