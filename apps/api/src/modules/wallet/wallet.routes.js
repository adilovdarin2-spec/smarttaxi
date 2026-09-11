import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import {
  MIN_PAYOUT_KZT,
  MIN_TOPUP_KZT,
  cancelPayoutRequest,
  createDriverTopupRequest,
  createPayoutRequest,
  getWalletSummary,
  listDriverTopupRequests,
  listPayoutRequests,
  listWalletTransactions,
  resolveDriverPayoutDetails,
  saveDriverPayoutDetails
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

// Prefers the driver's explicitly-saved payout destination (Settings ->
// "Способ выплаты", PUT /payout-details below) over "whatever their most
// recent payout request happened to carry" — the latter still works as a
// fallback for anyone who saved details before this endpoint existed. Lets
// the mobile app show "add a payout method" up front instead of only
// finding out when a payout request is rejected.
router.get("/payout-details-status", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const driver = await getDriverOrThrow(req.user.id);
    const resolved = await resolveDriverPayoutDetails(driver.id, query);
    res.json({
      hasPayoutDetails: !!resolved,
      lastMethod: resolved?.method || null,
      lastPayoutDetails: resolved?.details || null,
      source: resolved?.source || null
    });
  } catch (e) { next(e); }
});

// Saves a payout destination independent of submitting an actual
// withdrawal — this is the driver Settings "add a card"/"set Kaspi number"
// action. Card numbers are Luhn-checked (normalizeCardNumber) but this is
// never charged or tokenized with a real processor: it's stored purely so
// an admin/finance user can manually transfer this driver's payout to it,
// same trust model as the phone number already stored alongside it.
router.put("/payout-details", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const body = z.object({
      method: z.enum(["KASPI_TRANSFER", "CASH"]).default("KASPI_TRANSFER"),
      details: z.object({
        cardNumber: z.string().trim().min(1).optional(),
        phone: z.string().trim().min(1).optional()
      }).refine(value => value.cardNumber || value.phone, {
        message: "Provide a card number or a phone number"
      })
    }).parse(req.body);
    const driver = await getDriverOrThrow(req.user.id);
    const saved = await saveDriverPayoutDetails({
      driverId: driver.id,
      method: body.method,
      details: body.details
    }, query);
    await writeAudit(query, {
      action: "driver_payout_details_saved",
      actorUserId: req.user.id,
      entityType: "driver",
      entityId: driver.id,
      metadata: { method: body.method, hasCard: Boolean(body.details.cardNumber), hasPhone: Boolean(body.details.phone) },
      req
    });
    res.json(saved);
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
        // Omitting details on a repeat request reuses the driver's saved
        // payout destination (Settings) first, or — for a driver who never
        // used that — whatever their last payout request happened to
        // carry. Same UX as not re-entering a card number every time. Only
        // a driver who has genuinely never provided either hits the error,
        // which is what GET /payout-details-status is for checking up front.
        const resolved = await resolveDriverPayoutDetails(driver.id, client);
        if (!resolved) {
          throw new AppError(
            "No payout details on file yet — provide your Kaspi transfer details first",
            400,
            "PAYOUT_DETAILS_MISSING"
          );
        }
        details = resolved.details;
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

router.get("/topup-requests", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const driver = await getDriverOrThrow(req.user.id);
    const topupRequests = await listDriverTopupRequests(driver.id, query);
    res.json({ topupRequests });
  } catch (e) { next(e); }
});

router.post("/topup-requests", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const body = z.object({
      amountKzt: z.coerce.number().int().min(MIN_TOPUP_KZT)
    }).parse(req.body);
    const driver = await getDriverOrThrow(req.user.id);
    const topupRequest = await createDriverTopupRequest({ driverId: driver.id, amountKzt: body.amountKzt }, query);
    await writeAudit(query, {
      action: "driver_topup_requested",
      actorUserId: req.user.id,
      entityType: "driver",
      entityId: driver.id,
      metadata: { amountKzt: body.amountKzt },
      req
    });
    res.status(201).json({ topupRequest });
  } catch (e) { next(e); }
});

export default router;
