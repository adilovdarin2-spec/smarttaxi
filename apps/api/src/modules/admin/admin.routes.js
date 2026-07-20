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
  listAdminTariffAnalytics,
  listAdminTariffs,
  setAdminTariffStatus,
  updateAdminTariff
} from "../tariffs/tariffs.service.js";
import { calculatePricingComponents } from "../orders/order-pricing.service.js";
import {
  adjustDriverDebt,
  exportFinanceTransactionsCsv,
  getDriverDebts,
  getFinanceReports,
  getFinanceSummary,
  getTransactions
} from "../finance/finance.service.js";
import { publicPayoutRequest, reviewPayoutRequest } from "../wallet/wallet.service.js";
import { broadcastNotification, notifyUser } from "../notifications/notification.service.js";
import {
  getDriverDocumentById,
  listDocumentsForApplication,
  listDocumentsForDriver,
  publicDriverDocument,
  reviewDriverDocument
} from "../driver-documents/driver-documents.service.js";
import { UPLOAD_ROOT } from "../driver-documents/upload.middleware.js";
import {
  ACTIVE_ORDER_STATUSES,
  OPEN_ORDER_STATUSES,
  SETTLED_ORDER_STATUSES
} from "../orders/order-dispatch.service.js";
import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";

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
  sosPhone: z.string().trim().min(3).max(32).optional(),
  referralBonusKzt: z.coerce.number().int().min(0).max(1_000_000).optional()
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

const TariffAnalyticsQuery = z.object({
  regionId: z.string().uuid().optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional()
});

const FinanceQuery = z.object({
  regionId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  tariffId: z.string().uuid().optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  type: z.enum(["ORDER_COMPLETED", "ORDER_CANCELLED", "DRIVER_DEBT_CREATED", "DRIVER_DEBT_ADJUSTED", "MANUAL_ADJUSTMENT"]).optional(),
  paymentMethod: z.enum(["CASH", "KASPI_TRANSFER", "UNKNOWN"]).optional(),
  status: z.enum(["POSTED", "VOIDED"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0)
});

const FinanceReportQuery = FinanceQuery.extend({
  groupBy: z.enum(["day", "region", "driver", "tariff", "paymentMethod"]).default("day")
});

const AdminRoadAlertQuery = z.object({
  regionId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "ALL"]).default("ACTIVE"),
  limit: z.coerce.number().int().min(1).max(200).default(100)
});

const FinanceDebtAdjustment = z.object({
  amount: z.coerce.number().finite().refine(value => value !== 0, "amount must not be zero"),
  reason: z.string().trim().min(3).max(500),
  regionId: z.string().uuid().optional(),
  metadata: z.record(z.any()).optional().default({})
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
    referralBonusKzt: Number(row.referral_bonus_kzt),
    updatedAt: row.updated_at
  };
}

function publicAdminRoadAlert(row) {
  return {
    id: row.id,
    regionId: row.region_id,
    regionName: row.region_name,
    driverId: row.driver_id,
    driverName: row.driver_name,
    driverPhone: row.driver_phone,
    type: row.type,
    comment: row.comment || "",
    lat: Number(row.lat),
    lng: Number(row.lng),
    status: row.status,
    confirmationsCount: Number(row.confirmations_count || 0),
    dismissalsCount: Number(row.dismissals_count || 0),
    confidenceScore: Number(row.confidence_score || 50),
    speedLimit: row.speed_limit == null ? null : Number(row.speed_limit),
    createdAt: row.created_at,
    expiresAt: row.expires_at
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

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(value, field) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(`${field} must use YYYY-MM-DD`, 400, "VALIDATION_ERROR");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || dateOnly(parsed) !== value) {
    throw new AppError(`${field} must be a valid date`, 400, "VALIDATION_ERROR");
  }
  return value;
}

function resolveTariffAnalyticsDateRange(params) {
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(today.getUTCDate() - 29);

  const dateFrom = parseDateOnly(params.dateFrom, "dateFrom") || dateOnly(defaultFrom);
  const dateTo = parseDateOnly(params.dateTo, "dateTo") || dateOnly(today);
  if (dateFrom > dateTo) {
    throw new AppError("dateFrom must be before dateTo", 400, "VALIDATION_ERROR");
  }

  return {
    dateFrom,
    dateTo,
    preset: params.dateFrom || params.dateTo ? "CUSTOM" : "LAST_30_DAYS"
  };
}

function resolveFinanceDateRange(params) {
  return resolveTariffAnalyticsDateRange(params);
}

function summarizeTariffAnalytics(analytics) {
  const totals = analytics.reduce((acc, item) => ({
    orderCount: acc.orderCount + item.orderCount,
    completedOrderCount: acc.completedOrderCount + item.completedOrderCount,
    cancelledOrderCount: acc.cancelledOrderCount + item.cancelledOrderCount,
    grossTotal: acc.grossTotal + item.grossTotal,
    serviceCommissionTotal: acc.serviceCommissionTotal + item.serviceCommissionTotal,
    driverEarningTotal: acc.driverEarningTotal + item.driverEarningTotal
  }), {
    orderCount: 0,
    completedOrderCount: 0,
    cancelledOrderCount: 0,
    grossTotal: 0,
    serviceCommissionTotal: 0,
    driverEarningTotal: 0
  });

  return {
    ...totals,
    averageFinalPrice: totals.completedOrderCount ? Math.round(totals.grossTotal / totals.completedOrderCount) : null,
    completedSharePercent: totals.orderCount ? Math.round((totals.completedOrderCount / totals.orderCount) * 1000) / 10 : null
  };
}

router.get("/dashboard", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const [
      regions,
      drivers,
      orders,
      applications,
      settings,
      highDebtDrivers,
      frequentCancelClients,
      activeRoadAlerts,
      lowReviews
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
               COUNT(*) FILTER (WHERE status = ANY($1::text[]))::int searching,
               COUNT(*) FILTER (WHERE status = ANY($1::text[]) AND created_at < NOW() - INTERVAL '3 minutes')::int stuck,
               COUNT(*) FILTER (WHERE status = ANY($2::text[]))::int active,
               COUNT(*) FILTER (WHERE status = ANY($3::text[]))::int completed
        FROM orders
      `, [OPEN_ORDER_STATUSES, ACTIVE_ORDER_STATUSES, SETTLED_ORDER_STATUSES]),
      query("SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE status='PENDING')::int pending FROM driver_applications"),
      query("SELECT * FROM service_settings WHERE id=1"),
      // 15000 is the hard debt ceiling that blocks a driver from accepting
      // new orders (order-dispatch.service.js) — this is an early warning
      // well before that, not a duplicate of it.
      query("SELECT COUNT(*)::int total FROM drivers WHERE debt > 10000 AND NOT is_blocked"),
      // A real, grounded abuse signal from data that already exists (no
      // fraud-score fabrication) — a client cancelling repeatedly in a
      // short window is worth a human look, win or lose either way.
      query(`
        SELECT COUNT(*)::int total FROM (
          SELECT client_id FROM orders
          WHERE status='CANCELLED_BY_CLIENT' AND created_at > NOW() - INTERVAL '7 days' AND client_id IS NOT NULL
          GROUP BY client_id
          HAVING COUNT(*) >= 3
        ) frequent_cancellers
      `),
      query("SELECT COUNT(*)::int total FROM road_alerts WHERE status='ACTIVE'"),
      query("SELECT COUNT(*)::int total FROM driver_reviews WHERE rating <= 3 AND created_at > NOW() - INTERVAL '30 days'")
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
        applications: applications.rows[0],
        attention: {
          highDebtDrivers: highDebtDrivers.rows[0].total,
          frequentCancelClients: frequentCancelClients.rows[0].total,
          activeRoadAlerts: activeRoadAlerts.rows[0].total,
          lowReviews: lowReviews.rows[0].total
        }
      }
    });
  } catch (error) { next(error); }
});

router.get("/drivers", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(100),
      offset: z.coerce.number().int().min(0).default(0)
    }).parse(req.query);
    const total = await query("SELECT COUNT(*)::int total FROM drivers");
    const result = await query(`
      SELECT d.id, d.name, d.phone, d.car_model, d.car_color, d.plate, d.status,
             d.rating, d.balance, d.debt, d.is_blocked, d.last_seen_at, d.created_at,
             d.current_region_id, r.name region_name,
             COUNT(o.id)::int total_orders,
             COUNT(o.id) FILTER (WHERE o.status='COMPLETED')::int completed_orders
      FROM drivers d
      LEFT JOIN regions r ON r.id=d.current_region_id
      LEFT JOIN orders o ON o.driver_id=d.id
      GROUP BY d.id, r.name
      ORDER BY d.created_at DESC
      LIMIT $1 OFFSET $2
    `, [params.limit, params.offset]);
    res.json({ drivers: result.rows, total: total.rows[0].total, limit: params.limit, offset: params.offset });
  } catch (error) { next(error); }
});

router.get("/drivers/:id", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const driver = (await query(`
      SELECT d.*, r.name region_name, r.code region_code,
             active.id active_order_id,
             active.short_id active_order_short_id,
             active.status active_order_status,
             active.pickup_text active_order_pickup,
             active.dropoff_text active_order_dropoff,
             co.percent commission_override_percent,
             co.active commission_override_active,
             co.updated_at commission_override_updated_at
      FROM drivers d
      LEFT JOIN regions r ON r.id=d.current_region_id
      LEFT JOIN LATERAL (
        SELECT id, short_id, status, pickup_text, dropoff_text
        FROM orders
        WHERE driver_id=d.id AND status=ANY($2::text[])
        ORDER BY created_at DESC
        LIMIT 1
      ) active ON true
      LEFT JOIN commission_overrides co ON co.driver_id=d.id
      WHERE d.id=$1
    `, [params.id, ["DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS"]])).rows[0];
    if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
    const [approvals, clientPreferences, driverPreferences] = await Promise.all([
      listDriverRegionApprovals(params.id, query),
      query(`
        SELECT cdp.type, cdp.created_at, c.id client_id, c.name client_name, c.phone client_phone
        FROM client_driver_preferences cdp
        JOIN clients c ON c.id=cdp.client_id
        WHERE cdp.driver_id=$1
        ORDER BY cdp.created_at DESC
      `, [params.id]),
      query(`
        SELECT dcp.type, dcp.created_at, c.id client_id, c.name client_name, c.phone client_phone
        FROM driver_client_preferences dcp
        JOIN clients c ON c.id=dcp.client_id
        WHERE dcp.driver_id=$1
        ORDER BY dcp.created_at DESC
      `, [params.id])
    ]);
    const mapClientPreference = row => ({
      clientId: row.client_id,
      clientName: row.client_name,
      clientPhone: row.client_phone,
      type: row.type,
      createdAt: row.created_at
    });
    res.json({
      driver,
      activeOrder: driver.active_order_id ? {
        id: driver.active_order_id,
        shortId: driver.active_order_short_id,
        status: driver.active_order_status,
        pickupText: driver.active_order_pickup,
        dropoffText: driver.active_order_dropoff
      } : null,
      commissionOverride: driver.commission_override_percent !== null ? {
        percent: Number(driver.commission_override_percent),
        active: driver.commission_override_active,
        updatedAt: driver.commission_override_updated_at
      } : null,
      regions: approvals.map(publicDriverRegionApproval),
      // How clients feel about this driver (client_driver_preferences) vs.
      // how this driver feels about clients (driver_client_preferences) —
      // read-only visibility for support investigating a dispute; managing
      // these stays a client/driver self-service action, admin doesn't
      // create or remove entries here.
      clientPreferences: clientPreferences.rows.map(mapClientPreference),
      driverPreferences: driverPreferences.rows.map(mapClientPreference)
    });
  } catch (error) { next(error); }
});

router.patch("/drivers/:id/block", requireAuth, requireRole("OWNER"), async (req, res, next) => {
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

function publicCommissionOverride(row) {
  return {
    driverId: row.driver_id,
    driverName: row.driver_name || null,
    driverPhone: row.driver_phone || null,
    driverPlate: row.driver_plate || null,
    percent: Number(row.percent),
    active: row.active,
    updatedAt: row.updated_at
  };
}

const CommissionOverrideBody = z.object({
  percent: z.coerce.number().min(0).max(100),
  active: z.boolean().optional().default(true)
});

// commission_overrides was defined in the schema from the start but never
// read anywhere — wiring it up here (admin CRUD) and in
// orders.routes.js#updateStatus (TRIP_COMPLETED), where an active override
// replaces the tariff's flat service_commission_percent for that driver's
// trip. Deliberately not retroactive: only ever read at the moment a trip
// completes, never re-applied to orders that already finished.
router.get("/commission-overrides", requireAuth, requireRole("OWNER", "FINANCE"), async (_req, res, next) => {
  try {
    const rows = (await query(`
      SELECT co.*, d.name AS driver_name, d.phone AS driver_phone, d.plate AS driver_plate
      FROM commission_overrides co
      JOIN drivers d ON d.id=co.driver_id
      ORDER BY co.updated_at DESC
    `)).rows;
    res.json({ commissionOverrides: rows.map(publicCommissionOverride) });
  } catch (error) { next(error); }
});

router.put("/commission-overrides/:driverId", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({ driverId: z.string().uuid() }).parse(req.params);
    const body = CommissionOverrideBody.parse(req.body);
    const driver = (await query("SELECT id FROM drivers WHERE id=$1", [params.driverId])).rows[0];
    if (!driver) throw new AppError("Driver not found", 404, "DRIVER_NOT_FOUND");
    const row = (await query(`
      INSERT INTO commission_overrides(driver_id, percent, active, updated_at)
      VALUES($1,$2,$3,NOW())
      ON CONFLICT (driver_id) DO UPDATE SET percent=EXCLUDED.percent, active=EXCLUDED.active, updated_at=NOW()
      RETURNING *
    `, [params.driverId, body.percent, body.active])).rows[0];
    await writeAudit(query, {
      action: "commission_override_set",
      actorUserId: req.user.id,
      entityType: "driver",
      entityId: params.driverId,
      metadata: { percent: body.percent, active: body.active },
      req
    });
    res.status(201).json({ commissionOverride: publicCommissionOverride({ ...row, driver_name: null, driver_phone: null, driver_plate: null }) });
  } catch (error) { next(error); }
});

router.delete("/commission-overrides/:driverId", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({ driverId: z.string().uuid() }).parse(req.params);
    const row = (await query("DELETE FROM commission_overrides WHERE driver_id=$1 RETURNING driver_id", [params.driverId])).rows[0];
    if (!row) throw new AppError("Commission override not found", 404, "COMMISSION_OVERRIDE_NOT_FOUND");
    await writeAudit(query, {
      action: "commission_override_removed",
      actorUserId: req.user.id,
      entityType: "driver",
      entityId: params.driverId,
      req
    });
    res.status(204).end();
  } catch (error) { next(error); }
});

router.get("/audit-logs", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(100),
      offset: z.coerce.number().int().min(0).default(0)
    }).parse(req.query);
    const total = await query("SELECT COUNT(*)::int total FROM audit_logs");
    const result = await query(`
      SELECT a.id, a.action, a.actor_user_id, a.entity_type, a.entity_id,
             a.metadata, a.ip, a.user_agent, a.created_at,
             u.name actor_name, u.role actor_role
      FROM audit_logs a
      LEFT JOIN users u ON u.id=a.actor_user_id
      ORDER BY a.created_at DESC
      LIMIT $1 OFFSET $2
    `, [params.limit, params.offset]);
    res.json({ logs: result.rows, total: total.rows[0].total, limit: params.limit, offset: params.offset });
  } catch (error) { next(error); }
});

const BroadcastNotification = z.object({
  segment: z.enum(["ALL_CLIENTS", "ALL_DRIVERS", "REGION_DRIVERS"]),
  regionId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(400)
}).refine(
  data => data.segment !== "REGION_DRIVERS" || Boolean(data.regionId),
  { message: "regionId is required for REGION_DRIVERS", path: ["regionId"] }
);

// OWNER-only: this reaches every client or every driver at once (or a
// whole region's drivers) — a broader blast radius than any other single
// admin action, so it doesn't get the FINANCE-can-also-do-this treatment
// most of this file's read/finance actions do.
router.post("/notifications/broadcast", requireAuth, requireRole("OWNER"), async (req, res, next) => {
  try {
    const body = BroadcastNotification.parse(req.body);
    const result = await broadcastNotification(body);
    await writeAudit(query, {
      action: "notification_broadcast",
      actorUserId: req.user.id,
      entityType: "broadcast",
      metadata: { segment: body.segment, regionId: body.regionId || null, title: body.title, recipientCount: result.recipientCount },
      req
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

router.get("/road-alerts", requireAuth, requireRole("OWNER"), async (req, res, next) => {
  try {
    const params = AdminRoadAlertQuery.parse(req.query);
    const filters = [];
    const values = [];
    if (params.regionId) {
      values.push(params.regionId);
      filters.push(`ra.region_id=$${values.length}`);
    }
    if (params.status !== "ALL") {
      values.push(params.status);
      filters.push(`ra.status=$${values.length}`);
    }
    values.push(params.limit);
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const result = await query(`
      SELECT
        ra.*,
        r.name AS region_name,
        d.name AS driver_name,
        d.phone AS driver_phone
      FROM road_alerts ra
      LEFT JOIN regions r ON r.id=ra.region_id
      LEFT JOIN drivers d ON d.id=ra.driver_id
      ${where}
      ORDER BY ra.created_at DESC
      LIMIT $${values.length}
    `, values);
    res.json({ alerts: result.rows.map(publicAdminRoadAlert) });
  } catch (error) { next(error); }
});

router.patch("/road-alerts/:id/expire", requireAuth, requireRole("OWNER"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const result = await query(`
      UPDATE road_alerts
      SET status='EXPIRED',
          expires_at=LEAST(expires_at, NOW()),
          confidence_score=GREATEST(0, confidence_score - 25)
      WHERE id=$1
      RETURNING *
    `, [params.id]);
    if (!result.rows[0]) throw new AppError("Road alert not found", 404, "ROAD_ALERT_NOT_FOUND");
    await writeAudit(query, {
      action: "road_alert_moderated",
      actorUserId: req.user.id,
      entityType: "road_alert",
      entityId: params.id,
      metadata: { status: "EXPIRED" },
      req
    });
    res.json({ alert: publicAdminRoadAlert(result.rows[0]) });
  } catch (error) { next(error); }
});

router.get("/regions", requireAuth, requireRole("OWNER", "FINANCE"), async (_req, res, next) => {
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

router.get("/tariffs", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({
      regionId: z.string().uuid().optional()
    }).parse(req.query);
    const tariffs = await listAdminTariffs(params, query);
    res.json({ tariffs: tariffs.map(adminTariff) });
  } catch (error) { next(error); }
});

router.get("/tariffs/analytics", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = TariffAnalyticsQuery.parse(req.query);
    const dateRange = resolveTariffAnalyticsDateRange(params);
    const analytics = await listAdminTariffAnalytics({
      regionId: params.regionId,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo
    }, query);
    res.json({
      dateRange,
      analytics,
      totals: summarizeTariffAnalytics(analytics)
    });
  } catch (error) { next(error); }
});

router.get("/tariffs/:id/analytics", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const queryParams = TariffAnalyticsQuery.omit({ regionId: true }).parse(req.query);
    const dateRange = resolveTariffAnalyticsDateRange(queryParams);
    const analytics = await listAdminTariffAnalytics({
      tariffId: params.id,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo
    }, query);
    res.json({
      dateRange,
      analytics: analytics[0] || null,
      totals: summarizeTariffAnalytics(analytics)
    });
  } catch (error) { next(error); }
});

router.post("/tariffs/preview-price", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
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

const PromoCodeCreate = z.object({
  code: z.string().trim().min(2).max(40).transform(value => value.toUpperCase()),
  regionId: z.string().uuid().optional(),
  discountType: z.enum(["PERCENT", "FIXED"]),
  discountValue: z.coerce.number().int().positive(),
  maxDiscountKzt: z.coerce.number().int().positive().optional(),
  minOrderPriceKzt: z.coerce.number().int().min(0).default(0),
  usageLimit: z.coerce.number().int().positive().optional(),
  perClientLimit: z.coerce.number().int().positive().default(1),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional()
});

const PromoCodeStatusUpdate = z.object({ isActive: z.boolean() });

const RaffleCreate = z.object({
  title: z.string().trim().min(2).max(120),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime()
}).refine(body => new Date(body.endsAt) > new Date(body.startsAt), {
  message: "endsAt must be after startsAt",
  path: ["endsAt"]
});

function publicRaffle(raffle) {
  if (!raffle) return null;
  return {
    id: raffle.id,
    title: raffle.title,
    startsAt: raffle.starts_at,
    endsAt: raffle.ends_at,
    createdAt: raffle.created_at
  };
}

function publicPromoCode(promo) {
  if (!promo) return null;
  return {
    id: promo.id,
    code: promo.code,
    regionId: promo.region_id,
    discountType: promo.discount_type,
    discountValue: promo.discount_value,
    maxDiscountKzt: promo.max_discount_kzt,
    minOrderPriceKzt: promo.min_order_price_kzt,
    usageLimit: promo.usage_limit,
    perClientLimit: promo.per_client_limit,
    validFrom: promo.valid_from,
    validUntil: promo.valid_until,
    isActive: promo.is_active,
    createdAt: promo.created_at
  };
}

router.get("/promo-codes", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const rows = (await query("SELECT * FROM promo_codes ORDER BY created_at DESC")).rows;
    res.json({ promoCodes: rows.map(publicPromoCode) });
  } catch (error) { next(error); }
});

router.post("/promo-codes", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const body = PromoCodeCreate.parse(req.body);
    const created = await tx(async client => {
      const row = (await client.query(`
        INSERT INTO promo_codes(code, region_id, discount_type, discount_value, max_discount_kzt, min_order_price_kzt, usage_limit, per_client_limit, valid_from, valid_until)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
      `, [
        body.code,
        body.regionId || null,
        body.discountType,
        body.discountValue,
        body.maxDiscountKzt ?? null,
        body.minOrderPriceKzt,
        body.usageLimit ?? null,
        body.perClientLimit,
        body.validFrom ?? null,
        body.validUntil ?? null
      ])).rows[0];
      await writeAudit(client, {
        action: "promo_code_created",
        actorUserId: req.user.id,
        entityType: "promo_code",
        entityId: row.id,
        metadata: { code: row.code, discountType: row.discount_type, discountValue: row.discount_value },
        req
      });
      return row;
    });
    res.status(201).json({ promoCode: publicPromoCode(created) });
  } catch (error) {
    if (error.code === "23505") return next(new AppError("Promo code already exists", 409, "PROMO_CODE_EXISTS"));
    next(error);
  }
});

router.patch("/promo-codes/:id/status", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = PromoCodeStatusUpdate.parse(req.body);
    const updated = await tx(async client => {
      const row = (await client.query(
        "UPDATE promo_codes SET is_active=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
        [body.isActive, params.id]
      )).rows[0];
      if (!row) throw new AppError("Promo code not found", 404, "PROMO_NOT_FOUND");
      await writeAudit(client, {
        action: body.isActive ? "promo_code_activated" : "promo_code_deactivated",
        actorUserId: req.user.id,
        entityType: "promo_code",
        entityId: row.id,
        metadata: { code: row.code },
        req
      });
      return row;
    });
    res.json({ promoCode: publicPromoCode(updated) });
  } catch (error) { next(error); }
});

// Blocks deletion once a promo has real redemption history instead of
// cascading — a redeemed code is part of the financial record (it's what
// explains why an order's price doesn't match the tariff estimate), so
// losing that silently would make past orders' pricing_snapshot look wrong
// with no explanation. Deactivate (PATCH .../status) is the right tool for
// "stop this code from being used again"; delete is only for a code that
// was created by mistake and never actually used.
router.delete("/promo-codes/:id", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    await tx(async client => {
      const promo = (await client.query("SELECT * FROM promo_codes WHERE id=$1 FOR UPDATE", [params.id])).rows[0];
      if (!promo) throw new AppError("Promo code not found", 404, "PROMO_NOT_FOUND");
      const redemption = (await client.query(
        "SELECT id FROM promo_code_redemptions WHERE promo_code_id=$1 LIMIT 1",
        [params.id]
      )).rows[0];
      if (redemption) {
        throw new AppError(
          "Promo code has already been redeemed and can't be deleted — deactivate it instead",
          409,
          "PROMO_CODE_HAS_REDEMPTIONS"
        );
      }
      await client.query("DELETE FROM promo_codes WHERE id=$1", [params.id]);
      await writeAudit(client, {
        action: "promo_code_deleted",
        actorUserId: req.user.id,
        entityType: "promo_code",
        entityId: promo.id,
        metadata: { code: promo.code },
        req
      });
    });
    res.status(204).end();
  } catch (error) { next(error); }
});

function publicAdminRecurringBooking(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    driverId: row.driver_id,
    driverName: row.driver_name,
    driverPhone: row.driver_phone,
    pickupText: row.pickup_text,
    dropoffText: row.dropoff_text,
    daysOfWeek: row.days_of_week,
    timeOfDay: row.time_of_day,
    priceKzt: row.price_kzt,
    status: row.status,
    notes: row.notes || "",
    lastTriggeredDate: row.last_triggered_date,
    createdAt: row.created_at
  };
}

router.get("/recurring-bookings", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({
      status: z.enum(["PENDING_DRIVER", "ACTIVE", "PAUSED", "CANCELLED"]).optional()
    }).parse(req.query);
    const rows = (await query(`
      SELECT rb.*, c.name AS client_name, c.phone AS client_phone, d.name AS driver_name, d.phone AS driver_phone
      FROM recurring_bookings rb
      JOIN clients c ON c.id=rb.client_id
      JOIN drivers d ON d.id=rb.driver_id
      ${params.status ? "WHERE rb.status=$1" : ""}
      ORDER BY rb.created_at DESC
      LIMIT 200
    `, params.status ? [params.status] : [])).rows;
    res.json({ recurringBookings: rows.map(publicAdminRecurringBooking) });
  } catch (error) { next(error); }
});

// One row per referred client (not per client who has referred others) —
// mirrors how the invite actually happened: someone used someone else's
// code once, at registration.
router.get("/referrals", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const rows = (await query(`
      SELECT
        c.id,
        c.name AS invitee_name, c.phone AS invitee_phone,
        r.name AS inviter_name, r.phone AS inviter_phone,
        ct.created_at AS reward_credited_at,
        ct.amount AS reward_kzt
      FROM clients c
      JOIN clients r ON r.id = c.referred_by_client_id
      LEFT JOIN cashback_transactions ct ON ct.client_id = c.id AND ct.type = 'REFERRAL_BONUS'
      WHERE c.referred_by_client_id IS NOT NULL
      ORDER BY c.created_at DESC
      LIMIT 200
    `)).rows;
    res.json({
      referrals: rows.map(row => ({
        id: row.id,
        inviterName: row.inviter_name,
        inviterPhone: row.inviter_phone,
        inviteeName: row.invitee_name,
        inviteePhone: row.invitee_phone,
        rewardCreditedAt: row.reward_credited_at,
        rewardKzt: row.reward_kzt == null ? null : Number(row.reward_kzt)
      }))
    });
  } catch (error) { next(error); }
});

router.get("/finance/summary", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = FinanceQuery.omit({ driverId: true, tariffId: true, type: true, paymentMethod: true, status: true, limit: true, offset: true }).parse(req.query);
    const dateRange = resolveFinanceDateRange(params);
    const summary = await getFinanceSummary({
      regionId: params.regionId,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo
    }, query);
    res.json({ dateRange, summary });
  } catch (error) { next(error); }
});

router.get("/finance/driver-debts", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = FinanceQuery.omit({ tariffId: true, type: true, paymentMethod: true, status: true, limit: true, offset: true }).parse(req.query);
    const dateRange = resolveFinanceDateRange(params);
    const driverDebts = await getDriverDebts({
      regionId: params.regionId,
      driverId: params.driverId,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo
    }, query);
    res.json({ dateRange, driverDebts });
  } catch (error) { next(error); }
});

router.post("/finance/driver-debts/:driverId/adjust", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({ driverId: z.string().uuid() }).parse(req.params);
    const body = FinanceDebtAdjustment.parse(req.body);
    const transaction = await tx(async client => {
      if (body.regionId) {
        const region = (await client.query("SELECT id FROM regions WHERE id=$1", [body.regionId])).rows[0];
        if (!region) throw new AppError("Region not found", 404, "REGION_NOT_FOUND");
      }
      const created = await adjustDriverDebt({
        driverId: params.driverId,
        amount: body.amount,
        reason: body.reason,
        regionId: body.regionId,
        metadata: body.metadata,
        actorUserId: req.user.id
      }, client);
      await writeAudit(client, {
        action: "driver_debt_adjusted",
        actorUserId: req.user.id,
        entityType: "driver",
        entityId: params.driverId,
        metadata: { amount: body.amount, reason: body.reason, transactionId: created.id },
        req
      });
      return created;
    });
    res.status(201).json({ transaction });
  } catch (error) { next(error); }
});

router.get("/finance/reports", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = FinanceReportQuery.parse(req.query);
    const dateRange = resolveFinanceDateRange(params);
    const report = await getFinanceReports({
      regionId: params.regionId,
      driverId: params.driverId,
      tariffId: params.tariffId,
      type: params.type,
      paymentMethod: params.paymentMethod,
      status: params.status,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
      groupBy: params.groupBy
    }, query);
    res.json({ dateRange, groupBy: params.groupBy, rows: report.rows, totals: report.totals });
  } catch (error) { next(error); }
});

router.get("/finance/transactions.csv", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = FinanceQuery.parse(req.query);
    const dateRange = resolveFinanceDateRange(params);
    const csv = await exportFinanceTransactionsCsv({
      regionId: params.regionId,
      driverId: params.driverId,
      tariffId: params.tariffId,
      type: params.type,
      paymentMethod: params.paymentMethod,
      status: params.status,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
      limit: params.limit,
      offset: params.offset
    }, query);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"smarttaxi-finance-transactions.csv\"");
    res.send(csv);
  } catch (error) { next(error); }
});

router.get("/finance/transactions", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = FinanceQuery.parse(req.query);
    const dateRange = resolveFinanceDateRange(params);
    const transactions = await getTransactions({
      regionId: params.regionId,
      driverId: params.driverId,
      tariffId: params.tariffId,
      type: params.type,
      paymentMethod: params.paymentMethod,
      status: params.status,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
      limit: params.limit,
      offset: params.offset
    }, query);
    res.json({ dateRange, items: transactions.items, transactions: transactions.items, total: transactions.total, limit: transactions.limit, offset: transactions.offset });
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

router.get("/settings", requireAuth, requireRole("OWNER", "FINANCE"), async (_req, res, next) => {
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
      sosPhone: "sos_phone",
      referralBonusKzt: "referral_bonus_kzt"
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

router.get("/driver-applications", requireAuth, requireRole("OWNER"), async (req, res, next) => {
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

router.patch("/driver-applications/:id", requireAuth, requireRole("OWNER"), async (req, res, next) => {
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

router.get("/raffles", requireAuth, requireRole("OWNER", "FINANCE"), async (_req, res, next) => {
  try {
    const rows = (await query("SELECT * FROM raffles ORDER BY starts_at DESC")).rows;
    res.json({ raffles: rows.map(publicRaffle) });
  } catch (error) { next(error); }
});

router.post("/raffles", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const body = RaffleCreate.parse(req.body);
    const created = await tx(async client => {
      const row = (await client.query(`
        INSERT INTO raffles(title, starts_at, ends_at)
        VALUES($1,$2,$3)
        RETURNING *
      `, [body.title, body.startsAt, body.endsAt])).rows[0];
      await writeAudit(client, {
        action: "raffle_created",
        actorUserId: req.user.id,
        entityType: "raffle",
        entityId: row.id,
        metadata: { title: row.title, startsAt: row.starts_at, endsAt: row.ends_at },
        req
      });
      return row;
    });
    res.status(201).json({ raffle: publicRaffle(created) });
  } catch (error) { next(error); }
});

router.delete("/raffles/:id", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const deleted = await tx(async client => {
      const row = (await client.query("SELECT * FROM raffles WHERE id=$1", [params.id])).rows[0];
      if (!row) throw new AppError("Raffle not found", 404, "RAFFLE_NOT_FOUND");
      await client.query("DELETE FROM raffles WHERE id=$1", [params.id]);
      await writeAudit(client, {
        action: "raffle_deleted",
        actorUserId: req.user.id,
        entityType: "raffle",
        entityId: row.id,
        metadata: { title: row.title },
        req
      });
      return row;
    });
    res.json({ raffle: publicRaffle(deleted) });
  } catch (error) { next(error); }
});

router.get("/reviews", requireAuth, requireRole("OWNER"), async (_req, res, next) => {
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

router.delete("/reviews/:id", requireAuth, requireRole("OWNER"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const deleted = await tx(async client => {
      const existing = (await client.query("SELECT * FROM driver_reviews WHERE id=$1", [params.id])).rows[0];
      if (!existing) throw new AppError("Review not found", 404, "REVIEW_NOT_FOUND");
      await client.query("DELETE FROM driver_reviews WHERE id=$1", [params.id]);
      const rating = (await client.query("SELECT AVG(rating)::numeric(3,2) rating FROM driver_reviews WHERE driver_id=$1", [existing.driver_id])).rows[0];
      await client.query("UPDATE drivers SET rating=$1 WHERE id=$2", [rating.rating || 5.00, existing.driver_id]);
      await writeAudit(client, {
        action: "driver_review_deleted",
        actorUserId: req.user.id,
        entityType: "driver_review",
        entityId: params.id,
        metadata: { driverId: existing.driver_id, rating: existing.rating },
        req
      });
      return existing;
    });
    res.json({ review: deleted });
  } catch (error) { next(error); }
});

router.get("/leaderboard", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({
      dateFrom: z.string().trim().optional(),
      dateTo: z.string().trim().optional()
    }).parse(req.query);
    // Raffle windows are real start/end instants (raffle.startsAt/endsAt,
    // ISO timestamps), not date-only strings like the finance/tariff
    // reports use — so this scopes by timestamptz directly instead of the
    // ::date + INTERVAL '1 day' idiom used elsewhere in this file. Applied
    // in the JOIN condition (not a WHERE clause) so a driver with zero
    // orders in the window still appears with zero counts, not dropped.
    const dateFrom = params.dateFrom ? new Date(params.dateFrom) : null;
    const dateTo = params.dateTo ? new Date(params.dateTo) : null;
    if (params.dateFrom && Number.isNaN(dateFrom?.getTime())) {
      throw new AppError("dateFrom must be a valid date", 400, "VALIDATION_ERROR");
    }
    if (params.dateTo && Number.isNaN(dateTo?.getTime())) {
      throw new AppError("dateTo must be a valid date", 400, "VALIDATION_ERROR");
    }
    const result = await query(`
      SELECT d.id, d.name, d.phone, d.car_model, d.plate, d.status, d.rating,
             COUNT(o.id)::int total_orders,
             COUNT(o.id) FILTER (WHERE o.status='COMPLETED')::int completed_orders,
             COUNT(o.id) FILTER (WHERE o.status='CANCELLED')::int cancelled_orders,
             COALESCE(SUM(o.price) FILTER (WHERE o.status='COMPLETED'),0)::int revenue_total
      FROM drivers d
      LEFT JOIN orders o ON o.driver_id=d.id
        AND ($1::timestamptz IS NULL OR o.created_at >= $1::timestamptz)
        AND ($2::timestamptz IS NULL OR o.created_at <= $2::timestamptz)
      GROUP BY d.id
      ORDER BY d.rating DESC, completed_orders DESC, revenue_total DESC
      LIMIT 100
    `, [dateFrom, dateTo]);
    res.json({ leaderboard: result.rows });
  } catch (error) { next(error); }
});

router.get("/driver-applications/:id/documents", requireAuth, requireRole("OWNER"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const documents = await listDocumentsForApplication(params.id, query);
    res.json({ documents: documents.map(publicDriverDocument) });
  } catch (error) { next(error); }
});

router.get("/drivers/:id/documents", requireAuth, requireRole("OWNER"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const documents = await listDocumentsForDriver(params.id, query);
    res.json({ documents: documents.map(publicDriverDocument) });
  } catch (error) { next(error); }
});

router.patch("/driver-documents/:id", requireAuth, requireRole("OWNER"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({
      status: z.enum(["APPROVED", "REJECTED"]),
      reason: z.string().trim().max(300).optional().default("")
    }).parse(req.body);

    const document = await tx(async client => {
      const reviewed = await reviewDriverDocument({
        id: params.id,
        status: body.status,
        reason: body.reason,
        actorUserId: req.user.id
      }, client);
      await writeAudit(client, {
        action: "driver_document_reviewed",
        actorUserId: req.user.id,
        entityType: "driver_document",
        entityId: params.id,
        metadata: { status: body.status, reason: body.reason },
        req
      });
      return reviewed;
    });

    if (document.driver_id) {
      const driverUser = (await query("SELECT user_id FROM drivers WHERE id=$1", [document.driver_id])).rows[0];
      if (driverUser?.user_id) {
        const notifyByStatus = {
          APPROVED: { title: "Документ проверен", body: "Ваш документ прошёл проверку" },
          REJECTED: { title: "Документ отклонён", body: body.reason || "Документ отклонён. Загрузите его заново" }
        }[body.status];
        notifyUser(driverUser.user_id, { ...notifyByStatus, type: "DRIVER_DOCUMENT_STATUS" })
          .catch((error) => console.error("[push] notifyUser failed", error));
      }
    }

    res.json({ document: publicDriverDocument(document) });
  } catch (error) { next(error); }
});

router.get("/driver-documents/:id/file", requireAuth, requireRole("OWNER"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const document = await getDriverDocumentById(params.id, query);
    if (!document) throw new AppError("Document not found", 404, "DRIVER_DOCUMENT_NOT_FOUND");
    const absolutePath = join(UPLOAD_ROOT, document.file_path);
    if (!existsSync(absolutePath)) throw new AppError("Document file is missing", 404, "DRIVER_DOCUMENT_FILE_MISSING");
    res.setHeader("Content-Type", document.mime_type);
    createReadStream(absolutePath).pipe(res);
  } catch (error) { next(error); }
});

router.get("/payout-requests", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({
      status: z.enum(["PENDING", "APPROVED", "PAID", "REJECTED", "CANCELLED"]).optional(),
      driverId: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(200).optional().default(100)
    }).parse(req.query);

    const conditions = [];
    const values = [];
    if (params.status) { values.push(params.status); conditions.push(`p.status=$${values.length}`); }
    if (params.driverId) { values.push(params.driverId); conditions.push(`p.driver_id=$${values.length}`); }
    values.push(params.limit);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(`
      SELECT p.*, d.name driver_name, d.phone driver_phone
      FROM driver_payout_requests p
      JOIN drivers d ON d.id = p.driver_id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT $${values.length}
    `, values);

    res.json({
      payoutRequests: result.rows.map(row => ({
        ...publicPayoutRequest(row),
        driverName: row.driver_name,
        driverPhone: row.driver_phone
      }))
    });
  } catch (error) { next(error); }
});

router.patch("/payout-requests/:id", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({
      status: z.enum(["APPROVED", "PAID", "REJECTED"]),
      reason: z.string().trim().max(300).optional().default(""),
      providerReference: z.string().trim().max(120).optional()
    }).parse(req.body);

    const result = await tx(async client => {
      const reviewed = await reviewPayoutRequest({
        id: params.id,
        status: body.status,
        reason: body.reason,
        providerReference: body.providerReference || null,
        actorUserId: req.user.id
      }, client);
      await writeAudit(client, {
        action: "driver_payout_reviewed",
        actorUserId: req.user.id,
        entityType: "driver_payout_request",
        entityId: params.id,
        metadata: { status: body.status, reason: body.reason },
        req
      });
      const driverUser = (await client.query("SELECT user_id FROM drivers WHERE id=$1", [reviewed.payoutRequest.driverId])).rows[0];
      return { ...reviewed, driverUserId: driverUser?.user_id || null };
    });

    const notifyByStatus = {
      APPROVED: { title: "Выплата одобрена", body: `Заявка на ${result.payoutRequest.amountKzt} ₸ одобрена и готовится к переводу` },
      PAID: { title: "Выплата отправлена", body: `${result.payoutRequest.amountKzt} ₸ переведены на ваш счёт` },
      REJECTED: { title: "Выплата отклонена", body: body.reason || "Заявка на выплату отклонена. Подробности уточните в поддержке" }
    }[body.status];
    if (result.driverUserId && notifyByStatus) {
      notifyUser(result.driverUserId, { ...notifyByStatus, type: "DRIVER_PAYOUT_STATUS" })
        .catch((error) => console.error("[push] notifyUser failed", error));
    }

    res.json({ payoutRequest: result.payoutRequest, driver: result.driver });
  } catch (error) { next(error); }
});

export default router;
