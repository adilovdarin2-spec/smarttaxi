import { Router } from "express";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
const router = Router();

router.get("/", requireAuth, requireRole("OWNER", "OPERATOR", "FINANCE"), async (_req, res, next) => {
  try {
    const result = await query("SELECT * FROM clients ORDER BY created_at DESC LIMIT 200");
    res.json({ clients: result.rows });
  } catch (e) { next(e); }
});

export default router;
