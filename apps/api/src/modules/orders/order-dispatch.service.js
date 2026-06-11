import { AppError } from "../../common/errors.js";
import { assertDriverDispatchReady } from "../driver-region-approvals/driver-region-approvals.service.js";

export const ORDER_STATUSES = [
  "SEARCHING_DRIVER",
  "DRIVER_FOUND",
  "DRIVER_GOING_TO_CLIENT",
  "DRIVER_ARRIVED",
  "WAITING_CLIENT",
  "TRIP_STARTED",
  "TRIP_COMPLETED",
  "PAYMENT_PENDING",
  "PAID",
  "RATED",
  "CANCELLED_BY_CLIENT",
  "CANCELLED_BY_DRIVER",
  "CANCELLED_BY_OPERATOR",
  "NO_SHOW",
  // Legacy statuses kept readable while older databases are migrated.
  "NEW",
  "DRIVER_ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED"
];

export const OPEN_ORDER_STATUSES = ["SEARCHING_DRIVER", "NEW"];
export const ACTIVE_ORDER_STATUSES = [
  "DRIVER_FOUND",
  "DRIVER_GOING_TO_CLIENT",
  "DRIVER_ARRIVED",
  "WAITING_CLIENT",
  "TRIP_STARTED",
  "DRIVER_ASSIGNED",
  "IN_PROGRESS"
];
export const CLIENT_ACTIVE_ORDER_STATUSES = [
  ...OPEN_ORDER_STATUSES,
  ...ACTIVE_ORDER_STATUSES,
  "TRIP_COMPLETED",
  "PAYMENT_PENDING"
];
export const RECENT_DRIVER_STATUSES = [
  ...ACTIVE_ORDER_STATUSES,
  "TRIP_COMPLETED",
  "PAYMENT_PENDING",
  "PAID",
  "NO_SHOW",
  "CANCELLED_BY_CLIENT",
  "CANCELLED_BY_DRIVER",
  "CANCELLED_BY_OPERATOR",
  "COMPLETED",
  "CANCELLED"
];
export const TRANSITION_RULES = {
  DRIVER_FOUND: ["SEARCHING_DRIVER", "NEW"],
  DRIVER_GOING_TO_CLIENT: ["DRIVER_FOUND", "DRIVER_ASSIGNED"],
  DRIVER_ARRIVED: ["DRIVER_GOING_TO_CLIENT", "DRIVER_FOUND", "DRIVER_ASSIGNED"],
  WAITING_CLIENT: ["DRIVER_ARRIVED"],
  TRIP_STARTED: ["WAITING_CLIENT", "DRIVER_ARRIVED", "IN_PROGRESS"],
  TRIP_COMPLETED: ["TRIP_STARTED", "IN_PROGRESS"],
  PAYMENT_PENDING: ["TRIP_COMPLETED"],
  PAID: ["PAYMENT_PENDING", "TRIP_COMPLETED"],
  RATED: ["PAID"],
  CANCELLED_BY_CLIENT: ["SEARCHING_DRIVER", "NEW", "DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT", "DRIVER_ARRIVED", "WAITING_CLIENT", "TRIP_STARTED", "DRIVER_ASSIGNED", "IN_PROGRESS"],
  CANCELLED_BY_DRIVER: ["DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT", "DRIVER_ARRIVED", "WAITING_CLIENT", "TRIP_STARTED", "DRIVER_ASSIGNED", "IN_PROGRESS"],
  CANCELLED_BY_OPERATOR: ["SEARCHING_DRIVER", "NEW", "DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT", "DRIVER_ARRIVED", "WAITING_CLIENT", "TRIP_STARTED", "DRIVER_ASSIGNED", "IN_PROGRESS"],
  NO_SHOW: ["WAITING_CLIENT", "DRIVER_ARRIVED"],
  DRIVER_ASSIGNED: ["NEW", "SEARCHING_DRIVER"],
  IN_PROGRESS: ["DRIVER_ARRIVED", "WAITING_CLIENT"],
  COMPLETED: ["IN_PROGRESS", "TRIP_STARTED"],
  CANCELLED: ["NEW", "SEARCHING_DRIVER", "DRIVER_ASSIGNED", "DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT", "DRIVER_ARRIVED", "WAITING_CLIENT", "IN_PROGRESS", "TRIP_STARTED"]
};

const PUBLIC_STATUSES = {
  SEARCHING_DRIVER: "SEARCHING_DRIVER",
  DRIVER_FOUND: "DRIVER_FOUND",
  DRIVER_GOING_TO_CLIENT: "DRIVER_GOING_TO_CLIENT",
  WAITING_CLIENT: "WAITING_CLIENT",
  TRIP_STARTED: "TRIP_STARTED",
  TRIP_COMPLETED: "TRIP_COMPLETED",
  PAYMENT_PENDING: "PAYMENT_PENDING",
  PAID: "PAID",
  RATED: "RATED",
  CANCELLED_BY_CLIENT: "CANCELLED_BY_CLIENT",
  CANCELLED_BY_DRIVER: "CANCELLED_BY_DRIVER",
  CANCELLED_BY_OPERATOR: "CANCELLED_BY_OPERATOR",
  NO_SHOW: "NO_SHOW",
  NEW: "SEARCHING_DRIVER",
  DRIVER_ASSIGNED: "DRIVER_FOUND",
  DRIVER_ARRIVED: "DRIVER_ARRIVED",
  IN_PROGRESS: "TRIP_STARTED",
  COMPLETED: "TRIP_COMPLETED",
  CANCELLED: "CANCELLED_BY_CLIENT"
};

const STATUS_SOCKET_EVENTS = {
  SEARCHING_DRIVER: "order.searching_driver",
  DRIVER_FOUND: "order.driver_found",
  DRIVER_GOING_TO_CLIENT: "order.driver_going_to_client",
  WAITING_CLIENT: "order.waiting_client",
  TRIP_STARTED: "order.trip_started",
  TRIP_COMPLETED: "order.trip_completed",
  PAYMENT_PENDING: "order.payment_pending",
  PAID: "order.paid",
  RATED: "order.rated",
  CANCELLED_BY_CLIENT: "order.cancelled",
  CANCELLED_BY_DRIVER: "order.cancelled",
  CANCELLED_BY_OPERATOR: "order.cancelled",
  NO_SHOW: "order.no_show",
  NEW: "order.searching_driver",
  DRIVER_ASSIGNED: "order.driver_found",
  DRIVER_ARRIVED: "order.driver_arrived",
  IN_PROGRESS: "order.trip_started",
  COMPLETED: "order.trip_completed",
  CANCELLED: "order.cancelled"
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

function emitOrderAliases(io, order, eventName, event) {
  const stageEvent = STATUS_SOCKET_EVENTS[order.status];
  if (stageEvent) {
    io.to(driverRegionRoom(order.region_id)).emit(stageEvent, event);
    io.to(dispatchRegionRoom(order.region_id)).emit(stageEvent, event);
    io.to(orderRoom(order.id)).emit(stageEvent, event);
  }
  if (eventName && eventName !== stageEvent) {
    io.to(orderRoom(order.id)).emit(eventName, event);
  }
}

export function emitOrderCreated(io, order) {
  if (!io || !order?.region_id) return;
  const event = publicOrderEvent(order);
  io.to(driverRegionRoom(order.region_id)).emit("order_created", event);
  io.to(dispatchRegionRoom(order.region_id)).emit("order_created", event);
  io.to(orderRoom(order.id)).emit("order_status_public", event);
  emitOrderAliases(io, order, "order.created", event);
}

export function emitOrderUpdated(io, order, eventName = "order_updated") {
  if (!io || !order?.region_id) return;
  const event = publicOrderEvent(order);
  io.to(driverRegionRoom(order.region_id)).emit(eventName, event);
  io.to(dispatchRegionRoom(order.region_id)).emit(eventName, event);
  io.to(orderRoom(order.id)).emit("order_status_public", event);
  emitOrderAliases(io, order, eventName, event);
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
        AND ((o.status = ANY($5::text[]) AND o.driver_id IS NULL) OR o.driver_id=$1)
        AND o.status=$3
      ORDER BY o.created_at DESC
      LIMIT $4
    `, [driver.id, driver.current_region_id, status, limit, OPEN_ORDER_STATUSES])).rows;
  }

  return (await executor.query(`
    SELECT ${orderSelect} FROM orders o
    LEFT JOIN drivers d ON d.id=o.driver_id
    WHERE o.region_id=$2
      AND ((o.status = ANY($5::text[]) AND o.driver_id IS NULL) OR (o.driver_id=$1 AND o.status = ANY($3::text[])))
    ORDER BY o.created_at DESC
    LIMIT $4
  `, [driver.id, driver.current_region_id, RECENT_DRIVER_STATUSES, limit, OPEN_ORDER_STATUSES])).rows;
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
  if (!OPEN_ORDER_STATUSES.includes(existing.status) || existing.driver_id) throw new AppError("Order already accepted", 409, "ORDER_ALREADY_ACCEPTED");
  if (existing.region_id !== driver.current_region_id) {
    throw new AppError("Order is outside driver's current region", 403, "ORDER_REGION_MISMATCH");
  }

  const order = (await executor.query(
    "UPDATE orders SET status='DRIVER_FOUND', driver_id=$1, accepted_at=NOW() WHERE id=$2 RETURNING *",
    [driver.id, existing.id]
  )).rows[0];
  const updatedDriver = (await executor.query(
    "UPDATE drivers SET status='BUSY', last_seen_at=NOW() WHERE id=$1 RETURNING *",
    [driver.id]
  )).rows[0];
  await executor.query(
    "INSERT INTO order_status_history(order_id,status,message,actor_user_id) VALUES($1,'DRIVER_FOUND','Driver accepted order',$2)",
    [existing.id, userId]
  );

  return { order, driver: updatedDriver };
}
