import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { signToken, requireAuth } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";

const router = Router();

const LoginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(6).optional(),
  password: z.string().min(3)
}).refine(v => v.email || v.phone, "email or phone required");

router.post("/login", async (req, res, next) => {
  try {
    const body = LoginSchema.parse(req.body);
    const result = body.email
      ? await query("SELECT * FROM users WHERE email=$1 AND is_active=true", [body.email])
      : await query("SELECT * FROM users WHERE phone=$1 AND is_active=true", [body.phone]);
    const user = result.rows[0];
    if (!user) throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    const ok = await bcrypt.compare(body.password, user.password_hash);
    if (!ok) throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    res.json({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
  } catch (e) { next(e); }
});

router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));

export default router;
