import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import { rateLimit } from "../../common/rateLimit.js";
import { calculateOrderPrice, prepareOrderPricing } from "./order-pricing.service.js";
import {
  acceptOrderForDriver,
  assertDriverHasNoActiveOrder,
  assertStatusTransition,
  emitOrderCreated,
  emitOrderUpdated,
  listOrdersForDriver
} from "./order-dispatch.service.js";
import { assertDriverDispatchReady } from "../driver-region-approvals/driver-region-approvals.service.js";
import { createOrderCancelledTransaction, createOrderCompletedTransaction } from "../finance/finance.service.js";

const router = Router();
const ORDER_SELECT = `
  o.*,
  d.name AS driver_name,
  d.phone AS driver_phone,
  d.car_model AS driver_car_model,
  d.plate AS driver_plate,
  d.rating AS driver_rating
`;

function shortId() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

export function calcPrice(tariff, distanceKm, durationMin) {
  return calculateOrderPrice(tariff, distanceKm, durationMin);
}

const OrderStatus = z.enum(["NEW", "DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);
const IdParam = z.object({ id: z.string().uuid() });

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

export const CreateOrder = z.object({
  riderName: z.string().trim().max(80).optional().default("Клиент").transform(value => normalizeText(value || "Клиент")),
  riderPhone: z.string().trim().min(6).max(32).regex(/^\+?[0-9 ()-]+$/, "invalid phone"),
  pickupText: z.string().trim().min(2).max(180).transform(normalizeText),
  dropoffText: z.string().trim().min(2).max(180).transform(normalizeText),
  pickupLat: z.coerce.number().min(-90).max(90),
  pickupLng: z.coerce.number().min(-180).max(180),
  dropoffLat: z.coerce.number().min(-90).max(90),
  dropoffLng: z.coerce.number().min(-180).max(180),
  tariffId: z.string().uuid().optional(),
  tariff: z.string().trim().min(2).max(40).default("Economy"),
  paymentMethod: z.enum(["CASH", "KASPI", "CARD", "CASHBACK", "MIXED"]).default("CASH"),
  distanceKm: z.coerce.number().gt(0).max(300),
  durationMin: z.coerce.number().gt(0).max(600),
  notes: z.string().trim().max(500).optional().default("")
});

export const EstimateOrder = CreateOrder.pick({
  pickupLat: true,
  pickupLng: true,
  dropoffLat: true,
  dropoffLng: true,
  tariffId: true,
  tariff: true,
  distanceKm: true,
  durationMin: true
});

async function insertOrderWithShortId(client, params) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await client.query(`
        INSERT INTO orders(short_id, region_id, client_id, rider_name, rider_phone, pickup_text, dropoff_text, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, tariff, payment_method, price, distance_km, duration_min, service_commission, pricing_snapshot, notes)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19)
        RETURNING *
      `, [shortId(), ...params]);
      return result.rows[0];
    } catch (error) {
      if (error.code !== "23505") throw error;
    }
  }
  throw new AppError("Could not allocate order number", 500, "ORDER_NUMBER_COLLISION");
}

function assertTransition(existing, nextStatus) {
  return assertStatusTransition(existing, nextStatus);
}

router.post("/estimate", rateLimit({ prefix: "orders-estimate", windowMs: 60_000, max: 60 }), async (req, res, next) => {
  try {
    const body = EstimateOrder.parse(req.body);
    const pricing = await prepareOrderPricing(body, query);
    res.json({ estimate: pricing.publicEstimate });
  } catch (e) { next(e); }
});

router.post("/", requireAuth, requireRole("CLIENT"), rateLimit({ prefix: "orders-create", windowMs: 60_000, max: 20 }), async (req, res, next) => {
  try {
    const body = CreateOrder.parse(req.body);
    const order = await tx(async (client) => {
      const pricing = await prepareOrderPricing(body, client);

      const rider = (await client.query(`
        INSERT INTO clients(user_id, name, phone)
        VALUES($1,$2,$3)
        ON CONFLICT (phone) DO UPDATE SET name=EXCLUDED.name, user_id=COALESCE(clients.user_id, EXCLUDED.user_id)
        RETURNING *
      `, [req.user.id, body.riderName, body.riderPhone])).rows[0];

      const created = await insertOrderWithShortId(client, [
        pricing.regionId,
        rider.id,
        body.riderName,
        body.riderPhone,
        body.pickupText,
        body.dropoffText,
        body.pickupLat,
        body.pickupLng,
        body.dropoffLat,
        body.dropoffLng,
        pricing.tariff.name,
        body.paymentMethod,
        pricing.estimatedPrice,
        pricing.pricingSnapshot.distanceKm,
        pricing.pricingSnapshot.durationMin,
        pricing.serviceCommission,
        JSON.stringify(pricing.pricingSnapshot),
        body.notes
      ]);

      await client.query("INSERT INTO order_status_history(order_id,status,message) VALUES($1,'NEW','Order created')", [created.id]);
      await writeAudit(client, {
        action: "order_created",
        entityType: "order",
        entityId: created.id,
        metadata: { shortId: created.short_id, regionId: created.region_id, tariff: created.tariff, paymentMethod: created.payment_method, price: created.price },
        req
      });
      return created;
    });

    emitOrderCreated(req.io, order);
    res.status(201).json({ order });
  } catch (e) { next(e); }
});

router.post("/:id/cancel-public", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const body = z.object({
      riderPhone: z.string().trim().min(6).max(32).regex(/^\+?[0-9 ()-]+$/, "invalid phone")
    }).parse(req.body);
    const order = await tx(async (client) => {
      const existing = (await client.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!existing) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
      if (normalizePhone(existing.rider_phone) !== normalizePhone(body.riderPhone)) {
        throw new AppError("Forbidden order", 403, "FORBIDDEN_ORDER");
      }
      if (!["NEW", "DRIVER_ASSIGNED", "DRIVER_ARRIVED"].includes(existing.status)) {
        throw new AppError("Invalid order status transition", 409, "INVALID_STATUS_TRANSITION", {
          currentStatus: existing.status,
          nextStatus: "CANCELLED"
        });
      }

      const updated = (await client.query("UPDATE orders SET status='CANCELLED', cancelled_at=NOW() WHERE id=$1 RETURNING *", [existing.id])).rows[0];
      if (updated.driver_id) await client.query("UPDATE drivers SET status='FREE' WHERE id=$1", [updated.driver_id]);
      await createOrderCancelledTransaction(updated, null, client);
      await client.query("INSERT INTO order_status_history(order_id,status,message) VALUES($1,'CANCELLED','Cancelled by client')", [updated.id]);
      await writeAudit(client, {
        action: "order_status_changed",
        entityType: "order",
        entityId: updated.id,
        metadata: { from: existing.status, to: "CANCELLED", source: "client" },
        req
      });
      return (await client.query(`
        SELECT ${ORDER_SELECT}
        FROM orders o
        LEFT JOIN drivers d ON d.id=o.driver_id
        WHERE o.id=$1
      `, [updated.id])).rows[0];
    });
    emitOrderUpdated(req.io, order);
    res.json({ order });
  } catch (e) { next(e); }
});

router.get("/", requireAuth, requireRole("OWNER", "OPERATOR", "FINANCE", "DRIVER"), async (req, res, next) => {
  try {
    const params = z.object({
      status: OrderStatus.optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100)
    }).parse(req.query);
    let result;
    if (req.user.role === "DRIVER") {
      const driver = (await query("SELECT * FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
      if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
      result = { rows: await listOrdersForDriver({
        driver,
        status: params.status,
        limit: params.limit,
        executor: query,
        orderSelect: ORDER_SELECT
      }) };
    } else {
      result = params.status
        ? await query(`SELECT ${ORDER_SELECT} FROM orders o LEFT JOIN drivers d ON d.id=o.driver_id WHERE o.status=$1 ORDER BY o.created_at DESC LIMIT $2`, [params.status, params.limit])
        : await query(`SELECT ${ORDER_SELECT} FROM orders o LEFT JOIN drivers d ON d.id=o.driver_id ORDER BY o.created_at DESC LIMIT $1`, [params.limit]);
    }
    res.json({ orders: result.rows });
  } catch (e) { next(e); }
});

router.post("/:id/accept", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const order = await tx(async (client) => {
      const accepted = await acceptOrderForDriver({ orderId: id, userId: req.user.id, executor: client });
      await writeAudit(client, {
        action: "order_accepted",
        actorUserId: req.user.id,
        entityType: "order",
        entityId: accepted.order.id,
        metadata: { driverId: accepted.driver.id, regionId: accepted.order.region_id },
        req
      });
      return (await client.query(`
        SELECT ${ORDER_SELECT}
        FROM orders o
        LEFT JOIN drivers d ON d.id=o.driver_id
        WHERE o.id=$1
      `, [accepted.order.id])).rows[0];
    });
    emitOrderUpdated(req.io, order, "order_accepted");
    res.json({ order });
  } catch (e) { next(e); }
});

router.post("/:id/assign-driver", requireAuth, requireRole("OWNER", "OPERATOR"), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const body = z.object({ driverId: z.string().uuid() }).parse(req.body);
    const order = await tx(async (client) => {
      const driver = (await client.query("SELECT * FROM drivers WHERE id=$1 FOR UPDATE", [body.driverId])).rows[0];
      if (!driver) throw new AppError("Driver not found", 404, "DRIVER_NOT_FOUND");
      await assertDriverDispatchReady(driver, client);
      if (Number(driver.debt) > 15000) throw new AppError("Debt limit exceeded", 403, "DRIVER_DEBT_LIMIT");
      await assertDriverHasNoActiveOrder(driver, client);
      if (driver.status === "OFFLINE" || driver.status === "BREAK") throw new AppError("Driver is offline", 409, "DRIVER_OFFLINE");
      if (driver.status !== "FREE") throw new AppError("Driver already has an active order", 409, "DRIVER_HAS_ACTIVE_ORDER");

      const existing = (await client.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!existing) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
      if (existing.status !== "NEW" || existing.driver_id) throw new AppError("Order already accepted", 409, "ORDER_ALREADY_ACCEPTED");
      if (existing.region_id !== driver.current_region_id) throw new AppError("Order is outside driver's current region", 403, "ORDER_REGION_MISMATCH");

      await client.query("UPDATE orders SET status='DRIVER_ASSIGNED', driver_id=$1, accepted_at=NOW() WHERE id=$2", [driver.id, existing.id]);
      await client.query("UPDATE drivers SET status='BUSY', last_seen_at=NOW() WHERE id=$1", [driver.id]);
      await client.query("INSERT INTO order_status_history(order_id,status,message,actor_user_id) VALUES($1,'DRIVER_ASSIGNED','Driver assigned by operator',$2)", [existing.id, req.user.id]);
      await writeAudit(client, {
        action: "order_driver_assigned",
        actorUserId: req.user.id,
        entityType: "order",
        entityId: existing.id,
        metadata: { driverId: driver.id },
        req
      });
      return (await client.query(`
        SELECT ${ORDER_SELECT}
        FROM orders o
        LEFT JOIN drivers d ON d.id=o.driver_id
        WHERE o.id=$1
      `, [existing.id])).rows[0];
    });
    emitOrderUpdated(req.io, order, "order_assigned");
    res.json({ order });
  } catch (e) { next(e); }
});

async function updateStatus(req, res, next, status) {
  try {
    IdParam.parse(req.params);
    const order = await tx(async (client) => {
      const driver = req.user.role === "DRIVER" ? (await client.query("SELECT * FROM drivers WHERE user_id=$1 FOR UPDATE", [req.user.id])).rows[0] : null;
      if (req.user.role === "DRIVER" && !driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
      if (driver) await assertDriverDispatchReady(driver, client);
      const o = await client.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [req.params.id]);
      const existing = o.rows[0];
      if (!existing) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
      if (driver && existing.driver_id !== driver.id) throw new AppError("Forbidden order", 403, "FORBIDDEN_ORDER");
      if (driver && existing.region_id !== driver.current_region_id) throw new AppError("Order is outside driver's current region", 403, "ORDER_REGION_MISMATCH");
      assertTransition(existing, status);

      let extra = "";
      if (status === "DRIVER_ARRIVED") extra = ", arrived_at=NOW()";
      if (status === "IN_PROGRESS") extra = ", started_at=NOW()";
      if (status === "COMPLETED") extra = ", completed_at=NOW(), payment_status='PAID'";
      if (status === "CANCELLED") extra = ", cancelled_at=NOW()";

      const u = await client.query(`UPDATE orders SET status=$1 ${extra} WHERE id=$2 RETURNING *`, [status, existing.id]);
      let updated = u.rows[0];

      if (status === "COMPLETED") {
        const tariff = (await client.query("SELECT * FROM tariffs WHERE region_id=$1 AND name=$2", [updated.region_id, updated.tariff])).rows[0];
        if (!tariff) throw new AppError("Tariff not found", 404, "TARIFF_NOT_FOUND");
        const cashback = Math.round(updated.price * Number(tariff.cashback_percent) / 100 / 10) * 10;
        await client.query("UPDATE orders SET cashback_earned=$1 WHERE id=$2", [cashback, updated.id]);
        if (updated.client_id) {
          const c = await client.query("UPDATE clients SET cashback_balance=cashback_balance+$1 WHERE id=$2 RETURNING cashback_balance", [cashback, updated.client_id]);
          await client.query("INSERT INTO cashback_transactions(client_id,order_id,type,amount,balance_after) VALUES($1,$2,'EARN',$3,$4)", [updated.client_id, updated.id, cashback, c.rows[0].cashback_balance]);
        }
        if (updated.driver_id) {
          if (["CASH", "KASPI"].includes(updated.payment_method)) {
            await client.query("UPDATE drivers SET debt=debt+$1,status='FREE' WHERE id=$2", [updated.service_commission, updated.driver_id]);
            await client.query("INSERT INTO driver_debts(driver_id,order_id,amount) VALUES($1,$2,$3)", [updated.driver_id, updated.id, updated.service_commission]);
          } else {
            await client.query("UPDATE drivers SET balance=balance+($1-$2),status='FREE' WHERE id=$3", [updated.price, updated.service_commission, updated.driver_id]);
          }
        }
        await createOrderCompletedTransaction(updated, req.user.id, client);
      }
      if (status === "CANCELLED") {
        if (updated.driver_id) await client.query("UPDATE drivers SET status='FREE' WHERE id=$1", [updated.driver_id]);
        await createOrderCancelledTransaction(updated, req.user.id, client);
      }
      await client.query("INSERT INTO order_status_history(order_id,status,message,actor_user_id) VALUES($1,$2,$3,$4)", [existing.id, status, `Status changed to ${status}`, req.user.id]);
      await writeAudit(client, {
        action: status === "COMPLETED" ? "order_completed" : "order_status_changed",
        actorUserId: req.user.id,
        entityType: "order",
        entityId: existing.id,
        metadata: { from: existing.status, to: status },
        req
      });
      return (await client.query(`
        SELECT ${ORDER_SELECT}
        FROM orders o
        LEFT JOIN drivers d ON d.id=o.driver_id
        WHERE o.id=$1
      `, [existing.id])).rows[0];
    });
    emitOrderUpdated(req.io, order);
    res.json({ order });
  } catch (e) { next(e); }
}

router.post("/:id/arrived", requireAuth, requireRole("DRIVER", "OWNER", "OPERATOR"), (req,res,next)=>updateStatus(req,res,next,"DRIVER_ARRIVED"));
router.post("/:id/start", requireAuth, requireRole("DRIVER", "OWNER", "OPERATOR"), (req,res,next)=>updateStatus(req,res,next,"IN_PROGRESS"));
router.post("/:id/complete", requireAuth, requireRole("DRIVER", "OWNER", "OPERATOR"), (req,res,next)=>updateStatus(req,res,next,"COMPLETED"));
router.post("/:id/cancel", requireAuth, requireRole("DRIVER", "OWNER", "OPERATOR"), (req,res,next)=>updateStatus(req,res,next,"CANCELLED"));

export default router;
