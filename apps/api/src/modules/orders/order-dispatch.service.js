import { AppError } from "../../common/errors.js";
import { assertDriverDispatchReady } from "../driver-region-approvals/driver-region-approvals.service.js";

export const ACTIVE_ORDER_STATUSES = ["DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS"];
export const RECENT_DRIVER_STATUSES = ["DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
export const TRANSITION_RULES = {
  DRIVER_ASSIGNED: ["NEW"],
  DRIVER_ARRIVED: ["DRIVER_ASSIGNED"],
  IN_PROGRESS: ["DRIVER_ARRIVED"],
  COMPLETED: ["IN_PROGRESS"],
  CANCELLED: ["NEW", "DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS"]
};

const PUBLIC_STATUSES = {
  NEW: "SEARCHING",
  DRIVER_ASSIGNED: "ACCEPTED",
  DRIVER_ARRIVED: "DRIVER_ARRIVED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELED"
};

export function driverRegionRoom(regionId) {
  return `region:${regionId}:drivers`;
}

export function dispatchRegionRoom(regionId) {
  return `region:${regionId}:dispatch`;
}

export function orderRoom(orderId) {
  return `order:${orderId}`;
}

export function publicOrderStatus(status) {
  return PUBLIC_STATUSES[status] || status;
}

export function publicOrderEvent(order) {
  return {
    id: order.id,
    short_id: order.short_id,
    region_id: order.region_id,
    status: order.status,
    public_status: publicOrderStatus(order.status),
    price: order.price,
    payment_method: order.payment_method,
    tariff: order.tariff,
    driver_id: order.driver_id,
    driver_name: order.driver_name,
    driver_phone: order.driver_phone,
    driver_car_model: order.driver_car_model,
    driver_plate: order.driver_plate,
    driver_rating: order.driver_rating
  };
}

export function emitOrderCreated(io, order) {
  if (!io || !order?.region_id) return;
  const event = publicOrderEvent(order);
  io.to(driverRegionRoom(order.region_id)).emit("order_created", event);
  io.to(dispatchRegionRoom(order.region_id)).emit("order_created", event);
  io.to(orderRoom(order.id)).emit("order_status_public", event);
}

export function emitOrderUpdated(io, order, eventName = "order_updated") {
  if (!io || !order?.region_id) return;
  const event = publicOrderEvent(order);
  io.to(driverRegionRoom(order.region_id)).emit(eventName, event);
  io.to(dispatchRegionRoom(order.region_id)).emit(eventName, event);
  io.to(orderRoom(order.id)).emit("order_status_public", event);
}

export function assertStatusTransition(existing, nextStatus) {
  const allowed = TRANSITION_RULES[nextStatus] || [];
  if (!allowed.includes(existing.status)) {
    throw new AppError("Invalid order status transition", 409, "INVALID_STATUS_TRANSITION", {
      currentStatus: existing.status,
      nextStatus,
      allowedFrom: allowed
    });
  }
}

export async function assertDriverHasNoActiveOrder(driver, executor) {
  const active = await executor.query(
    "SELECT id FROM orders WHERE driver_id=$1 AND status = ANY($2::text[]) LIMIT 1",
    [driver.id, ACTIVE_ORDER_STATUSES]
  );
  if (active.rows[0] || driver.status === "BUSY") {
    throw new AppError("Driver already has an active order", 409, "DRIVER_HAS_ACTIVE_ORDER");
  }
}

export async function listOrdersForDriver({ driver, status, limit, executor, orderSelect = "o.*" }) {
  await assertDriverDispatchReady(driver, executor);

  if (driver.status === "BUSY") {
    return (await executor.query(`
      SELECT ${orderSelect} FROM orders o
      LEFT JOIN drivers d ON d.id=o.driver_id
      WHERE o.driver_id=$1 AND o.region_id=$2 AND o.status = ANY($3::text[])
      ORDER BY o.created_at DESC
      LIMIT $4
    `, [driver.id, driver.current_region_id, RECENT_DRIVER_STATUSES, limit])).rows;
  }

  if (status) {
    return (await executor.query(`
      SELECT ${orderSelect} FROM orders o
      LEFT JOIN drivers d ON d.id=o.driver_id
      WHERE o.region_id=$2
        AND ((o.status='NEW' AND o.driver_id IS NULL) OR o.driver_id=$1)
        AND o.status=$3
      ORDER BY o.created_at DESC
      LIMIT $4
    `, [driver.id, driver.current_region_id, status, limit])).rows;
  }

  return (await executor.query(`
    SELECT ${orderSelect} FROM orders o
    LEFT JOIN drivers d ON d.id=o.driver_id
    WHERE o.region_id=$2
      AND ((o.status='NEW' AND o.driver_id IS NULL) OR (o.driver_id=$1 AND o.status = ANY($3::text[])))
    ORDER BY o.created_at DESC
    LIMIT $4
  `, [driver.id, driver.current_region_id, RECENT_DRIVER_STATUSES, limit])).rows;
}

export async function acceptOrderForDriver({ orderId, userId, executor }) {
  const driver = (await executor.query("SELECT * FROM drivers WHERE user_id=$1 FOR UPDATE", [userId])).rows[0];
  if (!driver) throw new AppError("Driver not found", 404, "DRIVER_NOT_FOUND");
  await assertDriverDispatchReady(driver, executor);

  if (Number(driver.debt) > 15000) throw new AppError("Debt limit exceeded", 403, "DRIVER_DEBT_LIMIT");
  await assertDriverHasNoActiveOrder(driver, executor);
  if (driver.status === "OFFLINE" || driver.status === "BREAK") throw new AppError("Driver is offline", 409, "DRIVER_OFFLINE");
  if (driver.status !== "FREE") throw new AppError("Driver is not available", 409, "DRIVER_OFFLINE");

  const existing = (await executor.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [orderId])).rows[0];
  if (!existing) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  if (existing.status !== "NEW" || existing.driver_id) throw new AppError("Order already accepted", 409, "ORDER_ALREADY_ACCEPTED");
  if (existing.region_id !== driver.current_region_id) {
    throw new AppError("Order is outside driver's current region", 403, "ORDER_REGION_MISMATCH");
  }

  const order = (await executor.query(
    "UPDATE orders SET status='DRIVER_ASSIGNED', driver_id=$1, accepted_at=NOW() WHERE id=$2 RETURNING *",
    [driver.id, existing.id]
  )).rows[0];
  const updatedDriver = (await executor.query(
    "UPDATE drivers SET status='BUSY', last_seen_at=NOW() WHERE id=$1 RETURNING *",
    [driver.id]
  )).rows[0];
  await executor.query(
    "INSERT INTO order_status_history(order_id,status,message,actor_user_id) VALUES($1,'DRIVER_ASSIGNED','Driver accepted order',$2)",
    [existing.id, userId]
  );

  return { order, driver: updatedDriver };
}
