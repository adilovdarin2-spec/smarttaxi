import { Router } from "express";
import { query } from "../../db/pool.js";
const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const result = await query("SELECT * FROM tariffs WHERE is_active=true ORDER BY base_price ASC");
    res.json({ tariffs: result.rows });
  } catch (e) { next(e); }
});

export default router;
