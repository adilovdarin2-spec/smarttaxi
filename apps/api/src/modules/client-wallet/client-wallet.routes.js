import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import {
  addClientCard,
  createTopupRequest,
  getClientWalletSummary,
  listClientCards,
  listTopupRequests,
  MIN_TOPUP_KZT,
  removeClientCard,
  setDefaultClientCard
} from "./client-wallet.service.js";

const router = Router();

async function getClientOrThrow(userId) {
  const client = (await query("SELECT * FROM clients WHERE user_id=$1", [userId])).rows[0];
  if (!client) throw new AppError("Client profile not found", 404, "CLIENT_NOT_FOUND");
  return client;
}

router.get("/", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const client = await getClientOrThrow(req.user.id);
    const summary = await getClientWalletSummary(client.id, query);
    res.json(summary);
  } catch (e) { next(e); }
});

router.get("/cards", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const client = await getClientOrThrow(req.user.id);
    const cards = await listClientCards(client.id, query);
    res.json({ cards });
  } catch (e) { next(e); }
});

// Store-only, same trust model as the driver payout card (wallet.service.js):
// Luhn-checked to catch typos, never charged automatically, never tokenized
// with a real processor. Real Kaspi Pay top-ups will reuse this record once
// wired in — see client-wallet.service.js's createTopupRequest comment.
router.post("/cards", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const body = z.object({
      cardNumber: z.string().trim().min(1),
      holderName: z.string().trim().min(1).max(120).optional()
    }).parse(req.body);
    const client = await getClientOrThrow(req.user.id);
    const card = await addClientCard({
      clientId: client.id,
      cardNumber: body.cardNumber,
      holderName: body.holderName
    }, query);
    await writeAudit(query, {
      action: "client_card_added",
      actorUserId: req.user.id,
      entityType: "client",
      entityId: client.id,
      metadata: { cardId: card.id },
      req
    });
    res.status(201).json({ card });
  } catch (e) { next(e); }
});

router.delete("/cards/:id", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const client = await getClientOrThrow(req.user.id);
    const result = await removeClientCard({ clientId: client.id, id }, query);
    await writeAudit(query, {
      action: "client_card_removed",
      actorUserId: req.user.id,
      entityType: "client",
      entityId: client.id,
      metadata: { cardId: id },
      req
    });
    res.json(result);
  } catch (e) { next(e); }
});

router.put("/cards/:id/default", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const client = await getClientOrThrow(req.user.id);
    const cards = await setDefaultClientCard({ clientId: client.id, id }, query);
    res.json({ cards });
  } catch (e) { next(e); }
});

router.get("/topup-requests", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const client = await getClientOrThrow(req.user.id);
    const topupRequests = await listTopupRequests(client.id, query);
    res.json({ topupRequests });
  } catch (e) { next(e); }
});

// Records intent only — see client-wallet.service.js's createTopupRequest for
// why this stays PENDING until real Kaspi Pay top-up integration exists.
router.post("/topup-requests", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const body = z.object({
      amountKzt: z.coerce.number().int().min(MIN_TOPUP_KZT)
    }).parse(req.body);
    const client = await getClientOrThrow(req.user.id);
    const topupRequest = await createTopupRequest({ clientId: client.id, amountKzt: body.amountKzt }, query);
    await writeAudit(query, {
      action: "client_topup_requested",
      actorUserId: req.user.id,
      entityType: "client",
      entityId: client.id,
      metadata: { amountKzt: body.amountKzt },
      req
    });
    res.status(201).json({ topupRequest });
  } catch (e) { next(e); }
});

export default router;
