import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";

const router = Router();

function shortId() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

async function getTariff(name, executor = query) {
  const sql = "SELECT * FROM tariffs WHERE name=$1 AND is_active=true";
  const result = executor.query
    ? await executor.query(sql, [name])
    : await executor(sql, [name]);
  if (!result.rows[0]) throw new AppError("Tariff not found", 404, "TARIFF_NOT_FOUND");
  return result.rows[0];
}

function calcPrice(tariff, distanceKm, durationMin) {
  const raw = Number(tariff.base_price) + Number(tariff.price_per_km) * distanceKm + Number(tariff.price_per_minute) * durationMin;
  return Math.max(Number(tariff.min_price), Math.round(raw / 10) * 10);
}

const OrderStatus = z.enum(["NEW", "DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);
const IdParam = z.object({ id: z.string().uuid() });
const ActiveDriverStatuses = ["DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS"];
const TransitionRules = {
  DRIVER_ARRIVED: ["DRIVER_ASSIGNED"],
  IN_PROGRESS: ["DRIVER_ARRIVED"],
  COMPLETED: ["IN_PROGRESS"],
  CANCELLED: ["NEW", "DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS"]
};

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

const CreateOrder = z.object({
  riderName: z.string().trim().min(2).max(80).transform(normalizeText),
  riderPhone: z.string().trim().min(6).max(32).regex(/^\+?[0-9 ()-]+$/, "invalid phone"),
  pickupText: z.string().trim().min(2).max(180).transform(normalizeText),
  dropoffText: z.string().trim().min(2).max(180).transform(normalizeText),
  tariff: z.string().trim().min(2).max(40).default("Economy"),
  paymentMethod: z.enum(["CASH", "KASPI", "CARD", "CASHBACK", "MIXED"]).default("CASH"),
  distanceKm: z.coerce.number().min(0).max(300).default(3.2),
  durationMin: z.coerce.number().int().min(0).max(600).default(9),
  notes: z.string().trim().max(500).optional().default("")
});

async function insertOrderWithShortId(client, params) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await client.query(`
        INSERT INTO orders(short_id, client_id, rider_name, rider_phone, pickup_text, dropoff_text, tariff, payment_method, price, distance_km, duration_min, service_commission, notes)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
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
  const allowed = TransitionRules[nextStatus] || [];
  if (!allowed.includes(existing.status)) {
    throw new AppError("Invalid order status transition", 409, "INVALID_ORDER_TRANSITION", {
      currentStatus: existing.status,
      nextStatus,
      allowedFrom: allowed
    });
  }
}

router.post("/", async (req, res, next) => {
  try {
    const body = CreateOrder.parse(req.body);
    const order = await tx(async (client) => {
      const tariff = await getTariff(body.tariff, client);
      const price = calcPrice(tariff, body.distanceKm, body.durationMin);
      const serviceCommission = Math.round(price * Number(tariff.service_commission_percent) / 100 / 10) * 10;

      const rider = (await client.query(`
        INSERT INTO clients(name, phone)
        VALUES($1,$2)
        ON CONFLICT (phone) DO UPDATE SET name=EXCLUDED.name
        RETURNING *
      `, [body.riderName, body.riderPhone])).rows[0];

      const created = await insertOrderWithShortId(client, [
        rider.id,
        body.riderName,
        body.riderPhone,
        body.pickupText,
        body.dropoffText,
        body.tariff,
        body.paymentMethod,
        price,
        body.distanceKm,
        body.durationMin,
        serviceCommission,
        body.notes
      ]);

      await client.query("INSERT INTO order_status_history(order_id,status,message) VALUES($1,'NEW','Order created')", [created.id]);
      await writeAudit(client, {
        action: "order_created",
        entityType: "order",
        entityId: created.id,
        metadata: { shortId: created.short_id, tariff: created.tariff, paymentMethod: created.payment_method, price: created.price },
        req
      });
      return created;
    });

    req.io?.to("dispatch").emit("order_created", order);
    req.io?.to("drivers").emit("order_created", order);
    req.io?.emit("order_status_public", {
      id: order.id,
      short_id: order.short_id,
      status: order.status,
      price: order.price,
      payment_method: order.payment_method,
      tariff: order.tariff
    });
    res.status(201).json({ order });
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
      result = params.status
        ? await query("SELECT * FROM orders WHERE (status='NEW' OR driver_id=$1) AND status=$2 ORDER BY created_at DESC LIMIT $3", [driver.id, params.status, params.limit])
        : await query("SELECT * FROM orders WHERE status='NEW' OR driver_id=$1 ORDER BY created_at DESC LIMIT $2", [driver.id, params.limit]);
    } else {
      result = params.status
        ? await query("SELECT * FROM orders WHERE status=$1 ORDER BY created_at DESC LIMIT $2", [params.status, params.limit])
        : await query("SELECT * FROM orders ORDER BY created_at DESC LIMIT $1", [params.limit]);
    }
    res.json({ orders: result.rows });
  } catch (e) { next(e); }
});

router.post("/:id/accept", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const order = await tx(async (client) => {
      const d = await client.query("SELECT * FROM drivers WHERE user_id=$1 AND is_blocked=false FOR UPDATE", [req.user.id]);
      const driver = d.rows[0];
      if (!driver) throw new AppError("Driver not found", 404, "DRIVER_NOT_FOUND");
      if (driver.status !== "FREE") throw new AppError("Driver is not available", 409, "DRIVER_NOT_AVAILABLE");
      if (Number(driver.debt) > 15000) throw new AppError("Debt limit exceeded", 403, "DRIVER_DEBT_LIMIT");
      const active = await client.query("SELECT id FROM orders WHERE driver_id=$1 AND status = ANY($2::text[]) LIMIT 1", [driver.id, ActiveDriverStatuses]);
      if (active.rows[0]) throw new AppError("Driver already has an active order", 409, "DRIVER_HAS_ACTIVE_ORDER");

      const o = await client.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [id]);
      const existing = o.rows[0];
      if (!existing) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
      if (existing.status !== "NEW") throw new AppError("Order already accepted", 409, "ORDER_ALREADY_ACCEPTED");

      const u = await client.query("UPDATE orders SET status='DRIVER_ASSIGNED', driver_id=$1, accepted_at=NOW() WHERE id=$2 RETURNING *", [driver.id, existing.id]);
      await client.query("UPDATE drivers SET status='BUSY', last_seen_at=NOW() WHERE id=$1", [driver.id]);
      await client.query("INSERT INTO order_status_history(order_id,status,message,actor_user_id) VALUES($1,'DRIVER_ASSIGNED','Driver accepted order',$2)", [existing.id, req.user.id]);
      await writeAudit(client, {
        action: "order_accepted",
        actorUserId: req.user.id,
        entityType: "order",
        entityId: existing.id,
        metadata: { driverId: driver.id },
        req
      });
      return u.rows[0];
    });
    req.io?.to("dispatch").emit("order_updated", order);
    req.io?.to("drivers").emit("order_taken", { orderId: order.id });
    req.io?.emit("order_status_public", {
      id: order.id,
      short_id: order.short_id,
      status: order.status,
      price: order.price,
      payment_method: order.payment_method,
      tariff: order.tariff
    });
    res.json({ order });
  } catch (e) { next(e); }
});

async function updateStatus(req, res, next, status) {
  try {
    IdParam.parse(req.params);
    const order = await tx(async (client) => {
      const driver = req.user.role === "DRIVER" ? (await client.query("SELECT * FROM drivers WHERE user_id=$1 FOR UPDATE", [req.user.id])).rows[0] : null;
      if (req.user.role === "DRIVER" && !driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
      const o = await client.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [req.params.id]);
      const existing = o.rows[0];
      if (!existing) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
      if (driver && existing.driver_id !== driver.id) throw new AppError("Forbidden order", 403, "FORBIDDEN_ORDER");
      assertTransition(existing, status);

      let extra = "";
      if (status === "DRIVER_ARRIVED") extra = ", arrived_at=NOW()";
      if (status === "IN_PROGRESS") extra = ", started_at=NOW()";
      if (status === "COMPLETED") extra = ", completed_at=NOW(), payment_status='PAID'";
      if (status === "CANCELLED") extra = ", cancelled_at=NOW()";

      const u = await client.query(`UPDATE orders SET status=$1 ${extra} WHERE id=$2 RETURNING *`, [status, existing.id]);
      let updated = u.rows[0];

      if (status === "COMPLETED") {
        const tariff = (await client.query("SELECT * FROM tariffs WHERE name=$1", [updated.tariff])).rows[0];
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
      }
      if (status === "CANCELLED" && updated.driver_id) await client.query("UPDATE drivers SET status='FREE' WHERE id=$1", [updated.driver_id]);
      await client.query("INSERT INTO order_status_history(order_id,status,message,actor_user_id) VALUES($1,$2,$3,$4)", [existing.id, status, `Status changed to ${status}`, req.user.id]);
      await writeAudit(client, {
        action: status === "COMPLETED" ? "order_completed" : "order_status_changed",
        actorUserId: req.user.id,
        entityType: "order",
        entityId: existing.id,
        metadata: { from: existing.status, to: status },
        req
      });
      return (await client.query("SELECT * FROM orders WHERE id=$1", [existing.id])).rows[0];
    });
    req.io?.to("dispatch").emit("order_updated", order);
    req.io?.to("drivers").emit("order_updated", order);
    req.io?.emit("order_status_public", {
      id: order.id,
      short_id: order.short_id,
      status: order.status,
      price: order.price,
      payment_method: order.payment_method,
      tariff: order.tariff
    });
    res.json({ order });
  } catch (e) { next(e); }
}

router.post("/:id/arrived", requireAuth, requireRole("DRIVER", "OWNER", "OPERATOR"), (req,res,next)=>updateStatus(req,res,next,"DRIVER_ARRIVED"));
router.post("/:id/start", requireAuth, requireRole("DRIVER", "OWNER", "OPERATOR"), (req,res,next)=>updateStatus(req,res,next,"IN_PROGRESS"));
router.post("/:id/complete", requireAuth, requireRole("DRIVER", "OWNER", "OPERATOR"), (req,res,next)=>updateStatus(req,res,next,"COMPLETED"));
router.post("/:id/cancel", requireAuth, requireRole("DRIVER", "OWNER", "OPERATOR"), (req,res,next)=>updateStatus(req,res,next,"CANCELLED"));

export default router;
