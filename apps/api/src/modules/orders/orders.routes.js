import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";

const router = Router();

function shortId() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

async function getTariff(name) {
  const result = await query("SELECT * FROM tariffs WHERE name=$1 AND is_active=true", [name]);
  if (!result.rows[0]) throw new AppError("Tariff not found", 404, "TARIFF_NOT_FOUND");
  return result.rows[0];
}

function calcPrice(tariff, distanceKm, durationMin) {
  const raw = Number(tariff.base_price) + Number(tariff.price_per_km) * distanceKm + Number(tariff.price_per_minute) * durationMin;
  return Math.max(Number(tariff.min_price), Math.round(raw / 10) * 10);
}

const CreateOrder = z.object({
  riderName: z.string().min(2),
  riderPhone: z.string().min(6),
  pickupText: z.string().min(2),
  dropoffText: z.string().min(2),
  tariff: z.string().default("Economy"),
  paymentMethod: z.enum(["CASH", "KASPI", "CARD", "CASHBACK", "MIXED"]).default("CASH"),
  notes: z.string().optional()
});

router.post("/", async (req, res, next) => {
  try {
    const body = CreateOrder.parse(req.body);
    const tariff = await getTariff(body.tariff);
    const distanceKm = 3.2;
    const durationMin = 9;
    const price = calcPrice(tariff, distanceKm, durationMin);
    const serviceCommission = Math.round(price * Number(tariff.service_commission_percent) / 100 / 10) * 10;

    let client = (await query("SELECT * FROM clients WHERE phone=$1", [body.riderPhone])).rows[0];
    if (!client) {
      client = (await query("INSERT INTO clients(name, phone) VALUES($1,$2) RETURNING *", [body.riderName, body.riderPhone])).rows[0];
    }

    const result = await query(`
      INSERT INTO orders(short_id, client_id, rider_name, rider_phone, pickup_text, dropoff_text, tariff, payment_method, price, distance_km, duration_min, service_commission, notes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [shortId(), client.id, body.riderName, body.riderPhone, body.pickupText, body.dropoffText, body.tariff, body.paymentMethod, price, distanceKm, durationMin, serviceCommission, body.notes || ""]);

    const order = result.rows[0];
    await query("INSERT INTO order_status_history(order_id,status,message) VALUES($1,'NEW','Order created')", [order.id]);
    req.io?.to("dispatch").emit("order_created", order);
    req.io?.to("drivers").emit("order_created", order);
    res.status(201).json({ order });
  } catch (e) { next(e); }
});

router.get("/", requireAuth, requireRole("OWNER", "OPERATOR", "FINANCE", "DRIVER"), async (req, res, next) => {
  try {
    let result;
    if (req.user.role === "DRIVER") {
      const driver = (await query("SELECT * FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
      result = await query("SELECT * FROM orders WHERE status='NEW' OR driver_id=$1 ORDER BY created_at DESC LIMIT 100", [driver?.id || null]);
    } else {
      result = await query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 200");
    }
    res.json({ orders: result.rows });
  } catch (e) { next(e); }
});

router.post("/:id/accept", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const order = await tx(async (client) => {
      const d = await client.query("SELECT * FROM drivers WHERE user_id=$1 AND is_blocked=false FOR UPDATE", [req.user.id]);
      const driver = d.rows[0];
      if (!driver) throw new AppError("Driver not found", 404, "DRIVER_NOT_FOUND");
      if (Number(driver.debt) > 15000) throw new AppError("Debt limit exceeded", 403, "DRIVER_DEBT_LIMIT");

      const o = await client.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [req.params.id]);
      const existing = o.rows[0];
      if (!existing) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
      if (existing.status !== "NEW") throw new AppError("Order already accepted", 409, "ORDER_ALREADY_ACCEPTED");

      const u = await client.query("UPDATE orders SET status='DRIVER_ASSIGNED', driver_id=$1, accepted_at=NOW() WHERE id=$2 RETURNING *", [driver.id, existing.id]);
      await client.query("UPDATE drivers SET status='BUSY', last_seen_at=NOW() WHERE id=$1", [driver.id]);
      await client.query("INSERT INTO order_status_history(order_id,status,message,actor_user_id) VALUES($1,'DRIVER_ASSIGNED','Driver accepted order',$2)", [existing.id, req.user.id]);
      return u.rows[0];
    });
    req.io?.to("dispatch").emit("order_updated", order);
    req.io?.to("drivers").emit("order_taken", { orderId: order.id });
    res.json({ order });
  } catch (e) { next(e); }
});

async function updateStatus(req, res, next, status) {
  try {
    const order = await tx(async (client) => {
      const driver = req.user.role === "DRIVER" ? (await client.query("SELECT * FROM drivers WHERE user_id=$1", [req.user.id])).rows[0] : null;
      const o = await client.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [req.params.id]);
      const existing = o.rows[0];
      if (!existing) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
      if (driver && existing.driver_id !== driver.id) throw new AppError("Forbidden order", 403, "FORBIDDEN_ORDER");

      let extra = "";
      if (status === "DRIVER_ARRIVED") extra = ", arrived_at=NOW()";
      if (status === "IN_PROGRESS") extra = ", started_at=NOW()";
      if (status === "COMPLETED") extra = ", completed_at=NOW(), payment_status='PAID'";
      if (status === "CANCELLED") extra = ", cancelled_at=NOW()";

      const u = await client.query(`UPDATE orders SET status=$1 ${extra} WHERE id=$2 RETURNING *`, [status, existing.id]);
      let updated = u.rows[0];

      if (status === "COMPLETED") {
        const tariff = (await client.query("SELECT * FROM tariffs WHERE name=$1", [updated.tariff])).rows[0];
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
      return (await client.query("SELECT * FROM orders WHERE id=$1", [existing.id])).rows[0];
    });
    req.io?.to("dispatch").emit("order_updated", order);
    res.json({ order });
  } catch (e) { next(e); }
}

router.post("/:id/arrived", requireAuth, requireRole("DRIVER", "OWNER", "OPERATOR"), (req,res,next)=>updateStatus(req,res,next,"DRIVER_ARRIVED"));
router.post("/:id/start", requireAuth, requireRole("DRIVER", "OWNER", "OPERATOR"), (req,res,next)=>updateStatus(req,res,next,"IN_PROGRESS"));
router.post("/:id/complete", requireAuth, requireRole("DRIVER", "OWNER", "OPERATOR"), (req,res,next)=>updateStatus(req,res,next,"COMPLETED"));
router.post("/:id/cancel", requireAuth, requireRole("DRIVER", "OWNER", "OPERATOR"), (req,res,next)=>updateStatus(req,res,next,"CANCELLED"));

export default router;
