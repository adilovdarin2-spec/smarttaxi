import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../../db/pool.js";
import { requireAuth } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import { getPaymentProvider, providerNameForMethod, mapKaspiStatus, verifyKaspiWebhookSignature } from "./payment-provider.js";
import { assertStatusTransition, emitOrderUpdated } from "../orders/order-dispatch.service.js";

const router = Router();
const IdParam = z.object({ id: z.string().uuid() });
const AWAITING_PAYMENT_STATUSES = ["TRIP_COMPLETED", "PAYMENT_PENDING"];

async function loadOrderPayment(executor, orderId) {
  const order = (await executor.query("SELECT * FROM orders WHERE id=$1", [orderId])).rows[0];
  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  const payment = (await executor.query(
    "SELECT * FROM payments WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1",
    [orderId]
  )).rows[0];
  if (!payment) throw new AppError("Payment not found for order", 404, "PAYMENT_NOT_FOUND");
  return { order, payment };
}

async function assertCanAccessOrderPayment(req, order) {
  if (["OWNER", "FINANCE"].includes(req.user.role)) return;
  if (req.user.role === "CLIENT") {
    const client = (await query("SELECT id FROM clients WHERE user_id=$1", [req.user.id])).rows[0];
    if (client && client.id === order.client_id) return;
  }
  if (req.user.role === "DRIVER") {
    const driver = (await query("SELECT id FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
    if (driver && driver.id === order.driver_id) return;
  }
  throw new AppError("Forbidden order", 403, "FORBIDDEN_ORDER");
}

function publicPayment(payment, orderStatus) {
  if (!payment) return null;
  return {
    id: payment.id,
    orderId: payment.order_id,
    method: payment.method,
    provider: payment.provider,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
    failureReason: payment.failure_reason,
    orderStatus,
    createdAt: payment.created_at,
    updatedAt: payment.updated_at
  };
}

// A payment turning PAID doesn't by itself move the order forward — CASH/
// KASPI still go through an operator's mark-paid, but an electronically
// confirmed payment (today: the Kaspi Pay mock) should unlock rating on its
// own. Mirrors the relevant slice of updateStatus(..., "PAID") in
// orders.routes.js without redoing the driver-earnings step, which already
// ran when the order first reached TRIP_COMPLETED.
async function settleOrderIfPaymentConfirmed(order, payment, req) {
  if (payment.status !== "PAID" || !AWAITING_PAYMENT_STATUSES.includes(order.status)) {
    return order;
  }
  return tx(async (client) => {
    const existing = (await client.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [order.id])).rows[0];
    if (!existing || !AWAITING_PAYMENT_STATUSES.includes(existing.status)) return existing || order;
    assertStatusTransition(existing, "PAID");
    const updated = (await client.query(
      "UPDATE orders SET status='PAID', payment_status='PAID' WHERE id=$1 RETURNING *",
      [existing.id]
    )).rows[0];
    await client.query(
      "INSERT INTO order_status_history(order_id,status,message) VALUES($1,'PAID','Payment confirmed electronically')",
      [existing.id]
    );
    await writeAudit(client, {
      action: "order_status_changed",
      entityType: "order",
      entityId: existing.id,
      metadata: { from: existing.status, to: "PAID", source: "payment_provider" },
      req
    });
    emitOrderUpdated(req.io, updated);
    return updated;
  });
}

// Starts (or retries) settlement for an order's payment. Safe to call again
// on a FAILED payment — that's how the mobile app's "Повторить" button works.
router.post("/:id/payments/initiate", requireAuth, async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const result = await tx(async (client) => {
      const { order, payment } = await loadOrderPayment(client, id);
      await assertCanAccessOrderPayment(req, order);
      if (!AWAITING_PAYMENT_STATUSES.includes(order.status)) {
        throw new AppError("Order is not awaiting payment", 409, "ORDER_NOT_AWAITING_PAYMENT", {
          currentStatus: order.status
        });
      }
      if (["PAID", "PROCESSING"].includes(payment.status)) return { order, payment };

      const providerName = providerNameForMethod(payment.method);
      const provider = getPaymentProvider(providerName);
      const outcome = await provider.initiate({ payment, order });

      const updated = (await client.query(`
        UPDATE payments
        SET status=$1, provider=$2, provider_reference=COALESCE($3, provider_reference),
            provider_payload = provider_payload || $4::jsonb, failure_reason=NULL, updated_at=NOW()
        WHERE id=$5
        RETURNING *
      `, [
        outcome.status,
        providerName,
        outcome.providerReference || null,
        JSON.stringify(outcome.payload || {}),
        payment.id
      ])).rows[0];

      await writeAudit(client, {
        action: "payment_initiated",
        actorUserId: req.user.id,
        entityType: "payment",
        entityId: updated.id,
        metadata: { orderId: order.id, provider: providerName, status: updated.status },
        req
      });
      return { order, payment: updated };
    });
    res.json({ payment: publicPayment(result.payment, result.order.status) });
  } catch (e) { next(e); }
});

// Polled by the mobile app while a payment is PROCESSING.
router.get("/:id/payments/status", requireAuth, async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    let { order, payment } = await loadOrderPayment({ query }, id);
    await assertCanAccessOrderPayment(req, order);

    if (payment.status === "PROCESSING") {
      const providerName = payment.provider || providerNameForMethod(payment.method);
      const provider = getPaymentProvider(providerName);
      const outcome = await provider.checkStatus({ payment });
      if (outcome.status !== payment.status) {
        payment = (await query(`
          UPDATE payments
          SET status=$1, provider_payload = provider_payload || $2::jsonb, updated_at=NOW()
          WHERE id=$3
          RETURNING *
        `, [outcome.status, JSON.stringify(outcome.payload || {}), payment.id])).rows[0];
      }
    }

    order = await settleOrderIfPaymentConfirmed(order, payment, req);
    res.json({ payment: publicPayment(payment, order.status) });
  } catch (e) { next(e); }
});

// Kaspi's own signature header name for merchant webhooks isn't confirmed
// from a public source (see payment-provider.js) — X-Kaspi-Signature is
// this module's placeholder name for it, easy to rename to whatever the
// real onboarding docs specify without touching the verification logic
// itself (that lives in verifyKaspiWebhookSignature).
const KASPI_SIGNATURE_HEADER = "x-kaspi-signature";

// Mounted separately (not under /api/orders) at a single fixed path — see
// server.js — because this is the one URL registered once in Kaspi's
// merchant cabinet, not something scoped to an individual order the way
// the rest of this file is. The payload identifies which payment it's
// about via the provider reference stored on our side at initiate() time.
export const kaspiWebhookRouter = Router();

kaspiWebhookRouter.post("/webhook", async (req, res, next) => {
  try {
    const signature = req.headers[KASPI_SIGNATURE_HEADER];
    if (!verifyKaspiWebhookSignature(req.rawBody, signature)) {
      throw new AppError("Invalid webhook signature", 401, "INVALID_WEBHOOK_SIGNATURE");
    }

    const body = req.body || {};
    // Accepts a couple of reasonable shapes for where the reference/status
    // live, since the exact merchant-webhook envelope isn't confirmed
    // (see payment-provider.js module comment) — narrow this once the real
    // payload is known.
    const providerReference = body.paymentId || body.payment?.paymentId || body.mppPaymentId || null;
    const rawStatus = body.status || body.result?.resultCode || null;
    if (!providerReference) {
      throw new AppError("Webhook payload missing payment reference", 400, "WEBHOOK_PAYLOAD_INVALID");
    }

    const payment = (await query("SELECT * FROM payments WHERE provider_reference=$1", [providerReference])).rows[0];
    if (!payment) {
      // Acknowledge anyway: per the documented notifyPayment contract,
      // anything other than {resultCode: SUCCESS} makes Kaspi retry the
      // same notification indefinitely. A reference we don't recognize is
      // not something retrying will fix.
      return res.json({ result: { resultCode: "SUCCESS", resultMessage: "success" } });
    }

    const status = mapKaspiStatus(rawStatus);
    const updatedPayment = (await query(`
      UPDATE payments
      SET status=$1, provider_payload = provider_payload || $2::jsonb, updated_at=NOW()
      WHERE id=$3
      RETURNING *
    `, [status, JSON.stringify({ webhook: body, webhookReceivedAt: new Date().toISOString() }), payment.id])).rows[0];

    const order = (await query("SELECT * FROM orders WHERE id=$1", [updatedPayment.order_id])).rows[0];
    if (order) {
      await settleOrderIfPaymentConfirmed(order, updatedPayment, req);
    }

    await writeAudit(query, {
      action: "kaspi_webhook_received",
      entityType: "payment",
      entityId: updatedPayment.id,
      metadata: { providerReference, mappedStatus: status, orderId: updatedPayment.order_id },
      req
    });

    res.json({ result: { resultCode: "SUCCESS", resultMessage: "success" } });
  } catch (e) { next(e); }
});

export default router;
