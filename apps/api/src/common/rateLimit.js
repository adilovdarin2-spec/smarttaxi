import { redis } from "../db/redis.js";
import { AppError } from "./errors.js";

const memoryBuckets = new Map();

function memoryHit(key, windowMs) {
  const now = Date.now();
  const current = memoryBuckets.get(key);
  if (!current || current.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { count: 1, resetAt: now + windowMs };
  }
  current.count += 1;
  return current;
}

export function rateLimit({ prefix = "api", windowMs = 60_000, max = 120 } = {}) {
  return async (req, res, next) => {
    const identity = req.ip || req.socket?.remoteAddress || "unknown";
    const key = `rl:${prefix}:${identity}`;

    try {
      let count;
      let ttlMs = windowMs;

      if (redis.isOpen) {
        count = await redis.incr(key);
        if (count === 1) await redis.pExpire(key, windowMs);
        ttlMs = await redis.pTTL(key);
      } else {
        const bucket = memoryHit(key, windowMs);
        count = bucket.count;
        ttlMs = bucket.resetAt - Date.now();
      }

      res.setHeader("RateLimit-Limit", String(max));
      res.setHeader("RateLimit-Remaining", String(Math.max(0, max - count)));
      res.setHeader("RateLimit-Reset", String(Math.ceil(Math.max(0, ttlMs) / 1000)));

      if (count > max) {
        return next(new AppError("Too many requests", 429, "RATE_LIMITED"));
      }
      next();
    } catch (error) {
      const bucket = memoryHit(key, windowMs);
      if (bucket.count > max) return next(new AppError("Too many requests", 429, "RATE_LIMITED"));
      next(error);
    }
  };
}
