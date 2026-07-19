import { Router } from "express";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
const router = Router();

router.get("/", requireAuth, requireRole("OWNER", "FINANCE"), async (_req, res, next) => {
  try {
    const result = await query("SELECT * FROM clients ORDER BY created_at DESC LIMIT 200");
    res.json({ clients: result.rows });
  } catch (e) { next(e); }
});

// Mirrors GET /drivers/me — the client's own profile, including
// cashback_balance and rating (rating is otherwise only ever visible to
// admins via the list above and to the driver who rated them).
router.get("/me", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const client = (await query("SELECT * FROM clients WHERE user_id=$1", [req.user.id])).rows[0];
    if (!client) throw new AppError("Client profile not found", 404, "CLIENT_NOT_FOUND");
    res.json({ client });
  } catch (e) { next(e); }
});

export default router;
