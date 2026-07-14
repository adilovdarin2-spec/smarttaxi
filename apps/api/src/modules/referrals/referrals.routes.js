import { Router } from "express";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { ensureReferralCode } from "./referrals.service.js";

const router = Router();

router.get("/mine", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const client = (await query("SELECT * FROM clients WHERE user_id=$1", [req.user.id])).rows[0];
    if (!client) throw new AppError("Client profile not found", 404, "CLIENT_NOT_FOUND");
    // Backfills a code on first request for clients who registered before
    // this feature shipped — no separate migration/backfill job needed.
    const code = await ensureReferralCode(client.id);
    const invited = (await query(
      "SELECT COUNT(*)::int AS count FROM clients WHERE referred_by_client_id=$1",
      [client.id]
    )).rows[0];
    const earned = (await query(
      "SELECT COALESCE(SUM(amount),0)::int AS total FROM cashback_transactions WHERE client_id=$1 AND type='REFERRAL_BONUS'",
      [client.id]
    )).rows[0];
    res.json({
      code,
      invitedCount: invited.count,
      totalBonusEarned: earned.total
    });
  } catch (e) { next(e); }
});

export default router;
