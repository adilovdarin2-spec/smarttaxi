import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import {
  MIN_PAYOUT_KZT,
  cancelPayoutRequest,
  createPayoutRequest,
  getWalletSummary,
  listPayoutRequests,
  listWalletTransactions
} from "./wallet.service.js";

const router = Router();

async function getDriverOrThrow(userId) {
  const driver = (await query("SELECT * FROM drivers WHERE user_id=$1", [userId])).rows[0];
  if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
  return driver;
}

router.get("/", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const driver = await getDriverOrThrow(req.user.id);
    const summary = await getWalletSummary(driver.id, query);
    res.json(summary);
  } catch (e) { next(e); }
});

router.get("/transactions", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const params = z.object({
      limit: z.coerce.number().int().min(1).max(100).optional().default(30),
      offset: z.coerce.number().int().min(0).optional().default(0)
    }).parse(req.query);
    const driver = await getDriverOrThrow(req.user.id);
    const result = await listWalletTransactions({ driverId: driver.id, ...params }, query);
    res.json(result);
  } catch (e) { next(e); }
});

// payout_details lives on each driver_payout_requests row, not as a
// persistent field on the driver profile — so "does this driver have
// payout details on file" means "did their most recent payout request
// actually carry any", which also doubles as something to pre-fill a
// details form with. Lets the mobile app show "enter your payout details"
// up front instead of only finding out when a payout request is rejected.
router.get("/payout-details-status", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const driver = await getDriverOrThrow(req.user.id);
    const last = (await query(
      `SELECT method, payout_details FROM driver_payout_requests
       WHERE driver_id=$1 AND payout_details IS NOT NULL AND payout_details <> '{}'::jsonb
       ORDER BY created_at DESC
       LIMIT 1`,
      [driver.id]
    )).rows[0];
    res.json({
      hasPayoutDetails: !!last,
      lastMethod: last?.method || null,
      lastPayoutDetails: last?.payout_details || null
    });
  } catch (e) { next(e); }
});

router.get("/payout-requests", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const params = z.object({
      status: z.enum(["PENDING", "APPROVED", "PAID", "REJECTED", "CANCELLED"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional().default(50)
    }).parse(req.query);
    const driver = await getDriverOrThrow(req.user.id);
    const items = await listPayoutRequests({ driverId: driver.id, ...params }, query);
    res.json({ payoutRequests: items });
  } catch (e) { next(e); }
});

router.post("/payout-requests", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const body = z.object({
      amountKzt: z.coerce.number().int().min(MIN_PAYOUT_KZT),
      method: z.enum(["KASPI_TRANSFER", "CASH"]).optional().default("KASPI_TRANSFER"),
      details: z.record(z.any()).optional().default({})
    }).parse(req.body);

    const result = await tx(async client => {
      const driver = (await client.query("SELECT * FROM drivers WHERE user_id=$1 FOR UPDATE", [req.user.id])).rows[0];
      if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");

      let details = body.details;
      if (body.method === "KASPI_TRANSFER" && Object.keys(details).length === 0) {
        // Omitting details on a repeat request reuses whatever was on the
        // last one that had any — same UX as not re-entering a card number
        // every time. Only a driver who has genuinely never provided any
        // hits the error, which is what GET /payout-details-status is for
        // checking up front.
        const last = (await client.query(
          `SELECT payout_details FROM driver_payout_requests
           WHERE driver_id=$1 AND payout_details IS NOT NULL AND payout_details <> '{}'::jsonb
           ORDER BY created_at DESC
           LIMIT 1`,
          [driver.id]
        )).rows[0];
        if (!last) {
          throw new AppError(
            "No payout details on file yet — provide your Kaspi transfer details first",
            400,
            "PAYOUT_DETAILS_MISSING"
          );
        }
        details = last.payout_details;
      }

      const created = await createPayoutRequest({
        driverId: driver.id,
        amountKzt: body.amountKzt,
        method: body.method,
        details
      }, client);
      await writeAudit(client, {
        action: "driver_payout_requested",
        actorUserId: req.user.id,
        entityType: "driver_payout_request",
        entityId: created.payoutRequest.id,
        metadata: { amountKzt: body.amountKzt, method: body.method },
        req
      });
      return created;
    });

    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.post("/payout-requests/:id/cancel", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const result = await tx(async client => {
      const driver = (await client.query("SELECT * FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
      if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
      const cancelled = await cancelPayoutRequest({ driverId: driver.id, id: params.id }, client);
      await writeAudit(client, {
        action: "driver_payout_cancelled",
        actorUserId: req.user.id,
        entityType: "driver_payout_request",
        entityId: params.id,
        metadata: {},
        req
      });
      return cancelled;
    });
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
