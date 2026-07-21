import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import { rateLimit } from "../../common/rateLimit.js";
import { calculateOrderPrice, offeredPriceBounds, prepareOrderPricing } from "./order-pricing.service.js";
import {
  acceptOrderForDriver,
  ACTIVE_ORDER_STATUSES,
  assertDriverHasNoActiveOrder,
  assertStatusTransition,
  CLIENT_ACTIVE_ORDER_STATUSES,
  emitOrderCreated,
  emitOrderUpdated,
  listOrdersForDriver,
  OPEN_ORDER_STATUSES,
  ORDER_STATUSES,
  publicOrderEvent,
  publicOrderStatus,
  respondToClientCounterOffer,
  respondToDriverPriceOffer,
  submitClientCounterOffer,
  submitDriverPriceOffer,
  syncDriverAvailability,
  TRANSITION_RULES
} from "./order-dispatch.service.js";
import { assertDriverDispatchReady } from "../driver-region-approvals/driver-region-approvals.service.js";
import { buildActiveLegRoute } from "../routing/routing.service.js";
import { createOrderCancelledTransaction, createOrderCompletedTransaction, settleDriverDebtFromBalance } from "../finance/finance.service.js";
import { notifyOrderClient, notifyOrderDriver } from "../notifications/notification.service.js";
import { calculatePromoDiscount, findValidPromoCode, recordPromoRedemption } from "./promo.service.js";
import { awardReferralBonusOnFirstCompletedOrder } from "../referrals/referrals.service.js";

const router = Router();
// Anti-fraud: auto-suspend a driver whose rolling average drops below this
// once they have enough reviews that it isn't just one bad trip.
const DRIVER_AUTO_BLOCK_RATING_THRESHOLD = 3.0;
const DRIVER_AUTO_BLOCK_MIN_REVIEWS = 5;
export const ORDER_SELECT = `
  o.*,
  d.name AS driver_name,
  d.phone AS driver_phone,
  d.car_model AS driver_car_model,
  d.car_color AS driver_car_color,
  d.plate AS driver_plate,
  d.rating AS driver_rating,
  CASE WHEN d.id IS NULL THEN NULL ELSE ('/api/drivers/' || d.id::text || '/avatar') END AS driver_avatar_url,
  -- The order isn't assigned to a driver yet while a price offer is merely
  -- PENDING (o.driver_id stays null until accepted), so the rider's
  -- negotiation banner needs the OFFERING driver's own name/rating/avatar --
  -- a separate join keyed on driver_offer_by_driver_id, distinct from the
  -- fields above which only populate once the order is actually assigned.
  od.name AS offer_driver_name,
  od.rating AS offer_driver_rating,
  CASE WHEN od.id IS NULL THEN NULL ELSE ('/api/drivers/' || od.id::text || '/avatar') END AS offer_driver_avatar_url
`;
export function publicOrderResponse(order) {
  if (!order) return order;
  const event = publicOrderEvent(order);
  return { ...order, public_status: event.public_status, search_timed_out: event.search_timed_out };
}

function shortId() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

export function calcPrice(tariff, distanceKm, durationMin) {
  return calculateOrderPrice(tariff, distanceKm, durationMin);
}

const OrderStatus = z.enum(ORDER_STATUSES);
const IdParam = z.object({ id: z.string().uuid() });
const RateOrder = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  tags: z.array(z.string().trim().min(1).max(60)).max(8).optional().default([]),
  comment: z.string().trim().max(500).optional().default("")
});

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
  paymentMethod: z.enum(["CASH", "KASPI", "CARD"]).default("CASH"),
  distanceKm: z.coerce.number().gt(0).max(300),
  durationMin: z.coerce.number().gt(0).max(600),
  notes: z.string().trim().max(500).optional().default(""),
  // "Своя цена": rider raises/lowers the fare from the estimate via the
  // stepper in the tariff sheet. Bounds are re-checked server-side against
  // the freshly computed estimate below — never trust the client's math.
  offeredPriceKzt: z.coerce.number().int().positive().max(1_000_000).optional(),
  promoCode: z.string().trim().min(2).max(40).optional()
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
        INSERT INTO orders(short_id, status, region_id, client_id, rider_name, rider_phone, pickup_text, dropoff_text, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, tariff, payment_method, price, distance_km, duration_min, service_commission, pricing_snapshot, notes, offered_price_kzt, promo_code_id, promo_discount_kzt)
        VALUES($1,'SEARCHING_DRIVER',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20,$21,$22)
        RETURNING *
      `, [shortId(), ...params]);
      return result.rows[0];
    } catch (error) {
      // Only the short_id collision is meant to be retried here — orders
      // also has unique constraints for one-active-order-per-client and
      // share_token. Those can theoretically 23505 on the same INSERT if the
      // caller's own active-order pre-check raced, and silently retrying
      // against an unrelated conflict 5 times just wastes time before
      // returning the wrong, generic ORDER_NUMBER_COLLISION error instead of
      // the specific one the client UI needs to react to correctly.
      if (error.code === "23505" && error.constraint === "idx_orders_one_active_per_client") {
        throw new AppError("Client already has an active order", 409, "CLIENT_HAS_ACTIVE_ORDER");
      }
      if (error.code !== "23505" || error.constraint !== "orders_short_id_key") throw error;
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

// "Поделиться поездкой": no auth, keyed by an unguessable share_token (not
// the order id/short_id) so a shared link can only ever reveal this one
// trip's safe, non-sensitive fields — no phone numbers, no price.
router.get("/track/:token", rateLimit({ prefix: "orders-track", windowMs: 60_000, max: 30 }), async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().uuid() }).parse(req.params);
    const order = (await query(`
      SELECT o.status, o.tariff, o.pickup_text, o.dropoff_text, o.created_at,
             o.pickup_lat, o.pickup_lng, o.dropoff_lat, o.dropoff_lng,
             d.name AS driver_name, d.car_model AS driver_car_model, d.car_color AS driver_car_color, d.plate AS driver_plate,
             CASE WHEN d.id IS NULL THEN NULL ELSE ('/api/drivers/' || d.id::text || '/avatar') END AS driver_avatar_url,
             dl.lat AS driver_lat, dl.lng AS driver_lng, dl.updated_at AS driver_location_updated_at
      FROM orders o
      LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
      LEFT JOIN driver_locations dl ON dl.driver_id=o.driver_id
      WHERE o.share_token=$1
    `, [token])).rows[0];
    if (!order) throw new AppError("Trip not found", 404, "TRIP_NOT_FOUND");
    const isActive = ACTIVE_ORDER_STATUSES.includes(order.status);
    const driverLocation = isActive && order.driver_lat != null
      ? { lat: Number(order.driver_lat), lng: Number(order.driver_lng) }
      : null;
    let route = null;
    if (driverLocation) {
      try {
        const leg = await buildActiveLegRoute({ order, driverLat: driverLocation.lat, driverLng: driverLocation.lng });
        route = {
          phase: leg.phase,
          distanceMeters: leg.distanceMeters,
          durationSeconds: leg.durationSeconds,
          geometry: leg.geometry,
          fallback: leg.fallback
        };
      } catch {
        route = null;
      }
    }
    res.json({
      trip: {
        status: order.status,
        publicStatus: publicOrderStatus(order.status),
        tariff: order.tariff,
        pickupText: order.pickup_text,
        dropoffText: order.dropoff_text,
        pickupLat: order.pickup_lat != null ? Number(order.pickup_lat) : null,
        pickupLng: order.pickup_lng != null ? Number(order.pickup_lng) : null,
        dropoffLat: order.dropoff_lat != null ? Number(order.dropoff_lat) : null,
        dropoffLng: order.dropoff_lng != null ? Number(order.dropoff_lng) : null,
        driverName: order.driver_name,
        driverCar: [order.driver_car_color, order.driver_car_model].filter(Boolean).join(" ") || null,
        driverPlate: order.driver_plate,
        driverAvatarUrl: order.driver_avatar_url,
        driverLocation,
        route,
        createdAt: order.created_at
      }
    });
  } catch (e) { next(e); }
});

router.post("/promo/validate", requireAuth, requireRole("CLIENT"), rateLimit({ prefix: "promo-validate", windowMs: 60_000, max: 20 }), async (req, res, next) => {
  try {
    const body = z.object({
      code: z.string().trim().min(2).max(40),
      regionId: z.string().uuid(),
      orderPriceKzt: z.coerce.number().int().positive()
    }).parse(req.body);
    const client = (await query("SELECT id FROM clients WHERE user_id=$1", [req.user.id])).rows[0];
    const promo = await findValidPromoCode({
      code: body.code,
      regionId: body.regionId,
      clientId: client?.id,
      orderPriceKzt: body.orderPriceKzt,
      executor: { query }
    });
    const discountAmountKzt = calculatePromoDiscount(promo, body.orderPriceKzt);
    res.json({
      promo: {
        code: promo.code,
        discountAmountKzt,
        finalPriceKzt: body.orderPriceKzt - discountAmountKzt
      }
    });
  } catch (e) { next(e); }
});

router.post("/", requireAuth, requireRole("CLIENT"), rateLimit({ prefix: "orders-create", windowMs: 60_000, max: 20 }), async (req, res, next) => {
  try {
    const body = CreateOrder.parse(req.body);
    const order = await tx(async (client) => {
      const pricing = await prepareOrderPricing(body, client);

      let finalPrice = pricing.estimatedPrice;
      let serviceCommission = pricing.serviceCommission;
      let offeredPriceKzt = null;
      if (body.offeredPriceKzt) {
        const { minAllowed, maxAllowed } = offeredPriceBounds(pricing.estimatedPrice);
        if (body.offeredPriceKzt < minAllowed || body.offeredPriceKzt > maxAllowed) {
          throw new AppError("Offered price is outside allowed bounds", 400, "OFFERED_PRICE_OUT_OF_BOUNDS", {
            minAllowed,
            maxAllowed,
            estimatedPrice: pricing.estimatedPrice
          });
        }
        offeredPriceKzt = body.offeredPriceKzt;
        finalPrice = offeredPriceKzt;
        const commissionPercent = Number(pricing.tariff.service_commission_percent ?? 0);
        serviceCommission = Math.round((finalPrice * commissionPercent) / 100);
      }

      const rider = (await client.query(`
        INSERT INTO clients(user_id, name, phone)
        VALUES($1,$2,$3)
        ON CONFLICT (phone) DO UPDATE SET name=EXCLUDED.name, user_id=COALESCE(clients.user_id, EXCLUDED.user_id)
        RETURNING *
      `, [req.user.id, body.riderName, body.riderPhone])).rows[0];

      // A promo code and a rider-proposed price both change what's charged —
      // combining them would make the discount math ambiguous, so a promo
      // only applies when the rider accepted the calculated estimate as-is.
      let promo = null;
      let promoDiscountKzt = 0;
      if (body.promoCode && !offeredPriceKzt) {
        promo = await findValidPromoCode({
          code: body.promoCode,
          regionId: pricing.regionId,
          clientId: rider.id,
          orderPriceKzt: finalPrice,
          executor: client
        });
        promoDiscountKzt = calculatePromoDiscount(promo, finalPrice);
        finalPrice -= promoDiscountKzt;
        const commissionPercent = Number(pricing.tariff.service_commission_percent ?? 0);
        serviceCommission = Math.round((finalPrice * commissionPercent) / 100);
      }

      const activeOrder = (await client.query(`
        SELECT id, short_id, status
        FROM orders
        WHERE client_id=$1 AND status = ANY($2::text[])
        ORDER BY created_at DESC
        LIMIT 1
      `, [rider.id, CLIENT_ACTIVE_ORDER_STATUSES])).rows[0];
      if (activeOrder) {
        throw new AppError("Client already has an active order", 409, "CLIENT_HAS_ACTIVE_ORDER", {
          orderId: activeOrder.id,
          shortId: activeOrder.short_id,
          status: activeOrder.status
        });
      }

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
        finalPrice,
        pricing.pricingSnapshot.distanceKm,
        pricing.pricingSnapshot.durationMin,
        serviceCommission,
        JSON.stringify(pricing.pricingSnapshot),
        body.notes,
        offeredPriceKzt,
        promo?.id ?? null,
        promoDiscountKzt
      ]);

      if (promo) {
        await recordPromoRedemption({
          promoId: promo.id,
          clientId: rider.id,
          orderId: created.id,
          discountAmountKzt: promoDiscountKzt,
          executor: client
        });
      }

      await client.query("INSERT INTO order_status_history(order_id,status,message) VALUES($1,'SEARCHING_DRIVER','Order created')", [created.id]);
      await client.query(`
        INSERT INTO payments(order_id, method, status, amount, currency)
        VALUES($1,$2,'PENDING',$3,'KZT')
      `, [created.id, body.paymentMethod, finalPrice]);
      await writeAudit(client, {
        action: "order_created",
        entityType: "order",
        entityId: created.id,
        metadata: {
          shortId: created.short_id,
          regionId: created.region_id,
          tariff: created.tariff,
          paymentMethod: created.payment_method,
          price: created.price,
          offeredPriceKzt,
          promoCode: promo?.code ?? null,
          promoDiscountKzt,
          estimatedPrice: pricing.estimatedPrice
        },
        req
      });
      return created;
    });

    emitOrderCreated(req.io, order);
    res.status(201).json({ order: publicOrderResponse(order) });
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
      if (!["SEARCHING_DRIVER", "NEW", "DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT", "DRIVER_ARRIVED", "WAITING_CLIENT", "DRIVER_ASSIGNED"].includes(existing.status)) {
        throw new AppError("Invalid order status transition", 409, "INVALID_STATUS_TRANSITION", {
          currentStatus: existing.status,
          nextStatus: "CANCELLED_BY_CLIENT"
        });
      }

      const updated = (await client.query("UPDATE orders SET status='CANCELLED_BY_CLIENT', cancelled_at=NOW() WHERE id=$1 RETURNING *", [existing.id])).rows[0];
      if (updated.driver_id) await client.query("UPDATE drivers SET status='FREE' WHERE id=$1", [updated.driver_id]);
      await client.query("UPDATE payments SET status='CANCELLED', updated_at=NOW() WHERE order_id=$1 AND status IN ('PENDING','PROCESSING')", [updated.id]);
      await createOrderCancelledTransaction(updated, null, client);
      await client.query("INSERT INTO order_status_history(order_id,status,message) VALUES($1,'CANCELLED_BY_CLIENT','Cancelled by client')", [updated.id]);
      await writeAudit(client, {
        action: "order_status_changed",
        entityType: "order",
        entityId: updated.id,
        metadata: { from: existing.status, to: "CANCELLED_BY_CLIENT", source: "client" },
        req
      });
      return (await client.query(`
        SELECT ${ORDER_SELECT}
        FROM orders o
        LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
        WHERE o.id=$1
      `, [updated.id])).rows[0];
    });
    emitOrderUpdated(req.io, order);
    res.json({ order: publicOrderResponse(order) });
  } catch (e) { next(e); }
});

router.get("/", requireAuth, requireRole("OWNER", "FINANCE", "DRIVER"), async (req, res, next) => {
  try {
    const params = z.object({
      status: OrderStatus.optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
      offset: z.coerce.number().int().min(0).default(0)
    }).parse(req.query);
    let result;
    let total;
    if (req.user.role === "DRIVER") {
      let driver = (await query("SELECT * FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
      if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
      driver = await syncDriverAvailability(driver, query);
      result = { rows: await listOrdersForDriver({
        driver,
        status: params.status,
        limit: params.limit,
        executor: { query },
        orderSelect: ORDER_SELECT
      }) };
    } else {
      total = (await (params.status
        ? query("SELECT COUNT(*)::int total FROM orders WHERE status=$1", [params.status])
        : query("SELECT COUNT(*)::int total FROM orders"))).rows[0].total;
      result = params.status
        ? await query(`SELECT ${ORDER_SELECT} FROM orders o LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id WHERE o.status=$1 ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`, [params.status, params.limit, params.offset])
        : await query(`SELECT ${ORDER_SELECT} FROM orders o LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id ORDER BY o.created_at DESC LIMIT $1 OFFSET $2`, [params.limit, params.offset]);
    }
    res.json({
      orders: result.rows.map(publicOrderResponse),
      ...(total !== undefined ? { total, limit: params.limit, offset: params.offset } : {})
    });
  } catch (e) { next(e); }
});

router.get("/me/active", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const client = (await query("SELECT id FROM clients WHERE user_id=$1", [req.user.id])).rows[0];
    if (!client) return res.json({ order: null });
    const order = (await query(`
      SELECT ${ORDER_SELECT}
      FROM orders o
      LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
      WHERE o.client_id=$1 AND o.status = ANY($2::text[])
      ORDER BY o.created_at DESC
      LIMIT 1
    `, [client.id, CLIENT_ACTIVE_ORDER_STATUSES])).rows[0] || null;
    res.json({ order: order ? publicOrderResponse(order) : null });
  } catch (e) { next(e); }
});

const HistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

// Finished trips only (not the active one) — receipts/history the rider can
// look back through, same shape as every other order response so the app's
// existing OrderSummary parsing works without a special case.
router.get("/me/history", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const params = HistoryQuery.parse(req.query);
    const client = (await query("SELECT id FROM clients WHERE user_id=$1", [req.user.id])).rows[0];
    if (!client) return res.json({ orders: [] });
    const orders = (await query(`
      SELECT ${ORDER_SELECT}
      FROM orders o
      LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
      WHERE o.client_id=$1 AND NOT (o.status = ANY($2::text[]))
      ORDER BY o.created_at DESC
      LIMIT $3
    `, [client.id, CLIENT_ACTIVE_ORDER_STATUSES, params.limit])).rows;
    res.json({ orders: orders.map(publicOrderResponse) });
  } catch (e) { next(e); }
});

// Driver-side equivalent of /me/history — a real trip/earnings list instead
// of just today's aggregate stats.
router.get("/me/driver-history", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const params = HistoryQuery.parse(req.query);
    const driver = (await query("SELECT id FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
    if (!driver) return res.json({ orders: [] });
    const orders = (await query(`
      SELECT ${ORDER_SELECT}
      FROM orders o
      LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
      WHERE o.driver_id=$1 AND NOT (o.status = ANY($2::text[]))
      ORDER BY o.created_at DESC
      LIMIT $3
    `, [driver.id, ACTIVE_ORDER_STATUSES, params.limit])).rows;
    res.json({ orders: orders.map(publicOrderResponse) });
  } catch (e) { next(e); }
});

router.get("/:id/status-history", requireAuth, async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const order = (await query(`
      SELECT ${ORDER_SELECT}
      FROM orders o
      LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
      WHERE o.id=$1
    `, [id])).rows[0];
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    if (req.user.role === "CLIENT") {
      const client = (await query("SELECT id FROM clients WHERE user_id=$1", [req.user.id])).rows[0];
      if (!client || client.id !== order.client_id) throw new AppError("Forbidden order", 403, "FORBIDDEN_ORDER");
    } else if (req.user.role === "DRIVER") {
      const driver = (await query("SELECT id FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
      if (!driver || driver.id !== order.driver_id) throw new AppError("Forbidden order", 403, "FORBIDDEN_ORDER");
    } else if (!["OWNER", "FINANCE"].includes(req.user.role)) {
      throw new AppError("Forbidden order", 403, "FORBIDDEN_ORDER");
    }
    const history = (await query(`
      SELECT id, status, message, actor_user_id, created_at
      FROM order_status_history
      WHERE order_id=$1
      ORDER BY created_at ASC
    `, [id])).rows;
    res.json({ order: publicOrderResponse(order), history });
  } catch (e) { next(e); }
});

router.post("/:id/rate", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const body = RateOrder.parse(req.body);
    let driverAutoBlocked = false;
    const order = await tx(async (client) => {
      const existing = (await client.query(`
        SELECT o.*, d.name AS driver_name, d.phone AS driver_phone, d.car_model AS driver_car_model,
               d.plate AS driver_plate, d.rating AS driver_rating
        FROM orders o
        LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
        WHERE o.id=$1
        FOR UPDATE OF o
      `, [id])).rows[0];
      if (!existing) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
      const clientProfile = (await client.query("SELECT id FROM clients WHERE user_id=$1", [req.user.id])).rows[0];
      if (!clientProfile || clientProfile.id !== existing.client_id) throw new AppError("Forbidden order", 403, "FORBIDDEN_ORDER");
      const previous = (await client.query("SELECT id FROM driver_reviews WHERE order_id=$1 LIMIT 1", [existing.id])).rows[0];
      if (previous) throw new AppError("Order already rated", 409, "ORDER_ALREADY_RATED");
      if (existing.status !== "PAID") {
        throw new AppError("Order must be paid before rating", 409, "ORDER_NOT_PAID", {
          currentStatus: existing.status,
          requiredStatus: "PAID"
        });
      }
      if (!existing.driver_id) throw new AppError("Order has no driver to rate", 409, "ORDER_DRIVER_MISSING");

      await client.query(`
        INSERT INTO driver_reviews(order_id, driver_id, client_id, rating, tags, comment)
        VALUES($1,$2,$3,$4,$5,$6)
      `, [existing.id, existing.driver_id, existing.client_id, body.rating, body.tags, body.comment || null]);
      const ratingStats = (await client.query(
        "SELECT AVG(rating)::numeric(3,2) AS avg_rating, COUNT(*)::int AS review_count FROM driver_reviews WHERE driver_id=$1",
        [existing.driver_id]
      )).rows[0];
      const avgRating = Number(ratingStats.avg_rating || body.rating);
      await client.query("UPDATE drivers SET rating=$1 WHERE id=$2", [avgRating, existing.driver_id]);

      // Anti-fraud: a driver who consistently rates below the threshold over
      // enough trips to rule out one bad review gets suspended automatically
      // instead of waiting for an operator to notice. Only fires once — a
      // driver already blocked (for this or any other reason) isn't touched
      // again, and an operator can always review/unblock manually afterward.
      if (ratingStats.review_count >= DRIVER_AUTO_BLOCK_MIN_REVIEWS && avgRating < DRIVER_AUTO_BLOCK_RATING_THRESHOLD) {
        const driverRow = (await client.query("SELECT is_blocked FROM drivers WHERE id=$1 FOR UPDATE", [existing.driver_id])).rows[0];
        if (driverRow && !driverRow.is_blocked) {
          await client.query("UPDATE drivers SET is_blocked=true, status='OFFLINE' WHERE id=$1", [existing.driver_id]);
          await writeAudit(client, {
            action: "driver_auto_blocked",
            entityType: "driver",
            entityId: existing.driver_id,
            metadata: { avgRating, reviewCount: ratingStats.review_count, reason: "low_rating" },
            req
          });
          driverAutoBlocked = true;
        }
      }

      await client.query("UPDATE orders SET status='RATED' WHERE id=$1", [existing.id]);
      await client.query("INSERT INTO order_status_history(order_id,status,message,actor_user_id) VALUES($1,'RATED','Client rated trip',$2)", [existing.id, req.user.id]);
      await writeAudit(client, {
        action: "order_rated",
        actorUserId: req.user.id,
        entityType: "order",
        entityId: existing.id,
        metadata: { rating: body.rating, tags: body.tags },
        req
      });
      return (await client.query(`
        SELECT ${ORDER_SELECT}
        FROM orders o
        LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
        WHERE o.id=$1
      `, [existing.id])).rows[0];
    });
    emitOrderUpdated(req.io, order, "order.rated");
    if (driverAutoBlocked) {
      notifyOrderDriver(order, {
        title: "Аккаунт временно заблокирован",
        body: "Средний рейтинг опустился ниже минимального. Обратитесь в поддержку SmartTaxi.",
        type: "DRIVER_AUTO_BLOCKED"
      }).catch((error) => console.error("[push] notifyOrderDriver failed", error));
    }
    res.status(201).json({ order: publicOrderResponse(order) });
  } catch (e) { next(e); }
});

// Driver's counterpart to POST /:id/rate (client rates driver) — same body
// shape, same "one review per order" guard, but writes client_reviews and
// keeps clients.rating in sync instead of drivers.rating. No anti-fraud
// auto-block here: that's a driver-specific business rule tied to service
// commission risk, not something that applies symmetrically to riders.
router.post("/:id/rate-client", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const body = RateOrder.parse(req.body);
    const order = await tx(async (client) => {
      const existing = (await client.query(`
        SELECT o.*
        FROM orders o
        WHERE o.id=$1
        FOR UPDATE OF o
      `, [id])).rows[0];
      if (!existing) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
      const driverProfile = (await client.query("SELECT id FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
      if (!driverProfile || driverProfile.id !== existing.driver_id) throw new AppError("Forbidden order", 403, "FORBIDDEN_ORDER");
      if (!existing.client_id) throw new AppError("Order has no client to rate", 409, "ORDER_CLIENT_MISSING");
      const previous = (await client.query("SELECT id FROM client_reviews WHERE order_id=$1 LIMIT 1", [existing.id])).rows[0];
      if (previous) throw new AppError("Order already rated", 409, "ORDER_ALREADY_RATED");
      // Trip must be finished and paid — same "PAID" gate as the client-rates-driver
      // endpoint, plus the RATED/COMPLETED states so whichever side rates second
      // (client rating moves the order to RATED) isn't locked out.
      if (!["PAID", "RATED", "COMPLETED"].includes(existing.status)) {
        throw new AppError("Order must be completed before rating", 409, "ORDER_NOT_COMPLETED", {
          currentStatus: existing.status,
          requiredStatus: "PAID"
        });
      }

      await client.query(`
        INSERT INTO client_reviews(order_id, driver_id, client_id, rating, tags, comment)
        VALUES($1,$2,$3,$4,$5,$6)
      `, [existing.id, existing.driver_id, existing.client_id, body.rating, body.tags, body.comment || null]);
      const ratingStats = (await client.query(
        "SELECT AVG(rating)::numeric(3,2) AS avg_rating FROM client_reviews WHERE client_id=$1",
        [existing.client_id]
      )).rows[0];
      const avgRating = Number(ratingStats.avg_rating || body.rating);
      await client.query("UPDATE clients SET rating=$1 WHERE id=$2", [avgRating, existing.client_id]);

      await writeAudit(client, {
        action: "client_rated",
        actorUserId: req.user.id,
        entityType: "order",
        entityId: existing.id,
        metadata: { rating: body.rating, tags: body.tags },
        req
      });
      return (await client.query(`
        SELECT ${ORDER_SELECT}
        FROM orders o
        LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
        WHERE o.id=$1
      `, [existing.id])).rows[0];
    });
    res.status(201).json({ order: publicOrderResponse(order) });
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
        LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
        WHERE o.id=$1
      `, [accepted.order.id])).rows[0];
    });
    emitOrderUpdated(req.io, order, "order_accepted");
    notifyOrderClient(order, {
      title: "Водитель найден",
      body: order.driver_name ? `${order.driver_name} едет за вами` : "Водитель уже в пути к вам",
      type: "DRIVER_FOUND"
    }).catch((error) => console.error("[push] notifyOrderClient failed", error));
    res.json({ order: publicOrderResponse(order) });
  } catch (e) { next(e); }
});

const PriceOfferBody = z.object({
  priceKzt: z.coerce.number().int().positive().max(1_000_000)
});

router.post("/:id/price-offer", requireAuth, requireRole("DRIVER"), rateLimit({ prefix: "orders-price-offer", windowMs: 60_000, max: 20 }), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const body = PriceOfferBody.parse(req.body);
    const order = await tx(async (client) => {
      const target = (await client.query("SELECT price FROM orders WHERE id=$1", [id])).rows[0];
      if (!target) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
      const { minAllowed, maxAllowed } = offeredPriceBounds(target.price);
      if (body.priceKzt < minAllowed || body.priceKzt > maxAllowed) {
        throw new AppError("Offered price is outside allowed bounds", 400, "OFFERED_PRICE_OUT_OF_BOUNDS", {
          minAllowed,
          maxAllowed
        });
      }
      const result = await submitDriverPriceOffer({ orderId: id, userId: req.user.id, priceKzt: body.priceKzt, executor: client });
      await writeAudit(client, {
        action: "order_driver_price_offer_submitted",
        actorUserId: req.user.id,
        entityType: "order",
        entityId: result.order.id,
        metadata: { driverId: result.driver.id, priceKzt: body.priceKzt },
        req
      });
      return (await client.query(`
        SELECT ${ORDER_SELECT}
        FROM orders o
        LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
        WHERE o.id=$1
      `, [result.order.id])).rows[0];
    });
    emitOrderUpdated(req.io, order, "order.driver_price_offer");
    notifyOrderClient(order, {
      title: "Водитель предложил свою цену",
      body: `Новая цена поездки: ${order.driver_offer_price_kzt} ₸`,
      type: "DRIVER_PRICE_OFFER"
    }).catch((error) => console.error("[push] notifyOrderClient failed", error));
    res.status(201).json({ order: publicOrderResponse(order) });
  } catch (e) { next(e); }
});

router.post("/:id/price-offer/respond", requireAuth, requireRole("CLIENT"), rateLimit({ prefix: "orders-price-offer-respond", windowMs: 60_000, max: 30 }), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const body = z.object({ accept: z.boolean() }).parse(req.body);
    let offerDriverId = null;
    const order = await tx(async (client) => {
      const before = (await client.query("SELECT driver_offer_by_driver_id FROM orders WHERE id=$1", [id])).rows[0];
      offerDriverId = before?.driver_offer_by_driver_id ?? null;
      const result = await respondToDriverPriceOffer({ orderId: id, clientUserId: req.user.id, accept: body.accept, executor: client });
      await writeAudit(client, {
        action: body.accept ? "order_driver_price_offer_accepted" : "order_driver_price_offer_declined",
        actorUserId: req.user.id,
        entityType: "order",
        entityId: result.order.id,
        metadata: { driverId: offerDriverId, priceKzt: result.order.driver_offer_price_kzt },
        req
      });
      return (await client.query(`
        SELECT ${ORDER_SELECT}
        FROM orders o
        LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
        WHERE o.id=$1
      `, [result.order.id])).rows[0];
    });
    emitOrderUpdated(req.io, order, body.accept ? "order.driver_price_offer_accepted" : "order.driver_price_offer_declined");
    if (offerDriverId) {
      notifyOrderDriver({ driver_id: offerDriverId }, body.accept
        ? { title: "Клиент принял вашу цену", body: "Поездка назначена вам", type: "DRIVER_PRICE_OFFER_ACCEPTED" }
        : { title: "Клиент отклонил вашу цену", body: "Можете предложить другую цену или взять другой заказ", type: "DRIVER_PRICE_OFFER_DECLINED" }
      ).catch((error) => console.error("[push] notifyOrderDriver failed", error));
    }
    res.json({ order: publicOrderResponse(order) });
  } catch (e) { next(e); }
});

// Rider counters the driver's price instead of just accepting/declining it --
// only valid while the driver's proposal is still the one pending (see
// submitClientCounterOffer). Once submitted, it's the driver's turn via
// price-offer/driver-respond below.
router.post("/:id/price-offer/counter", requireAuth, requireRole("CLIENT"), rateLimit({ prefix: "orders-price-offer-counter", windowMs: 60_000, max: 30 }), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const body = PriceOfferBody.parse(req.body);
    const order = await tx(async (client) => {
      const target = (await client.query("SELECT price FROM orders WHERE id=$1", [id])).rows[0];
      if (!target) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
      const { minAllowed, maxAllowed } = offeredPriceBounds(target.price);
      if (body.priceKzt < minAllowed || body.priceKzt > maxAllowed) {
        throw new AppError("Offered price is outside allowed bounds", 400, "OFFERED_PRICE_OUT_OF_BOUNDS", {
          minAllowed,
          maxAllowed
        });
      }
      const result = await submitClientCounterOffer({ orderId: id, clientUserId: req.user.id, priceKzt: body.priceKzt, executor: client });
      await writeAudit(client, {
        action: "order_client_counter_offer_submitted",
        actorUserId: req.user.id,
        entityType: "order",
        entityId: result.order.id,
        metadata: { driverId: result.driverId, priceKzt: body.priceKzt },
        req
      });
      return { row: (await client.query(`
        SELECT ${ORDER_SELECT}
        FROM orders o
        LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
        WHERE o.id=$1
      `, [result.order.id])).rows[0], driverId: result.driverId };
    });
    emitOrderUpdated(req.io, order.row, "order.client_counter_offer");
    notifyOrderDriver({ driver_id: order.driverId }, {
      title: "Клиент предложил свою цену",
      body: `Новая цена поездки: ${order.row.driver_offer_price_kzt} ₸`,
      type: "CLIENT_COUNTER_OFFER"
    }).catch((error) => console.error("[push] notifyOrderDriver failed", error));
    res.status(201).json({ order: publicOrderResponse(order.row) });
  } catch (e) { next(e); }
});

// Driver's response to the rider's counter — accept assigns the order at
// that price (same end state as any other acceptance path), decline just
// clears the offer; the driver can still submit a fresh price-offer
// afterward, same as declining the other direction.
router.post("/:id/price-offer/driver-respond", requireAuth, requireRole("DRIVER"), rateLimit({ prefix: "orders-price-offer-driver-respond", windowMs: 60_000, max: 30 }), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const body = z.object({ accept: z.boolean() }).parse(req.body);
    const order = await tx(async (client) => {
      const result = await respondToClientCounterOffer({ orderId: id, driverUserId: req.user.id, accept: body.accept, executor: client });
      await writeAudit(client, {
        action: body.accept ? "order_client_counter_offer_accepted" : "order_client_counter_offer_declined",
        actorUserId: req.user.id,
        entityType: "order",
        entityId: result.order.id,
        metadata: { priceKzt: result.order.driver_offer_price_kzt },
        req
      });
      return (await client.query(`
        SELECT ${ORDER_SELECT}
        FROM orders o
        LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
        WHERE o.id=$1
      `, [result.order.id])).rows[0];
    });
    emitOrderUpdated(req.io, order, body.accept ? "order.client_counter_offer_accepted" : "order.client_counter_offer_declined");
    notifyOrderClient(order, body.accept
      ? { title: "Водитель принял вашу цену", body: "Водитель уже едет к вам", type: "CLIENT_COUNTER_OFFER_ACCEPTED" }
      : { title: "Водитель отклонил вашу цену", body: "Можете предложить другую цену", type: "CLIENT_COUNTER_OFFER_DECLINED" }
    ).catch((error) => console.error("[push] notifyOrderClient failed", error));
    res.json({ order: publicOrderResponse(order) });
  } catch (e) { next(e); }
});

// Fixed vocabulary, not free text — keeps this a lightweight status ping
// (no chat UI, no moderation surface to build) while still covering the
// handful of things riders and drivers actually need to say mid-trip.
const QUICK_MESSAGES = {
  I_ARRIVED: "Я приехал",
  WAITING_AT_ENTRANCE: "Жду у входа",
  RUNNING_LATE_2MIN: "Опаздываю на 2 минуты",
  PLEASE_COME_OUT: "Пожалуйста, выходите",
  ON_MY_WAY: "Уже еду к вам"
};

const QuickMessageBody = z.object({
  messageKey: z.enum(Object.keys(QUICK_MESSAGES))
});

router.post("/:id/quick-message", requireAuth, requireRole("CLIENT", "DRIVER"), rateLimit({ prefix: "orders-quick-message", windowMs: 60_000, max: 10 }), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const body = QuickMessageBody.parse(req.body);
    const order = (await query(`
      SELECT ${ORDER_SELECT}
      FROM orders o
      LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
      WHERE o.id=$1
    `, [id])).rows[0];
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");

    let notifyDriver;
    if (req.user.role === "CLIENT") {
      const client = (await query("SELECT id FROM clients WHERE user_id=$1", [req.user.id])).rows[0];
      if (!client || client.id !== order.client_id) throw new AppError("Forbidden order", 403, "FORBIDDEN_ORDER");
      notifyDriver = true;
    } else {
      const driver = (await query("SELECT id FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
      if (!driver || driver.id !== order.driver_id) throw new AppError("Forbidden order", 403, "FORBIDDEN_ORDER");
      notifyDriver = false;
    }

    const text = QUICK_MESSAGES[body.messageKey];
    const payload = { title: notifyDriver ? "Сообщение от клиента" : "Сообщение от водителя", body: text, type: "QUICK_MESSAGE", data: { messageKey: body.messageKey } };
    (notifyDriver ? notifyOrderDriver(order, payload) : notifyOrderClient(order, payload))
      .catch((error) => console.error("[push] quick-message notify failed", error));

    res.status(201).json({ delivered: true, messageKey: body.messageKey, text });
  } catch (e) { next(e); }
});

router.post("/:id/assign-driver", requireAuth, requireRole("OWNER"), async (req, res, next) => {
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
      if (!OPEN_ORDER_STATUSES.includes(existing.status) || existing.driver_id) throw new AppError("Order already accepted", 409, "ORDER_ALREADY_ACCEPTED");
      if (existing.region_id !== driver.current_region_id) throw new AppError("Order is outside driver's current region", 403, "ORDER_REGION_MISMATCH");

      await client.query("UPDATE orders SET status='DRIVER_FOUND', driver_id=$1, accepted_at=NOW() WHERE id=$2", [driver.id, existing.id]);
      await client.query("UPDATE drivers SET status='BUSY', last_seen_at=NOW() WHERE id=$1", [driver.id]);
      await client.query("INSERT INTO order_status_history(order_id,status,message,actor_user_id) VALUES($1,'DRIVER_FOUND','Driver assigned by operator',$2)", [existing.id, req.user.id]);
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
        LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
        WHERE o.id=$1
      `, [existing.id])).rows[0];
    });
    emitOrderUpdated(req.io, order, "order_assigned");
    notifyOrderClient(order, {
      title: "Водитель найден",
      body: order.driver_name ? `${order.driver_name} едет за вами` : "Водитель уже в пути к вам",
      type: "DRIVER_FOUND"
    }).catch((error) => console.error("[push] notifyOrderClient failed", error));
    res.json({ order: publicOrderResponse(order) });
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
      let extraParams = [];
      if (status === "DRIVER_ARRIVED") extra = ", arrived_at=NOW(), driver_arrived_at=NOW()";
      if (status === "WAITING_CLIENT") {
        extra = ", waiting_started_at=COALESCE(waiting_started_at,NOW()), free_waiting_until=COALESCE(free_waiting_until,NOW() + (COALESCE((pricing_snapshot->>'freeWaitingMinutes')::int, 0) || ' minutes')::interval), waiting_price_per_minute=COALESCE(waiting_price_per_minute, COALESCE((pricing_snapshot->>'waitingPricePerMinute')::int, 0))";
      }
      if (status === "TRIP_STARTED") {
        // Paid waiting stops accruing the moment the trip starts. If the
        // free window had already run out by now, freeze how much billable
        // waiting time happened (started_at - paid_waiting_started_at) into
        // waiting_total right here — this is the only point where both
        // paid_waiting_started_at and the trip's actual start time are known
        // together, and waiting_total otherwise never gets a value at all
        // (see TRIP_COMPLETED below for where it gets billed).
        const now = new Date();
        let paidWaitingStartedAt = existing.paid_waiting_started_at || null;
        if (existing.free_waiting_until && now > new Date(existing.free_waiting_until)) {
          paidWaitingStartedAt = existing.free_waiting_until;
        }
        const waitingMinutes = paidWaitingStartedAt
          ? Math.max(0, (now.getTime() - new Date(paidWaitingStartedAt).getTime()) / 60000)
          : 0;
        const waitingTotal = Math.round(waitingMinutes * Number(existing.waiting_price_per_minute || 0));
        extra = ", started_at=NOW(), paid_waiting_started_at=$3, waiting_total=$4";
        extraParams = [paidWaitingStartedAt, waitingTotal];
      }
      if (status === "TRIP_COMPLETED") extra = ", completed_at=NOW(), payment_status='PENDING'";
      if (status === "PAYMENT_PENDING") extra = ", payment_status='PENDING'";
      if (status === "PAID") extra = ", payment_status='PAID'";
      if (["CANCELLED_BY_CLIENT", "CANCELLED_BY_DRIVER", "CANCELLED_BY_OPERATOR", "NO_SHOW"].includes(status)) extra = ", cancelled_at=NOW()";

      const u = await client.query(`UPDATE orders SET status=$1 ${extra} WHERE id=$2 RETURNING *`, [status, existing.id, ...extraParams]);
      let updated = u.rows[0];

      if (status === "TRIP_COMPLETED") {
        const tariff = (await client.query("SELECT * FROM tariffs WHERE region_id=$1 AND name=$2", [updated.region_id, updated.tariff])).rows[0];
        if (!tariff) throw new AppError("Tariff not found", 404, "TARIFF_NOT_FOUND");

        // Paid waiting time (frozen into waiting_total at TRIP_STARTED above)
        // isn't billed anywhere else — fold it into price/service_commission
        // here, before cashback and driver payout are computed off of them.
        // pricing_snapshot is updated too since finance.service.js's
        // orderAmounts() prefers snapshot.finalPrice over the live price
        // column for the ledger entry — without this the ledger would keep
        // reporting the pre-waiting estimate forever.
        if (Number(updated.waiting_total) > 0) {
          const waitingCommission = Math.round(Number(updated.waiting_total) * Number(tariff.service_commission_percent) / 100);
          const withWaiting = await client.query(`
            UPDATE orders
            SET price=price+$1,
                service_commission=service_commission+$2,
                pricing_snapshot = pricing_snapshot || jsonb_build_object(
                  'finalPrice', price+$1,
                  'serviceCommission', service_commission+$2,
                  'driverEarning', (price+$1)-(service_commission+$2),
                  'waitingTotal', $1
                )
            WHERE id=$3
            RETURNING *
          `, [updated.waiting_total, waitingCommission, updated.id]);
          updated = withWaiting.rows[0];
        }

        // Per-driver commission override (commission_overrides, previously
        // unused): only ever read here, at the trip's own completion — never
        // retroactively re-applied to already-completed orders. Replaces
        // the tariff-rate commission on the whole trip (base + waiting)
        // rather than blending two different percentages on one order.
        // Must also update pricing_snapshot.serviceCommission/driverEarning,
        // not just the column — finance.service.js#orderAmounts() prefers
        // the snapshot for the ledger entry created below.
        if (updated.driver_id) {
          const override = (await client.query(
            "SELECT percent FROM commission_overrides WHERE driver_id=$1 AND active=true",
            [updated.driver_id]
          )).rows[0];
          if (override) {
            const overriddenCommission = Math.round(Number(updated.price) * Number(override.percent) / 100);
            const withOverride = await client.query(`
              UPDATE orders
              SET service_commission=$1,
                  pricing_snapshot = pricing_snapshot || jsonb_build_object(
                    'serviceCommission', $1,
                    'driverEarning', price-$1,
                    'serviceCommissionPercent', $2
                  )
              WHERE id=$3
              RETURNING *
            `, [overriddenCommission, override.percent, updated.id]);
            updated = withOverride.rows[0];
          }
        }

        const cashback = Math.round(updated.price * Number(tariff.cashback_percent) / 100 / 10) * 10;
        await client.query("UPDATE orders SET cashback_earned=$1 WHERE id=$2", [cashback, updated.id]);
        if (updated.client_id) {
          const c = await client.query("UPDATE clients SET cashback_balance=cashback_balance+$1 WHERE id=$2 RETURNING cashback_balance", [cashback, updated.client_id]);
          await client.query("INSERT INTO cashback_transactions(client_id,order_id,type,amount,balance_after) VALUES($1,$2,'EARN',$3,$4)", [updated.client_id, updated.id, cashback, c.rows[0].cashback_balance]);
          await awardReferralBonusOnFirstCompletedOrder({ clientId: updated.client_id, orderId: updated.id, executor: client });
        }
        if (updated.driver_id) {
          if (["CASH", "KASPI"].includes(updated.payment_method)) {
            await client.query("UPDATE drivers SET debt=debt+$1,status='FREE' WHERE id=$2", [updated.service_commission, updated.driver_id]);
            await client.query("INSERT INTO driver_debts(driver_id,order_id,amount) VALUES($1,$2,$3)", [updated.driver_id, updated.id, updated.service_commission]);
          } else {
            await client.query("UPDATE drivers SET balance=balance+($1-$2),status='FREE' WHERE id=$3", [updated.price, updated.service_commission, updated.driver_id]);
            // This is also "the next non-cash order" from the driver's
            // perspective — any outstanding CASH/KASPI commission debt gets
            // netted against the balance this trip just credited, instead
            // of sitting untouched next to it until someone notices.
            await settleDriverDebtFromBalance(updated.driver_id, client);
          }
        }
        await createOrderCompletedTransaction(updated, req.user.id, client);
      }
      if (status === "PAID") {
        await client.query("UPDATE payments SET status='PAID', updated_at=NOW() WHERE order_id=$1 AND status IN ('PENDING','PROCESSING')", [updated.id]);
      }
      if (["CANCELLED_BY_CLIENT", "CANCELLED_BY_DRIVER", "CANCELLED_BY_OPERATOR", "NO_SHOW"].includes(status)) {
        if (updated.driver_id) await client.query("UPDATE drivers SET status='FREE' WHERE id=$1", [updated.driver_id]);
        await client.query("UPDATE payments SET status='CANCELLED', updated_at=NOW() WHERE order_id=$1 AND status IN ('PENDING','PROCESSING')", [updated.id]);
        await createOrderCancelledTransaction(updated, req.user.id, client);
      }
      await client.query("INSERT INTO order_status_history(order_id,status,message,actor_user_id) VALUES($1,$2,$3,$4)", [existing.id, status, `Status changed to ${status}`, req.user.id]);
      await writeAudit(client, {
        action: status === "TRIP_COMPLETED" ? "order_completed" : "order_status_changed",
        actorUserId: req.user.id,
        entityType: "order",
        entityId: existing.id,
        metadata: { from: existing.status, to: status },
        req
      });
      return (await client.query(`
        SELECT ${ORDER_SELECT}
        FROM orders o
        LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
        WHERE o.id=$1
      `, [existing.id])).rows[0];
    });
    emitOrderUpdated(req.io, order);
    if (status === "DRIVER_ARRIVED") {
      notifyOrderClient(order, {
        title: "Водитель приехал",
        body: "Ваш водитель на месте и ждёт вас",
        type: "DRIVER_ARRIVED"
      }).catch((error) => console.error("[push] notifyOrderClient failed", error));
    }
    if (status === "TRIP_COMPLETED") {
      notifyOrderClient(order, {
        title: "Поездка завершена",
        body: order.price ? `Стоимость поездки: ${order.price} ₸` : "Спасибо, что выбрали SmartTaxi",
        type: "TRIP_COMPLETED"
      }).catch((error) => console.error("[push] notifyOrderClient failed", error));
    }
    res.json({ order: publicOrderResponse(order) });
  } catch (e) { next(e); }
}

router.post("/:id/going-to-client", requireAuth, requireRole("DRIVER", "OWNER"), (req,res,next)=>updateStatus(req,res,next,"DRIVER_GOING_TO_CLIENT"));
router.post("/:id/arrived", requireAuth, requireRole("DRIVER", "OWNER"), (req,res,next)=>updateStatus(req,res,next,"DRIVER_ARRIVED"));
router.post("/:id/waiting", requireAuth, requireRole("DRIVER", "OWNER"), (req,res,next)=>updateStatus(req,res,next,"WAITING_CLIENT"));
router.post("/:id/start", requireAuth, requireRole("DRIVER", "OWNER"), (req,res,next)=>updateStatus(req,res,next,"TRIP_STARTED"));
router.post("/:id/complete", requireAuth, requireRole("DRIVER", "OWNER"), (req,res,next)=>updateStatus(req,res,next,"TRIP_COMPLETED"));
router.post("/:id/payment-pending", requireAuth, requireRole("OWNER", "FINANCE"), (req,res,next)=>updateStatus(req,res,next,"PAYMENT_PENDING"));
router.post("/:id/mark-paid", requireAuth, requireRole("OWNER", "FINANCE"), (req,res,next)=>updateStatus(req,res,next,"PAID"));
router.post("/:id/no-show", requireAuth, requireRole("DRIVER", "OWNER"), (req,res,next)=>updateStatus(req,res,next,"NO_SHOW"));
// A driver cancelling an order they've already accepted is not the same as
// an operator cancelling it outright: the rider still wants a ride, so this
// reopens the order for dispatch (status back to SEARCHING_DRIVER, driver
// unassigned) instead of the terminal CANCELLED_BY_DRIVER updateStatus()
// would otherwise set. The cancelling driver is stamped onto the order
// (last_cancelled_by_driver_id) so listOrdersForDriver/acceptOrderForDriver
// (order-dispatch.service.js) never route it back to them. Operator
// cancellation keeps the old terminal behavior via updateStatus.
router.post("/:id/cancel", requireAuth, requireRole("DRIVER", "OWNER"), async (req, res, next) => {
  if (req.user.role !== "DRIVER") {
    return updateStatus(req, res, next, "CANCELLED_BY_OPERATOR");
  }
  try {
    const { id } = IdParam.parse(req.params);
    const order = await tx(async (client) => {
      const driver = (await client.query("SELECT * FROM drivers WHERE user_id=$1 FOR UPDATE", [req.user.id])).rows[0];
      if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
      const existing = (await client.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!existing) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
      if (existing.driver_id !== driver.id) throw new AppError("Forbidden order", 403, "FORBIDDEN_ORDER");
      // Reopening for dispatch only makes sense before the trip physically
      // starts — once TRIP_STARTED/IN_PROGRESS the rider is already in this
      // driver's car, so "cancel and let another driver accept" would abandon
      // them mid-ride. Reuse the same pre-pickup-only status list the
      // terminal CANCELLED_BY_DRIVER transition already uses elsewhere, so
      // the two paths can't drift out of sync on what counts as cancellable.
      if (!TRANSITION_RULES.CANCELLED_BY_DRIVER.includes(existing.status)) {
        throw new AppError("Invalid order status transition", 409, "INVALID_STATUS_TRANSITION", {
          currentStatus: existing.status,
          nextStatus: "SEARCHING_DRIVER"
        });
      }

      const updated = (await client.query(`
        UPDATE orders
        SET status='SEARCHING_DRIVER',
            driver_id=NULL,
            accepted_at=NULL,
            arrived_at=NULL,
            driver_arrived_at=NULL,
            waiting_started_at=NULL,
            free_waiting_until=NULL,
            paid_waiting_started_at=NULL,
            waiting_price_per_minute=NULL,
            last_cancelled_by_driver_id=$1,
            last_cancelled_by_driver_at=NOW()
        WHERE id=$2
        RETURNING *
      `, [driver.id, existing.id])).rows[0];
      await client.query("UPDATE drivers SET status='FREE', last_seen_at=NOW() WHERE id=$1", [driver.id]);
      await client.query("UPDATE payments SET status='CANCELLED', updated_at=NOW() WHERE order_id=$1 AND status IN ('PENDING','PROCESSING')", [updated.id]);
      await client.query(
        "INSERT INTO order_status_history(order_id,status,message,actor_user_id) VALUES($1,'SEARCHING_DRIVER','Driver cancelled after accepting; reopened for dispatch',$2)",
        [existing.id, req.user.id]
      );
      await writeAudit(client, {
        action: "order_driver_cancelled_reopened",
        actorUserId: req.user.id,
        entityType: "order",
        entityId: existing.id,
        metadata: { from: existing.status, driverId: driver.id },
        req
      });
      return (await client.query(`
        SELECT ${ORDER_SELECT}
        FROM orders o
        LEFT JOIN drivers d ON d.id=o.driver_id LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
        WHERE o.id=$1
      `, [existing.id])).rows[0];
    });
    emitOrderUpdated(req.io, order, "order_driver_cancelled");
    notifyOrderClient(order, {
      title: "Водитель сменился",
      body: "Водитель отменил поездку — ищем для вас другого",
      type: "DRIVER_CANCELLED"
    }).catch((error) => console.error("[push] notifyOrderClient failed", error));
    res.json({ order: publicOrderResponse(order) });
  } catch (e) { next(e); }
});

export default router;
