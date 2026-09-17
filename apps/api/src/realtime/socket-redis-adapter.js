import { createAdapter } from "@socket.io/redis-adapter";
import { redis } from "../db/redis.js";

let adapterClients = [];

function reconnectDelay(retries) {
  return Math.min(250 * 2 ** Math.min(retries, 5), 5000);
}

/**
 * Shares Socket.IO rooms and broadcasts across API replicas.
 *
 * The regular Redis client remains dedicated to rate limits and caches. Pub/sub
 * needs two independent connections because a subscribed Redis connection
 * cannot also execute ordinary commands.
 */
export async function attachSocketRedisAdapter(io) {
  if (!redis.isOpen) {
    console.warn("[socket] Redis unavailable; using the single-process adapter");
    return false;
  }
  if (adapterClients.length) return true;

  const socketOptions = {
    connectTimeout: 3000,
    reconnectStrategy: reconnectDelay
  };
  const pubClient = redis.duplicate({ socket: socketOptions });
  const subClient = redis.duplicate({ socket: socketOptions });
  pubClient.on("error", (error) => console.error("[socket:redis:pub]", error.message));
  subClient.on("error", (error) => console.error("[socket:redis:sub]", error.message));

  try {
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    adapterClients = [pubClient, subClient];
    console.log("[socket] Redis adapter enabled");
    return true;
  } catch (error) {
    await Promise.allSettled(
      [pubClient, subClient].map((client) => client.isOpen ? client.disconnect() : undefined)
    );
    if (process.env.NODE_ENV === "production") throw error;
    console.warn(`[socket] Redis adapter unavailable; using the single-process adapter: ${error.message}`);
    return false;
  }
}

export async function closeSocketRedisAdapter() {
  const clients = adapterClients;
  adapterClients = [];
  await Promise.allSettled(
    clients.map((client) => client.isOpen ? client.quit() : undefined)
  );
}
