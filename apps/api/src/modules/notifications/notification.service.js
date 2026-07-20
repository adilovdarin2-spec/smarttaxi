import { query } from "../../db/pool.js";
import { sendPushToTokens } from "./push.service.js";

// Always writes the in-app notification row (backs the mobile "Уведомления"
// screen) and, separately, best-effort sends a push to every device token
// registered for that user. A push failure/no-op never blocks the in-app
// notification from being created.
export async function notifyUser(userId, { title, body, type = "ORDER_STATUS", orderId = null, data = {} }) {
  if (!userId) return;
  await query(
    `INSERT INTO notifications(user_id, title, body, type, order_id) VALUES($1,$2,$3,$4,$5)`,
    [userId, title, body, type, orderId]
  );

  const tokens = (await query(
    "SELECT token FROM device_tokens WHERE user_id=$1",
    [userId]
  )).rows.map((row) => row.token);
  if (tokens.length === 0) return;

  try {
    const { staleTokens } = await sendPushToTokens(tokens, {
      title,
      body,
      data: { type, orderId: orderId || "", ...data }
    });
    if (staleTokens.length) {
      await query("DELETE FROM device_tokens WHERE token = ANY($1::text[])", [staleTokens]);
    }
  } catch (error) {
    console.error("[push] sendPushToTokens failed", error);
  }
}

// FCM's sendEachForMulticast caps at 500 tokens per call.
const PUSH_BATCH_SIZE = 500;

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// Segment-wide send (all clients, all drivers, or drivers in one region) —
// separate from notifyUser's single-recipient path since it needs one bulk
// INSERT + chunked push fan-out instead of a per-user round trip, which
// would be far too slow/heavy once the user base is more than a handful of
// people.
export async function broadcastNotification({ segment, regionId, title, body }, executor = { query }) {
  const { query: run } = executor;
  let userIds;
  if (segment === "ALL_CLIENTS") {
    userIds = (await run("SELECT user_id FROM clients WHERE user_id IS NOT NULL")).rows.map(r => r.user_id);
  } else if (segment === "ALL_DRIVERS") {
    userIds = (await run("SELECT user_id FROM drivers WHERE user_id IS NOT NULL")).rows.map(r => r.user_id);
  } else if (segment === "REGION_DRIVERS") {
    userIds = (await run(
      "SELECT user_id FROM drivers WHERE user_id IS NOT NULL AND current_region_id=$1",
      [regionId]
    )).rows.map(r => r.user_id);
  } else {
    throw new Error(`Unknown broadcast segment: ${segment}`);
  }
  if (!userIds.length) return { recipientCount: 0, pushSentCount: 0 };

  await run(
    `INSERT INTO notifications(user_id, title, body, type)
     SELECT unnest($1::uuid[]), $2, $3, 'BROADCAST'`,
    [userIds, title, body]
  );

  const tokens = (await run(
    "SELECT token FROM device_tokens WHERE user_id = ANY($1::uuid[])",
    [userIds]
  )).rows.map(r => r.token);

  let staleTokens = [];
  for (const batch of chunk(tokens, PUSH_BATCH_SIZE)) {
    try {
      const result = await sendPushToTokens(batch, { title, body, data: { type: "BROADCAST" } });
      staleTokens = staleTokens.concat(result.staleTokens);
    } catch (error) {
      console.error("[push] broadcastNotification batch failed", error);
    }
  }
  if (staleTokens.length) {
    await run("DELETE FROM device_tokens WHERE token = ANY($1::text[])", [staleTokens]);
  }

  return { recipientCount: userIds.length, pushSentCount: tokens.length - staleTokens.length };
}

async function resolveUserId(table, id) {
  if (!id) return null;
  const row = (await query(`SELECT user_id FROM ${table} WHERE id=$1`, [id])).rows[0];
  return row?.user_id || null;
}

export async function notifyOrderClient(order, { title, body, type = "ORDER_STATUS", data = {} }) {
  const userId = await resolveUserId("clients", order.client_id);
  if (!userId) return;
  await notifyUser(userId, { title, body, type, orderId: order.id, data });
}

export async function notifyOrderDriver(order, { title, body, type = "ORDER_STATUS", data = {} }) {
  const userId = await resolveUserId("drivers", order.driver_id);
  if (!userId) return;
  await notifyUser(userId, { title, body, type, orderId: order.id, data });
}
