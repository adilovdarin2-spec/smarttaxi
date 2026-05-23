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

const RegisterSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(32),
  email: z.string().trim().toLowerCase().email().optional(),
  password: z.string().min(6).max(128)
});

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

router.post("/register", rateLimit({ prefix: "auth-register", windowMs: 60_000, max: 8 }), async (req, res, next) => {
  try {
    const body = RegisterSchema.parse(req.body);
    const existing = await query(`
      SELECT id
      FROM users
      WHERE phone=$1 OR ($2::text IS NOT NULL AND email=$2)
      LIMIT 1
    `, [body.phone, body.email || null]);
    if (existing.rows[0]) throw new AppError("User already exists", 409, "USER_ALREADY_EXISTS");

    const passwordHash = await bcrypt.hash(body.password, 10);
    const result = await query(`
      INSERT INTO users(name,email,phone,password_hash,role,is_active)
      VALUES($1,$2,$3,$4,'CLIENT',true)
      RETURNING *
    `, [body.name, body.email || null, body.phone, passwordHash]);
    const user = result.rows[0];

    await query(`
      INSERT INTO clients(user_id, name, phone)
      VALUES($1,$2,$3)
      ON CONFLICT (phone) DO UPDATE
      SET user_id=EXCLUDED.user_id,
          name=EXCLUDED.name
    `, [user.id, user.name, user.phone]);

    await writeAudit(query, {
      action: "client_registered",
      actorUserId: user.id,
      entityType: "user",
      entityId: user.id,
      metadata: { role: user.role, method: body.email ? "email" : "phone" },
      req
    });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));

export default router;
