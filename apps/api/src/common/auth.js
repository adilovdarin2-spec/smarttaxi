import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "./errors.js";

export function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email, phone: user.phone, name: user.name }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new AppError("Unauthorized", 401, "UNAUTHORIZED"));
  try {
    req.user = jwt.verify(token, env.JWT_SECRET);
    next();
  } catch {
    next(new AppError("Invalid token", 401, "INVALID_TOKEN"));
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError("Unauthorized", 401, "UNAUTHORIZED"));
    if (!roles.includes(req.user.role)) return next(new AppError("Forbidden", 403, "FORBIDDEN"));
    next();
  };
}
