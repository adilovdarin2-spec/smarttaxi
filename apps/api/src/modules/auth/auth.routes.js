import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { signToken, requireAuth } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit, publicUser } from "../../common/audit.js";
import { rateLimit } from "../../common/rateLimit.js";
import { env } from "../../config/env.js";

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

const PhoneSchema = z.object({
  phone: z.string().trim().min(6).max(32)
});

const SmsPurpose = z.enum(["REGISTER", "RESET_PASSWORD"]);

const SmsSendSchema = PhoneSchema.extend({
  purpose: SmsPurpose.default("REGISTER")
});

const SmsVerifySchema = SmsSendSchema.extend({
  code: z.string().trim().regex(/^\d{4,8}$/)
});

const RegisterPasswordSchema = z.object({
  phone: z.string().trim().min(6).max(32),
  verificationToken: z.string().min(16),
  name: z.string().trim().min(2).max(120),
  password: z.string().min(6).max(128)
});

const LoginPasswordSchema = z.object({
  phone: z.string().trim().min(6).max(32),
  password: z.string().min(6).max(128)
});

const ResetConfirmSchema = z.object({
  phone: z.string().trim().min(6).max(32),
  verificationToken: z.string().min(16),
  password: z.string().min(6).max(128)
});

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length < 10 || digits.length > 15) {
    throw new AppError("Invalid phone", 400, "INVALID_PHONE");
  }
  return { phone: `+${digits}`, digits };
}

async function findUserByPhone(phoneInput) {
  const normalized = normalizePhone(phoneInput);
  const result = await query(`
    SELECT *
    FROM users
    WHERE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = $1
      AND is_active=true
    LIMIT 1
  `, [normalized.digits]);
  return { user: result.rows[0] || null, ...normalized };
}

function smsCode() {
  if (env.NODE_ENV !== "production") return "111111";
  return String(Math.floor(100000 + Math.random() * 900000));
}

function signSmsVerification({ phone, purpose, smsCodeId }) {
  return jwt.sign(
    { type: "sms_verified", phone, purpose, smsCodeId },
    env.JWT_SECRET,
    { expiresIn: "15m" }
  );
}

function verifySmsVerification(token, expected) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (payload.type !== "sms_verified" || payload.phone !== expected.phone || payload.purpose !== expected.purpose || !payload.smsCodeId) {
      throw new Error("mismatch");
    }
    return payload;
  } catch {
    throw new AppError("SMS verification expired", 401, "SMS_VERIFICATION_EXPIRED");
  }
}

async function consumeSmsVerification(token, expected) {
  const payload = verifySmsVerification(token, expected);
  const result = await query(`
    UPDATE auth_sms_codes
    SET consumed_at=NOW()
    WHERE id=$1
      AND phone=$2
      AND purpose=$3
      AND verified_at IS NOT NULL
      AND consumed_at IS NULL
      AND expires_at > NOW()
    RETURNING id
  `, [payload.smsCodeId, expected.phone, expected.purpose]);
  if (!result.rows[0]) {
    throw new AppError("SMS verification expired", 401, "SMS_VERIFICATION_EXPIRED");
  }
  return payload;
}

async function loginWithPhonePassword({ phone, password, req }) {
  const { user, phone: normalizedPhone } = await findUserByPhone(phone);
  if (!user) throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
  const ok = await bcrypt.compare(password, user.password_hash);
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
    metadata: { role: user.role, method: "phone", phone: normalizedPhone },
    req
  });

  return { token: signToken(user), user: publicUser(user) };
}

router.post("/phone/check", rateLimit({ prefix: "auth-phone-check", windowMs: 60_000, max: 30 }), async (req, res, next) => {
  try {
    const body = PhoneSchema.parse(req.body);
    const { user, phone } = await findUserByPhone(body.phone);
    res.json({
      phone,
      exists: Boolean(user),
      nextStep: user ? "PASSWORD" : "SMS"
    });
  } catch (e) { next(e); }
});

router.post("/sms/send", rateLimit({ prefix: "auth-sms-send", windowMs: 60_000, max: 6 }), async (req, res, next) => {
  try {
    const body = SmsSendSchema.parse(req.body);
    const { phone } = normalizePhone(body.phone);
    const code = smsCode();
    const codeHash = await bcrypt.hash(code, 10);
    await query(`
      INSERT INTO auth_sms_codes(phone, code_hash, purpose, expires_at)
      VALUES($1,$2,$3,NOW() + INTERVAL '10 minutes')
    `, [phone, codeHash, body.purpose]);
    await writeAudit(query, {
      action: "sms_code_requested",
      entityType: "auth_sms_code",
      metadata: { phone, purpose: body.purpose, provider: env.NODE_ENV === "production" ? "configured_sms_provider" : "dev" },
      req
    });
    res.json({
      phone,
      purpose: body.purpose,
      expiresInSeconds: 600,
      delivery: env.NODE_ENV === "production" ? "SMS_PROVIDER" : "DEV_CONSOLE",
      ...(env.NODE_ENV === "production" ? {} : { devCode: code })
    });
  } catch (e) { next(e); }
});

router.post("/sms/verify", rateLimit({ prefix: "auth-sms-verify", windowMs: 60_000, max: 10 }), async (req, res, next) => {
  try {
    const body = SmsVerifySchema.parse(req.body);
    const { phone } = normalizePhone(body.phone);
    const record = (await query(`
      SELECT *
      FROM auth_sms_codes
      WHERE phone=$1 AND purpose=$2 AND verified_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `, [phone, body.purpose])).rows[0];
    if (!record || new Date(record.expires_at).getTime() < Date.now()) {
      throw new AppError("SMS code expired", 401, "SMS_CODE_EXPIRED");
    }
    if (Number(record.attempts) >= 5) throw new AppError("SMS code attempts exceeded", 429, "SMS_CODE_ATTEMPTS_EXCEEDED");
    const ok = await bcrypt.compare(body.code, record.code_hash);
    if (!ok) {
      await query("UPDATE auth_sms_codes SET attempts=attempts+1 WHERE id=$1", [record.id]);
      throw new AppError("Invalid SMS code", 401, "INVALID_SMS_CODE");
    }
    await query("UPDATE auth_sms_codes SET verified_at=NOW(), attempts=attempts+1 WHERE id=$1", [record.id]);
    const verificationToken = signSmsVerification({ phone, purpose: body.purpose, smsCodeId: record.id });
    res.json({ phone, purpose: body.purpose, verified: true, verificationToken });
  } catch (e) { next(e); }
});

router.post("/register/password", rateLimit({ prefix: "auth-register-password", windowMs: 60_000, max: 8 }), async (req, res, next) => {
  try {
    const body = RegisterPasswordSchema.parse(req.body);
    const normalized = normalizePhone(body.phone);
    await consumeSmsVerification(body.verificationToken, { phone: normalized.phone, purpose: "REGISTER" });
    const existing = await findUserByPhone(normalized.phone);
    if (existing.user) throw new AppError("User already exists", 409, "USER_ALREADY_EXISTS");

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = (await query(`
      INSERT INTO users(name,email,phone,password_hash,role,is_active)
      VALUES($1,NULL,$2,$3,'CLIENT',true)
      RETURNING *
    `, [body.name, normalized.phone, passwordHash])).rows[0];

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
      metadata: { role: user.role, method: "phone_sms" },
      req
    });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

router.post("/login/password", rateLimit({ prefix: "auth-login-password", windowMs: 60_000, max: 10 }), async (req, res, next) => {
  try {
    const body = LoginPasswordSchema.parse(req.body);
    const data = await loginWithPhonePassword({ ...body, req });
    res.json(data);
  } catch (e) { next(e); }
});

router.post("/password/reset/request", rateLimit({ prefix: "auth-password-reset-request", windowMs: 60_000, max: 6 }), async (req, res, next) => {
  try {
    const body = PhoneSchema.parse(req.body);
    const { user, phone } = await findUserByPhone(body.phone);
    if (user) {
      const code = smsCode();
      const codeHash = await bcrypt.hash(code, 10);
      await query(`
        INSERT INTO auth_sms_codes(phone, code_hash, purpose, expires_at)
        VALUES($1,$2,'RESET_PASSWORD',NOW() + INTERVAL '10 minutes')
      `, [phone, codeHash]);
      return res.json({
        phone,
        purpose: "RESET_PASSWORD",
        expiresInSeconds: 600,
        delivery: env.NODE_ENV === "production" ? "SMS_PROVIDER" : "DEV_CONSOLE",
        ...(env.NODE_ENV === "production" ? {} : { devCode: code })
      });
    }
    res.json({ phone, purpose: "RESET_PASSWORD", expiresInSeconds: 600, delivery: "SMS_PROVIDER" });
  } catch (e) { next(e); }
});

router.post("/password/reset/confirm", rateLimit({ prefix: "auth-password-reset-confirm", windowMs: 60_000, max: 8 }), async (req, res, next) => {
  try {
    const body = ResetConfirmSchema.parse(req.body);
    const normalized = normalizePhone(body.phone);
    await consumeSmsVerification(body.verificationToken, { phone: normalized.phone, purpose: "RESET_PASSWORD" });
    const { user } = await findUserByPhone(normalized.phone);
    if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
    const passwordHash = await bcrypt.hash(body.password, 10);
    const updated = (await query("UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING *", [passwordHash, user.id])).rows[0];
    await writeAudit(query, {
      action: "password_reset",
      actorUserId: updated.id,
      entityType: "user",
      entityId: updated.id,
      metadata: { method: "phone_sms" },
      req
    });
    res.json({ token: signToken(updated), user: publicUser(updated) });
  } catch (e) { next(e); }
});

router.post("/login", rateLimit({ prefix: "auth-login", windowMs: 60_000, max: 10 }), async (req, res, next) => {
  let body;
  try {
    body = LoginSchema.parse(req.body);
    if (body.phone && !body.email) {
      return res.json(await loginWithPhonePassword({ phone: body.phone, password: body.password, req }));
    }
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
    const normalized = normalizePhone(body.phone);
    const existing = await query(`
      SELECT id
      FROM users
      WHERE phone=$1 OR ($2::text IS NOT NULL AND email=$2)
      LIMIT 1
    `, [normalized.phone, body.email || null]);
    if (existing.rows[0]) throw new AppError("User already exists", 409, "USER_ALREADY_EXISTS");

    const passwordHash = await bcrypt.hash(body.password, 10);
    const result = await query(`
      INSERT INTO users(name,email,phone,password_hash,role,is_active)
      VALUES($1,$2,$3,$4,'CLIENT',true)
      RETURNING *
    `, [body.name, body.email || null, normalized.phone, passwordHash]);
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

router.post("/refresh", requireAuth, async (req, res, next) => {
  try {
    const user = (await query("SELECT * FROM users WHERE id=$1 AND is_active=true", [req.user.id])).rows[0];
    if (!user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await writeAudit(query, {
      action: "logout",
      actorUserId: req.user.id,
      entityType: "user",
      entityId: req.user.id,
      metadata: { role: req.user.role },
      req
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
