import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import { walletIntegrationGate } from "./client-wallet-policy.js";
import {
  getClientWalletSummary,
  listClientCards,
  listTopupRequests,
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

// Fail closed for old app versions too, before parsing or persisting card data.
router.post("/cards", requireAuth, requireRole("CLIENT"), walletIntegrationGate("cardBinding"));

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

// A stored intent is not a payment. Historical rows remain available via GET.
router.post("/topup-requests", requireAuth, requireRole("CLIENT"), walletIntegrationGate("topUp"));

export default router;
