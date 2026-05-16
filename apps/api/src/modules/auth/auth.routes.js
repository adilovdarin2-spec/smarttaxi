import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { signToken, requireAuth } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit, publicUser } from "../../common/audit.js";
import { rateLimit } from "../../common/rateLimit.js";

const router = Router();

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().min(6).max(32).optional(),
  password: z.string().min(6).max(128)
}).refine(v => v.email || v.phone, "email or phone required");

router.post("/login", rateLimit({ prefix: "auth-login", windowMs: 60_000, max: 10 }), async (req, res, next) => {
  let body;
  try {
    body = LoginSchema.parse(req.body);
    const result = body.email
      ? await query("SELECT * FROM users WHERE email=$1 AND is_active=true", [body.email])
      : await query("SELECT * FROM users WHERE phone=$1 AND is_active=true", [body.phone]);
    const user = result.rows[0];
    if (!user) throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    const ok = await bcrypt.compare(body.password, user.password_hash);
    if (!ok) throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");

    if (user.role === "DRIVER") {
      const driver = (await query("SELECT id, is_blocked FROM drivers WHERE user_id=$1", [user.id])).rows[0];
      if (!driver || driver.is_blocked) throw new AppError("Driver is blocked", 403, "DRIVER_BLOCKED");
    }

    await writeAudit(query, {
      action: "login_success",
      actorUserId: user.id,
      entityType: "user",
      entityId: user.id,
      metadata: { role: user.role, method: body.email ? "email" : "phone" },
      req
    });

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) {
    if (body && e.status === 401) {
      await writeAudit(query, {
        action: "login_failed",
        metadata: { identifier: body.email || body.phone, method: body.email ? "email" : "phone" },
        req
      }).catch(() => {});
    }
    next(e);
  }
});

router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));

export default router;
