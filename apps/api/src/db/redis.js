import { createClient } from "redis";
import { env } from "../config/env.js";

export const redis = createClient({ url: env.REDIS_URL });
redis.on("error", (e) => console.error("[REDIS]", e.message));

export async function connectRedis() {
  if (!redis.isOpen) await redis.connect();
}
