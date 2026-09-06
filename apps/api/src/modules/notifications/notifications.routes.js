import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";

const router = Router();

const RegisterToken = z.object({
  token: z.string().trim().min(10).max(4096),
  platform: z.enum(["android", "ios", "web"]).default("android")
});

router.post("/register-token", requireAuth, async (req, res, next) => {
  try {
    const body = RegisterToken.parse(req.body);
    await query(`
      INSERT INTO device_tokens(user_id, token, platform)
      VALUES($1,$2,$3)
      ON CONFLICT (token) DO UPDATE
      SET user_id=EXCLUDED.user_id, platform=EXCLUDED.platform, updated_at=NOW()
    `, [req.user.id, body.token, body.platform]);
    res.status(204).end();
  } catch (e) { next(e); }
});

router.post("/unregister-token", requireAuth, async (req, res, next) => {
  try {
    const body = z.object({ token: z.string().trim().min(10).max(4096) }).parse(req.body);
    await query("DELETE FROM device_tokens WHERE token=$1 AND user_id=$2", [body.token, req.user.id]);
    res.status(204).end();
  } catch (e) { next(e); }
});

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const params = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(30)
    }).parse(req.query);
    const rows = (await query(`
      SELECT id, title, body, type, order_id, read_at, created_at
      FROM notifications
      WHERE user_id=$1
      ORDER BY created_at DESC
      LIMIT $2
    `, [req.user.id, params.limit])).rows;
    const unreadCount = (await query(
      "SELECT COUNT(*)::int AS count FROM notifications WHERE user_id=$1 AND read_at IS NULL",
      [req.user.id]
    )).rows[0].count;
    res.json({ notifications: rows, unreadCount });
  } catch (e) { next(e); }
});

router.post("/:id/read", requireAuth, async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const updated = (await query(
      "UPDATE notifications SET read_at=NOW() WHERE id=$1 AND user_id=$2 AND read_at IS NULL RETURNING id",
      [id, req.user.id]
    )).rows[0];
    if (!updated) {
      const exists = (await query("SELECT id FROM notifications WHERE id=$1 AND user_id=$2", [id, req.user.id])).rows[0];
      if (!exists) throw new AppError("Notification not found", 404, "NOTIFICATION_NOT_FOUND");
    }
    res.status(204).end();
  } catch (e) { next(e); }
});

router.post("/read-all", requireAuth, async (req, res, next) => {
  try {
    await query("UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL", [req.user.id]);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
