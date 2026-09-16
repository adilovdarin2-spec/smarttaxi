import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import { driverDailyStats, DRIVER_COMPLETED_STATUSES } from "./driver-daily-stats.service.js";
import { releaseStandPlaceForDriver } from "../stands/stands.service.js";
import { announceStandRelease } from "../stands/stands.notify.js";
import {
  assertDriverCanGoOnline,
  assertDriverDispatchReady
} from "../driver-region-approvals/driver-region-approvals.service.js";
import {
  ACTIVE_ORDER_STATUSES,
  OPEN_ORDER_STATUSES,
  listOrdersForDriver,
  publicOrderStatus,
  syncDriverAvailability
} from "../orders/order-dispatch.service.js";

const router = Router();

const IdParam = z.object({ id: z.string().uuid() });
const ORDER_SELECT = `
  o.*,
  d.name AS driver_name,
  d.phone AS driver_phone,
  d.car_model AS driver_car_model,
  d.car_color AS driver_car_color,
  d.plate AS driver_plate,
  d.rating AS driver_rating
`;

function run(executor, sql, params = []) {
  return executor.query ? executor.query(sql, params) : executor(sql, params);
}

function publicDriverStatus(driver) {
  if (!driver) return "OFFLINE";
  if (driver.is_blocked) return "BLOCKED";
  if (driver.status === "FREE") return "ONLINE";
  if (driver.status === "BUSY") return "BUSY";
  return "OFFLINE";
}

function publicDriver(driver) {
  if (!driver) return null;
  return {
    id: driver.id,
    userId: driver.user_id,
    name: driver.name,
    phone: driver.phone,
    status: driver.status,
    publicStatus: publicDriverStatus(driver),
    rating: driver.rating,
    // There is no trips_count column: this used to read `|| 0`, so every
    // driver's profile reported zero completed trips forever, however many
    // they had actually driven. Only the routes that count it can say, and
    // null means "not loaded here" rather than the false "none".
    tripsCount: driver.trips_count == null ? null : Number(driver.trips_count),
    vehicleModel: driver.car_model,
    vehicleColor: driver.car_color,
    plateNumber: driver.plate,
    tariff: driver.tariff,
    isBlocked: Boolean(driver.is_blocked),
    currentRegionId: driver.current_region_id,
    balanceKzt: Number(driver.balance || 0),
    debtKzt: Number(driver.debt || 0),
    lastSeenAt: driver.last_seen_at
  };
}

function publicOrder(order) {
  if (!order) return null;
  return {
    ...order,
    public_status: publicOrderStatus(order.status),
    driver_public_status: order.driver_id ? "ASSIGNED" : "UNASSIGNED",
    driver_payout_estimate: Math.max(0, Number(order.price || 0) - Number(order.service_commission || 0))
  };
}

async function getDriverForUser(userId, executor = query, forUpdate = false) {
  const suffix = forUpdate ? " FOR UPDATE" : "";
  const driver = (await run(executor, `SELECT * FROM drivers WHERE user_id=$1${suffix}`, [userId])).rows[0];
  if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
  return driver;
}

async function activeOrderForDriver(driver, executor = query) {
  return (await run(executor, `
    SELECT ${ORDER_SELECT}
    FROM orders o
    LEFT JOIN drivers d ON d.id=o.driver_id
    WHERE o.driver_id=$1 AND o.status = ANY($2::text[])
    ORDER BY o.created_at DESC
    LIMIT 1
  `, [driver.id, ACTIVE_ORDER_STATUSES])).rows[0] || null;
}

// Trips a driver has actually finished. Counted on the indexed driver_id
// rather than denormalised — it measures well under a millisecond and cannot
// drift away from the orders it describes. Which statuses count is the same
// list the daily earnings use, so a driver's trip count and their earnings
// can never disagree about what finished.
async function completedTripsForDriver(driverId, executor = query) {
  const row = (await run(executor, `
    SELECT COUNT(*)::int AS trips
    FROM orders
    WHERE driver_id=$1 AND status = ANY($2::text[])
  `, [driverId, DRIVER_COMPLETED_STATUSES])).rows[0];
  return row?.trips ?? 0;
}

router.get("/profile", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const driver = await syncDriverAvailability(await getDriverForUser(req.user.id), query);
    const [activeOrder, tripsCount] = await Promise.all([
      activeOrderForDriver(driver),
      completedTripsForDriver(driver.id)
    ]);
    res.json({
      driver: publicDriver({ ...driver, trips_count: tripsCount }),
      activeOrder: publicOrder(activeOrder)
    });
  } catch (e) { next(e); }
});

router.post("/status/online", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const updated = await tx(async client => {
      // Serialize against assignment and queue joins before reading availability.
      const driver = await getDriverForUser(req.user.id, client, true);
      if (driver.is_blocked) throw new AppError("Driver is blocked", 403, "DRIVER_BLOCKED");
      await assertDriverCanGoOnline(driver, client);
      const activeOrder = await activeOrderForDriver(driver, client);
      const nextStatus = activeOrder ? "BUSY" : "FREE";
      const row = (await client.query("UPDATE drivers SET status=$2, last_seen_at=NOW() WHERE id=$1 RETURNING *", [driver.id, nextStatus])).rows[0];
      await writeAudit(client, {
        action: "driver_online", actorUserId: req.user.id, entityType: "driver", entityId: driver.id,
        metadata: { from: driver.status, to: nextStatus, activeOrderId: activeOrder?.id || null }, req
      });
      return row;
    });
    req.io?.to(`region:${updated.current_region_id}:dispatch`).emit("driver.online", publicDriver(updated));
    res.json({ driver: publicDriver(updated) });
  } catch (e) { next(e); }
});

router.post("/status/offline", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const { updated, release } = await tx(async client => {
      const driver = await getDriverForUser(req.user.id, client, true);
      const activeOrder = await activeOrderForDriver(driver, client);
      if (activeOrder) throw new AppError("Driver has active order", 409, "DRIVER_HAS_ACTIVE_ORDER");
      const updated = (await client.query("UPDATE drivers SET status='OFFLINE', last_seen_at=NOW() WHERE id=$1 RETURNING *", [driver.id])).rows[0];
      // Availability, queue removal and seat cancellation commit together.
      const release = await releaseStandPlaceForDriver(
        { driverId: driver.id, reason: "DRIVER_OFFLINE" }, client
      );
      await writeAudit(client, {
        action: "driver_offline", actorUserId: req.user.id, entityType: "driver", entityId: driver.id,
        metadata: { from: driver.status, to: "OFFLINE" }, req
      });
      return { updated, release };
    });
    await announceStandRelease(req.io, release);
    req.io?.to(`region:${updated.current_region_id}:dispatch`).emit("driver.offline", publicDriver(updated));
    res.json({ driver: publicDriver(updated) });
  } catch (e) { next(e); }
});

router.get("/orders/incoming", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const driver = await syncDriverAvailability(await getDriverForUser(req.user.id), query);
    await assertDriverDispatchReady(driver, query);
    if (driver.status !== "FREE") return res.json({ driver: publicDriver(driver), orders: [] });
    const orders = await listOrdersForDriver({
      driver,
      status: "SEARCHING_DRIVER",
      limit: 30,
      executor: { query },
      orderSelect: ORDER_SELECT
    });
    res.json({ driver: publicDriver(driver), orders: orders.map(publicOrder) });
  } catch (e) { next(e); }
});

router.get("/orders/active", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const driver = await getDriverForUser(req.user.id);
    const activeOrder = await activeOrderForDriver(driver);
    res.json({ driver: publicDriver(driver), activeOrder: publicOrder(activeOrder) });
  } catch (e) { next(e); }
});

router.post("/orders/:id/reject", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const driver = await getDriverForUser(req.user.id);
    await assertDriverDispatchReady(driver, query);
    if (driver.status !== "FREE") throw new AppError("Driver is not available", 409, "DRIVER_OFFLINE");
    const order = (await query("SELECT * FROM orders WHERE id=$1", [id])).rows[0];
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    if (order.driver_id) throw new AppError("Order already accepted", 409, "ORDER_ALREADY_ACCEPTED");
    if (!OPEN_ORDER_STATUSES.includes(order.status)) throw new AppError("Order is not open", 409, "INVALID_STATUS_TRANSITION");
    if (order.region_id !== driver.current_region_id) throw new AppError("Order is outside driver's current region", 403, "ORDER_REGION_MISMATCH");
    await writeAudit(query, {
      action: "driver_order_rejected",
      actorUserId: req.user.id,
      entityType: "order",
      entityId: order.id,
      metadata: { driverId: driver.id, status: order.status },
      req
    });
    res.json({ rejected: true, order: publicOrder(order), driver: publicDriver(driver) });
  } catch (e) { next(e); }
});

router.get("/earnings/today", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const driver = await getDriverForUser(req.user.id);
    const stats = await driverDailyStats(driver.id, query);
    const todayGrossKzt = stats.revenue_total;
    const commissionKzt = stats.commission_total;
    res.json({
      todayGrossKzt,
      todayNetKzt: Math.max(0, todayGrossKzt - commissionKzt),
      completedOrders: Number(stats.completed_orders || 0),
      commissionKzt,
      debtKzt: Number(driver.debt || 0),
      currency: "KZT"
    });
  } catch (e) { next(e); }
});

router.get("/debt", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const driver = await getDriverForUser(req.user.id);
    res.json({
      debtKzt: Number(driver.debt || 0),
      balanceKzt: Number(driver.balance || 0),
      currency: "KZT",
      driver: publicDriver(driver)
    });
  } catch (e) { next(e); }
});

export default router;
