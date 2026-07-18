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
