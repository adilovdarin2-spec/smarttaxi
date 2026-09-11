import { createClient } from "redis";
import { env } from "../config/env.js";

export const redis = createClient({
  url: env.REDIS_URL,
  socket: {
    connectTimeout: 1500,
    reconnectStrategy: false
  }
});
redis.on("error", (e) => console.error("[REDIS]", e.message));

export async function connectRedis() {
  if (redis.isOpen) return true;
  try {
    await redis.connect();
    return true;
  } catch (error) {
    if (env.NODE_ENV === "production") throw error;
    console.warn(`[REDIS] unavailable; API will run in degraded mode: ${error.message}`);
    return false;
  }
}
