import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "./errors.js";
import { query } from "../db/pool.js";

export function signToken(user) {
  return jwt.sign({
    id: user.id,
    role: user.role,
    baseRole: user.baseRole || user.base_role || user.role,
    email: user.email,
    phone: user.phone,
    name: user.name,
    sessionVersion: user.session_version
  }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

// Rotating this on a real login/password-reset/logout invalidates every
// token issued before the rotation immediately -- requireAuth below
// rejects any token whose embedded sessionVersion doesn't match the
// user's current one in the DB. This is the only way to revoke a
// stateless JWT before its natural expiry, and is what makes "logging in
// on device B kicks device A out" and "logout actually invalidates the
// token, not just deletes it client-side" both work. Deliberately NOT
// called from /auth/refresh, which continues the same session rather
// than starting a new one -- rotating there would invalidate the very
// token that just called it.
export async function rotateSessionVersion(userId, executor = query) {
  const run = executor.query ? executor.query.bind(executor) : executor;
  const result = await run("UPDATE users SET session_version=uuid_generate_v4() WHERE id=$1 RETURNING *", [userId]);
  return result.rows[0];
}

// Годен ли этот токен для этого аккаунта прямо сейчас.
//
// Одно определение на два входа: HTTP и сокет. Пока их было два, они успели
// разойтись — проверка запроса научилась смотреть на выключатель аккаунта, а
// сокет остался на одной версии сессии, и выключенный аккаунт продолжал бы
// получать живые события: заказы, координаты водителей, очереди на стоянках.
//
// Возвращает null, если токен больше не годен, иначе — причину отказа словами
// вызывающему решать, что с ней делать.
export async function accountTokenState(decoded) {
  if (!decoded?.id) return { ok: false, code: "UNAUTHORIZED" };
  const current = (await query("SELECT session_version, is_active FROM users WHERE id=$1", [decoded.id])).rows[0];
  if (!current || current.session_version !== decoded.sessionVersion) {
    return { ok: false, code: "SESSION_SUPERSEDED" };
  }
  // Выключенный аккаунт выключен и для уже выданного токена: вход его не
  // пускает, а токен живёт год.
  if (current.is_active === false) return { ok: false, code: "ACCOUNT_DISABLED" };
  return { ok: true };
}

export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new AppError("Unauthorized", 401, "UNAUTHORIZED"));
  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET);
  } catch {
    return next(new AppError("Invalid token", 401, "INVALID_TOKEN"));
  }
  try {
    const state = await accountTokenState(decoded);
    if (!state.ok) {
      const message = state.code === "ACCOUNT_DISABLED"
        ? "This account is disabled"
        : "This account was signed in on another device";
      return next(new AppError(message, 401, state.code));
    }
    req.user = decoded;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError("Unauthorized", 401, "UNAUTHORIZED"));
    if (!roles.includes(req.user.role)) return next(new AppError("Forbidden", 403, "FORBIDDEN"));
    next();
  };
}
