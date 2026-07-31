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
// Which physical leg the driver is on — used to pick the routing target
// (pickup point vs dropoff point) for the live "driver active route".
export const TO_PICKUP_ORDER_STATUSES = [
  "DRIVER_FOUND",
  "DRIVER_GOING_TO_CLIENT",
  "DRIVER_ASSIGNED",
  "DRIVER_ARRIVED",
  "WAITING_CLIENT",
  "NEW"
];
export const TO_DROPOFF_ORDER_STATUSES = ["TRIP_STARTED", "IN_PROGRESS"];
export const CLIENT_ACTIVE_ORDER_STATUSES = [
  ...OPEN_ORDER_STATUSES,
  ...ACTIVE_ORDER_STATUSES,
  "TRIP_COMPLETED",
  "PAYMENT_PENDING"
];
// A trip that finished the ride itself, at any stage of post-trip settlement
// (still awaiting payment, paid, or rated) — as opposed to still open/active,
// or cancelled/no-show. Used for admin-facing "completed" counts.
export const SETTLED_ORDER_STATUSES = [
  "TRIP_COMPLETED",
  "PAYMENT_PENDING",
  "PAID",
  "RATED",
  "COMPLETED"
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
  CANCELLED_BY_CLIENT: ["SEARCHING_DRIVER", "NEW", "DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT", "DRIVER_ARRIVED", "WAITING_CLIENT", "DRIVER_ASSIGNED"],
  CANCELLED_BY_DRIVER: ["DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT", "DRIVER_ARRIVED", "WAITING_CLIENT", "DRIVER_ASSIGNED"],
  CANCELLED_BY_OPERATOR: ["SEARCHING_DRIVER", "NEW", "DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT", "DRIVER_ARRIVED", "WAITING_CLIENT", "DRIVER_ASSIGNED"],
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

function runQuery(executor, sql, params = []) {
  return executor.query ? executor.query(sql, params) : executor(sql, params);
}

export function publicOrderStatus(status) {
  return PUBLIC_STATUSES[status] || status;
}

// How long an order sits in SEARCHING_DRIVER with nobody responding before
// the client gets an explicit "nobody's responded yet" signal instead of a
// silent spinner. The dispatch model here is region-wide (not radius-based
// — see /nearby for the only distance query in the app), so there's no
// "widen the radius and retry" step to trigger; this just surfaces the wait
// so the client can choose to keep waiting or cancel (already free, since no
// driver has accepted yet — see createOrderCancelledTransaction).
const DRIVER_SEARCH_TIMEOUT_MS = 75_000;

export function isOrderSearchTimedOut(order) {
  if (!order || order.driver_id) return false;
  if (!OPEN_ORDER_STATUSES.includes(order.status)) return false;
  return Date.now() - new Date(order.created_at).getTime() > DRIVER_SEARCH_TIMEOUT_MS;
}

export function publicOrderEvent(order) {
  return {
    id: order.id,
    short_id: order.short_id,
    region_id: order.region_id,
    status: order.status,
    public_status: publicOrderStatus(order.status),
    search_timed_out: isOrderSearchTimedOut(order),
    price: order.price,
    offered_price_kzt: order.offered_price_kzt,
    driver_offer_price_kzt: order.driver_offer_price_kzt,
    driver_offer_status: order.driver_offer_status,
    driver_offer_by_driver_id: order.driver_offer_by_driver_id,
    payment_method: order.payment_method,
    tariff: order.tariff,
    driver_id: order.driver_id,
    driver_name: order.driver_name,
    driver_phone: order.driver_phone,
    driver_car_model: order.driver_car_model,
    driver_car_color: order.driver_car_color,
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
  const active = await runQuery(
    executor,
    "SELECT id FROM orders WHERE driver_id=$1 AND status = ANY($2::text[]) LIMIT 1",
    [driver.id, ACTIVE_ORDER_STATUSES]
  );
  if (active.rows[0]) {
    throw new AppError("Driver already has an active order", 409, "DRIVER_HAS_ACTIVE_ORDER");
  }
  if (driver.status === "BUSY") {
    const recovered = await runQuery(
      executor,
      "UPDATE drivers SET status='FREE', last_seen_at=NOW() WHERE id=$1 RETURNING *",
      [driver.id]
    );
    Object.assign(driver, recovered.rows[0] || { status: "FREE" });
  }
}

export async function syncDriverAvailability(driver, executor) {
  if (!driver || driver.status !== "BUSY") return driver;
  const active = await runQuery(
    executor,
    "SELECT id FROM orders WHERE driver_id=$1 AND status = ANY($2::text[]) LIMIT 1",
    [driver.id, ACTIVE_ORDER_STATUSES]
  );
  if (active.rows[0]) return driver;
  const recovered = await runQuery(
    executor,
    "UPDATE drivers SET status='FREE', last_seen_at=NOW() WHERE id=$1 RETURNING *",
    [driver.id]
  );
  return recovered.rows[0] || { ...driver, status: "FREE" };
}

export async function listOrdersForDriver({ driver, status, limit, executor, orderSelect = "o.*" }) {
  await assertDriverDispatchReady(driver, executor);

  if (driver.status === "BUSY") {
    return (await runQuery(executor, `
      SELECT ${orderSelect} FROM orders o
      LEFT JOIN drivers d ON d.id=o.driver_id
      LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
      WHERE o.driver_id=$1 AND o.region_id=$2 AND o.status = ANY($3::text[])
      ORDER BY o.created_at DESC
      LIMIT $4
    `, [driver.id, driver.current_region_id, RECENT_DRIVER_STATUSES, limit])).rows;
  }

  // A rider who blocked this driver never puts their orders in front of
  // them — checked here, at the dispatch-visibility layer, rather than at
  // accept time, so a blocked driver doesn't even see the order exists.
  const notBlockedByClient = `
    NOT EXISTS (
      SELECT 1 FROM client_driver_preferences bp
      WHERE bp.client_id=o.client_id AND bp.driver_id=$1 AND bp.type='BLOCKED'
    )
  `;

  // Symmetric case: a driver who blocked this rider never gets this rider's
  // orders broadcast to them either — same visibility layer, opposite table.
  const notBlockedClient = `
    NOT EXISTS (
      SELECT 1 FROM driver_client_preferences dcp
      WHERE dcp.driver_id=$1 AND dcp.client_id=o.client_id AND dcp.type='BLOCKED'
    )
  `;

  // A driver who cancelled this specific order after accepting it never
  // sees it again in a broadcast (order-dispatch reopen path below) — they
  // can still see and act on any OTHER order, and any order they're
  // currently assigned to (o.driver_id=$1), unaffected.
  const notPreviouslyCancelledByThisDriver = `
    (o.last_cancelled_by_driver_id IS NULL OR o.last_cancelled_by_driver_id <> $1)
  `;

  if (status) {
    return (await runQuery(executor, `
      SELECT ${orderSelect} FROM orders o
      LEFT JOIN drivers d ON d.id=o.driver_id
      LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
      WHERE o.region_id=$2
        AND ((o.status = ANY($5::text[]) AND o.driver_id IS NULL) OR o.driver_id=$1)
        AND o.status=$3
        AND (o.driver_id=$1 OR (${notBlockedByClient} AND ${notBlockedClient} AND ${notPreviouslyCancelledByThisDriver}))
      ORDER BY o.created_at DESC
      LIMIT $4
    `, [driver.id, driver.current_region_id, status, limit, OPEN_ORDER_STATUSES])).rows;
  }

  // Orders where the rider raised their offered price surface first — same
  // "приоритет показа заказов с наценкой" idea as inDrive's bidding list.
  // Orders without a bid (or the driver's own already-assigned order, which
  // won't have one either) just fall back to newest-first.
  return (await runQuery(executor, `
    SELECT ${orderSelect} FROM orders o
    LEFT JOIN drivers d ON d.id=o.driver_id
    LEFT JOIN drivers od ON od.id=o.driver_offer_by_driver_id
    WHERE o.region_id=$2
      AND ((o.status = ANY($5::text[]) AND o.driver_id IS NULL) OR (o.driver_id=$1 AND o.status = ANY($3::text[])))
      AND (o.driver_id=$1 OR (${notBlockedByClient} AND ${notBlockedClient} AND ${notPreviouslyCancelledByThisDriver}))
    ORDER BY o.offered_price_kzt DESC NULLS LAST, o.created_at DESC
    LIMIT $4
  `, [driver.id, driver.current_region_id, RECENT_DRIVER_STATUSES, limit, OPEN_ORDER_STATUSES])).rows;
}

async function assertDriverNotBlockedByClient(clientId, driverId, executor) {
  if (!clientId) return;
  const blocked = await runQuery(
    executor,
    "SELECT 1 FROM client_driver_preferences WHERE client_id=$1 AND driver_id=$2 AND type='BLOCKED'",
    [clientId, driverId]
  );
  if (blocked.rows[0]) throw new AppError("Rider has blocked this driver", 403, "DRIVER_BLOCKED_BY_CLIENT");
}

// Symmetric defense-in-depth for a driver-initiated block: the order never
// shows up in listOrdersForDriver above, but a driver who already knows the
// order id (e.g. a stale client) shouldn't be able to accept/offer on it
// either.
async function assertClientNotBlockedByDriver(clientId, driverId, executor) {
  if (!clientId) return;
  const blocked = await runQuery(
    executor,
    "SELECT 1 FROM driver_client_preferences WHERE driver_id=$1 AND client_id=$2 AND type='BLOCKED'",
    [driverId, clientId]
  );
  if (blocked.rows[0]) throw new AppError("You have blocked this rider", 403, "CLIENT_BLOCKED_BY_DRIVER");
}

export async function acceptOrderForDriver({ orderId, userId, executor }) {
  const driver = (await runQuery(executor, "SELECT * FROM drivers WHERE user_id=$1 FOR UPDATE", [userId])).rows[0];
  if (!driver) throw new AppError("Driver not found", 404, "DRIVER_NOT_FOUND");
  await assertDriverDispatchReady(driver, executor);

  if (Number(driver.debt) > 15000) throw new AppError("Debt limit exceeded", 403, "DRIVER_DEBT_LIMIT");
  await assertDriverHasNoActiveOrder(driver, executor);
  if (driver.status === "OFFLINE" || driver.status === "BREAK") throw new AppError("Driver is offline", 409, "DRIVER_OFFLINE");
  if (driver.status !== "FREE") throw new AppError("Driver is not available", 409, "DRIVER_OFFLINE");

  const existing = (await runQuery(executor, "SELECT * FROM orders WHERE id=$1 FOR UPDATE", [orderId])).rows[0];
  if (!existing) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  if (!OPEN_ORDER_STATUSES.includes(existing.status) || existing.driver_id) throw new AppError("Order already accepted", 409, "ORDER_ALREADY_ACCEPTED");
  if (existing.region_id !== driver.current_region_id) {
    throw new AppError("Order is outside driver's current region", 403, "ORDER_REGION_MISMATCH");
  }
  if (existing.last_cancelled_by_driver_id === driver.id) {
    throw new AppError("You already cancelled this order", 409, "DRIVER_PREVIOUSLY_CANCELLED_ORDER");
  }
  await assertDriverNotBlockedByClient(existing.client_id, driver.id, executor);
  await assertClientNotBlockedByDriver(existing.client_id, driver.id, executor);

  const order = (await runQuery(
    executor,
    "UPDATE orders SET status='DRIVER_FOUND', driver_id=$1, accepted_at=NOW() WHERE id=$2 RETURNING *",
    [driver.id, existing.id]
  )).rows[0];
  const updatedDriver = (await runQuery(
    executor,
    "UPDATE drivers SET status='BUSY', last_seen_at=NOW() WHERE id=$1 RETURNING *",
    [driver.id]
  )).rows[0];
  await runQuery(
    executor,
    "INSERT INTO order_status_history(order_id,status,message,actor_user_id) VALUES($1,'DRIVER_FOUND','Driver accepted order',$2)",
    [existing.id, userId]
  );

  return { order, driver: updatedDriver };
}

// Shared core for putting a specific driver's price into the single
// rider-visible "primary" slot on the order — used both for a fresh
// driver-submitted offer and for promoting an already-queued one (see
// promoteQueuedPriceOffer) so the two paths can never drift out of sync.
async function setPrimaryDriverOffer(orderId, driverId, priceKzt, executor) {
  return (await runQuery(
    executor,
    `UPDATE orders
     SET driver_offer_price_kzt=$1,
         driver_offer_status='PENDING',
         driver_offer_by_driver_id=$2,
         driver_offer_proposed_by='DRIVER',
         driver_offer_created_at=NOW(),
         driver_offer_responded_at=NULL
     WHERE id=$3
     RETURNING *`,
    [priceKzt, driverId, orderId]
  )).rows[0];
}

// Driver counter-offer ("торг"): proposes a different price on an order
// that's still open to everyone — doesn't take the order, just attaches a
// pending offer the rider can accept or decline. The rider only ever sees
// one PRIMARY offer at a time (the first one, in the order table's single
// driver_offer_* slot) — first to have their offer accepted wins the
// order, not first to submit. A second driver's offer no longer silently
// overwrites the first: it's queued instead (order_price_offer_queue),
// surfaced to the rider as a notification they can promote into the
// primary slot (see promoteQueuedPriceOffer) without losing either offer.
export async function submitDriverPriceOffer({ orderId, userId, priceKzt, executor }) {
  const driver = (await runQuery(executor, "SELECT * FROM drivers WHERE user_id=$1 FOR UPDATE", [userId])).rows[0];
  if (!driver) throw new AppError("Driver not found", 404, "DRIVER_NOT_FOUND");
  await assertDriverDispatchReady(driver, executor);
  if (driver.is_blocked) throw new AppError("Driver is blocked", 403, "DRIVER_BLOCKED");

  const existing = (await runQuery(executor, "SELECT * FROM orders WHERE id=$1 FOR UPDATE", [orderId])).rows[0];
  if (!existing) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  if (!OPEN_ORDER_STATUSES.includes(existing.status) || existing.driver_id) {
    throw new AppError("Order is no longer open", 409, "ORDER_ALREADY_ACCEPTED");
  }
  if (existing.region_id !== driver.current_region_id) {
    throw new AppError("Order is outside driver's current region", 403, "ORDER_REGION_MISMATCH");
  }
  if (existing.last_cancelled_by_driver_id === driver.id) {
    throw new AppError("You already cancelled this order", 409, "DRIVER_PREVIOUSLY_CANCELLED_ORDER");
  }
  await assertDriverNotBlockedByClient(existing.client_id, driver.id, executor);
  await assertClientNotBlockedByDriver(existing.client_id, driver.id, executor);

  const primaryTakenByOther = existing.driver_offer_status === "PENDING" &&
    existing.driver_offer_by_driver_id && existing.driver_offer_by_driver_id !== driver.id;
  if (primaryTakenByOther) {
    const queued = (await runQuery(
      executor,
      `INSERT INTO order_price_offer_queue(order_id, driver_id, price_kzt)
       VALUES($1,$2,$3)
       ON CONFLICT (order_id, driver_id) WHERE status='PENDING'
       DO UPDATE SET price_kzt=EXCLUDED.price_kzt, updated_at=NOW()
       RETURNING *`,
      [existing.id, driver.id, priceKzt]
    )).rows[0];
    return { order: existing, driver, queued, isPrimary: false };
  }

  const order = await setPrimaryDriverOffer(existing.id, driver.id, priceKzt, executor);
  return { order, driver, queued: null, isPrimary: true };
}

// Rider promotes an already-queued offer (see submitDriverPriceOffer) into
// the primary slot — used when the rider wants to accept a LATER driver's
// price instead of the first one currently showing. The previous primary
// driver (if any) steps aside exactly as if the rider had explicitly
// declined them, since from that driver's side their offer is off the
// table either way.
export async function promoteQueuedPriceOffer({ orderId, queueOfferId, clientUserId, executor }) {
  const client = (await runQuery(executor, "SELECT * FROM clients WHERE user_id=$1", [clientUserId])).rows[0];
  if (!client) throw new AppError("Client not found", 404, "CLIENT_NOT_FOUND");

  // Peek unlocked to find which driver owns this queued offer, then lock
  // driver-then-order — the same order every other price-offer path in this
  // file uses (see respondToDriverPriceOffer's accept path) — to avoid a
  // deadlock against submitDriverPriceOffer/acceptOrderForDriver locking
  // the same driver+order pair concurrently in the other order.
  const peekQueued = (await runQuery(
    executor,
    "SELECT * FROM order_price_offer_queue WHERE id=$1 AND order_id=$2 AND status='PENDING'",
    [queueOfferId, orderId]
  )).rows[0];
  if (!peekQueued) throw new AppError("Queued price offer not found", 404, "QUEUED_PRICE_OFFER_NOT_FOUND");

  const driver = (await runQuery(executor, "SELECT * FROM drivers WHERE id=$1 FOR UPDATE", [peekQueued.driver_id])).rows[0];
  if (!driver) throw new AppError("Driver not found", 404, "DRIVER_NOT_FOUND");
  if (driver.is_blocked) throw new AppError("Driver is blocked", 403, "DRIVER_BLOCKED");

  const existing = (await runQuery(executor, "SELECT * FROM orders WHERE id=$1 FOR UPDATE", [orderId])).rows[0];
  if (!existing) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  if (existing.client_id !== client.id) throw new AppError("Forbidden order", 403, "FORBIDDEN_ORDER");
  if (!OPEN_ORDER_STATUSES.includes(existing.status) || existing.driver_id) {
    throw new AppError("Order is no longer open", 409, "ORDER_ALREADY_ACCEPTED");
  }

  // Re-check the queued offer now that the order is locked too — its state
  // may have changed since the unlocked peek (withdrawn, already promoted
  // by a racing request, etc.), mirroring respondToDriverPriceOffer's own
  // peek-then-lock-then-revalidate pattern.
  const queued = (await runQuery(
    executor,
    "SELECT * FROM order_price_offer_queue WHERE id=$1 AND order_id=$2 AND status='PENDING' FOR UPDATE",
    [queueOfferId, orderId]
  )).rows[0];
  if (!queued) throw new AppError("Queued price offer not found", 404, "QUEUED_PRICE_OFFER_NOT_FOUND");

  const previousDriverId = existing.driver_offer_status === "PENDING" ? existing.driver_offer_by_driver_id : null;

  const order = await setPrimaryDriverOffer(existing.id, driver.id, queued.price_kzt, executor);
  await runQuery(
    executor,
    "UPDATE order_price_offer_queue SET status='PROMOTED', updated_at=NOW() WHERE id=$1",
    [queued.id]
  );

  return { order, driver, previousDriverId };
}

// Serializes a queue row for API/socket responses, joined with the
// offering driver's public info — mirrors the offer_driver_* fields
// ORDER_SELECT already exposes for the primary offer, so both the primary
// sheet and the queued-offer notifications can share the same rider-side
// widget shape on the client.
export function publicQueuedOffer(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    priceKzt: row.price_kzt,
    createdAt: row.created_at,
    driverId: row.driver_id,
    driverName: row.driver_name ?? null,
    driverRating: row.driver_rating !== undefined && row.driver_rating !== null ? Number(row.driver_rating) : null,
    driverCarModel: row.driver_car_model ?? null,
    driverCarColor: row.driver_car_color ?? null,
    driverAvatarUrl: row.driver_id ? `/api/drivers/${row.driver_id}/avatar` : null
  };
}

// All still-relevant queued offers for an order, oldest first — "still
// relevant" is computed at read time (order still open, unclaimed) rather
// than eagerly cleared from every code path that can close an order, so a
// direct-accept, cancellation, or expiry anywhere else in the codebase
// can't leave a stale queue row behind.
export async function listQueuedPriceOffers(orderId, executor) {
  const order = (await runQuery(executor, "SELECT status, driver_id FROM orders WHERE id=$1", [orderId])).rows[0];
  if (!order || order.driver_id || !OPEN_ORDER_STATUSES.includes(order.status)) return [];
  const rows = (await runQuery(
    executor,
    `SELECT q.*, d.name AS driver_name, d.rating AS driver_rating,
            d.car_model AS driver_car_model, d.car_color AS driver_car_color
     FROM order_price_offer_queue q
     JOIN drivers d ON d.id = q.driver_id
     WHERE q.order_id=$1 AND q.status='PENDING'
     ORDER BY q.created_at ASC`,
    [orderId]
  )).rows;
  return rows.map(publicQueuedOffer);
}

// Rider's response to a pending driver price offer. Accepting assigns the
// order to that specific driver at that specific price (same end state as a
// normal accept, just price-and-driver predetermined instead of
// first-to-claim); declining just clears the offer and leaves the order
// open for anyone, including the same driver trying again at a new price.
export async function respondToDriverPriceOffer({ orderId, clientUserId, accept, executor }) {
  const client = (await runQuery(executor, "SELECT * FROM clients WHERE user_id=$1", [clientUserId])).rows[0];
  if (!client) throw new AppError("Client not found", 404, "CLIENT_NOT_FOUND");

  if (!accept) {
    const existing = (await runQuery(executor, "SELECT * FROM orders WHERE id=$1 FOR UPDATE", [orderId])).rows[0];
    if (!existing) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    if (existing.client_id !== client.id) throw new AppError("Forbidden order", 403, "FORBIDDEN_ORDER");
    // proposed_by must be 'DRIVER' -- this endpoint is the rider responding
    // to what the DRIVER most recently put on the table. If the rider's own
    // counter is what's currently pending (proposed_by='CLIENT'), there's
    // nothing of the driver's left to accept/decline; the rider is just
    // waiting on the driver's response via respondToClientCounterOffer.
    if (existing.driver_offer_status !== "PENDING" || !existing.driver_offer_by_driver_id ||
        existing.driver_offer_proposed_by !== "DRIVER") {
      throw new AppError("No pending price offer for this order", 409, "NO_PENDING_PRICE_OFFER");
    }
    const declined = (await runQuery(
      executor,
      `UPDATE orders
       SET driver_offer_status='DECLINED', driver_offer_responded_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [existing.id]
    )).rows[0];
    return { order: declined, driver: null, accepted: false };
  }

  // Accepting locks both the order and the driver — acceptOrderForDriver and
  // submitDriverPriceOffer both lock driver-then-order, so this path must use
  // the same order to avoid a deadlock when they run concurrently. The
  // driver id isn't known until the order is read, so peek unlocked first,
  // lock the driver, then lock+re-validate the order — its state may have
  // changed since the peek (offer withdrawn, order cancelled, etc.).
  const peek = (await runQuery(executor, "SELECT * FROM orders WHERE id=$1", [orderId])).rows[0];
  if (!peek) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  if (peek.client_id !== client.id) throw new AppError("Forbidden order", 403, "FORBIDDEN_ORDER");
  if (peek.driver_offer_status !== "PENDING" || !peek.driver_offer_by_driver_id ||
      peek.driver_offer_proposed_by !== "DRIVER") {
    throw new AppError("No pending price offer for this order", 409, "NO_PENDING_PRICE_OFFER");
  }

  const driver = (await runQuery(executor, "SELECT * FROM drivers WHERE id=$1 FOR UPDATE", [peek.driver_offer_by_driver_id])).rows[0];
  if (!driver) throw new AppError("Driver not found", 404, "DRIVER_NOT_FOUND");

  const existing = (await runQuery(executor, "SELECT * FROM orders WHERE id=$1 FOR UPDATE", [orderId])).rows[0];
  if (existing.driver_offer_status !== "PENDING" || existing.driver_offer_by_driver_id !== driver.id ||
      existing.driver_offer_proposed_by !== "DRIVER") {
    throw new AppError("No pending price offer for this order", 409, "NO_PENDING_PRICE_OFFER");
  }

  await assertDriverDispatchReady(driver, executor);
  await assertDriverHasNoActiveOrder(driver, executor);
  if (driver.status === "OFFLINE" || driver.status === "BREAK") throw new AppError("Driver is offline", 409, "DRIVER_OFFLINE");
  if (driver.status !== "FREE") throw new AppError("Driver is not available", 409, "DRIVER_OFFLINE");
  if (!OPEN_ORDER_STATUSES.includes(existing.status) || existing.driver_id) {
    throw new AppError("Order is no longer open", 409, "ORDER_ALREADY_ACCEPTED");
  }

  const order = (await runQuery(
    executor,
    `UPDATE orders
     SET status='DRIVER_FOUND',
         driver_id=$1,
         price=$2,
         accepted_at=NOW(),
         driver_offer_status='ACCEPTED',
         driver_offer_responded_at=NOW()
     WHERE id=$3
     RETURNING *`,
    [driver.id, existing.driver_offer_price_kzt, existing.id]
  )).rows[0];
  const updatedDriver = (await runQuery(
    executor,
    "UPDATE drivers SET status='BUSY', last_seen_at=NOW() WHERE id=$1 RETURNING *",
    [driver.id]
  )).rows[0];
  await runQuery(
    executor,
    "INSERT INTO order_status_history(order_id,status,message,actor_user_id) VALUES($1,'DRIVER_FOUND','Client accepted driver price offer',$2)",
    [existing.id, clientUserId]
  );
  // Any other drivers' queued offers are moot now that the order is taken —
  // listQueuedPriceOffers already self-filters once driver_id is set, so
  // this isn't required for correctness, just keeps the queue table's own
  // rows honest for anyone (e.g. an admin query) reading it directly.
  await runQuery(
    executor,
    "UPDATE order_price_offer_queue SET status='EXPIRED', updated_at=NOW() WHERE order_id=$1 AND status='PENDING'",
    [existing.id]
  );

  return { order, driver: updatedDriver, accepted: true };
}

// Rider's counter to a pending driver price offer -- only valid while the
// driver's own proposal is still the one on the table (proposed_by='DRIVER');
// once the rider counters, it's the driver's turn (respondToClientCounterOffer
// below) until either side accepts, declines, or counters again. Reuses the
// same single pending-offer slot as submitDriverPriceOffer/
// respondToDriverPriceOffer rather than a new table -- there is never more
// than one live proposal on an order at a time, so nothing else needs to
// track whose turn it is beyond this flag.
export async function submitClientCounterOffer({ orderId, clientUserId, priceKzt, executor }) {
  const client = (await runQuery(executor, "SELECT * FROM clients WHERE user_id=$1", [clientUserId])).rows[0];
  if (!client) throw new AppError("Client not found", 404, "CLIENT_NOT_FOUND");

  const existing = (await runQuery(executor, "SELECT * FROM orders WHERE id=$1 FOR UPDATE", [orderId])).rows[0];
  if (!existing) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  if (existing.client_id !== client.id) throw new AppError("Forbidden order", 403, "FORBIDDEN_ORDER");
  if (!OPEN_ORDER_STATUSES.includes(existing.status) || existing.driver_id) {
    throw new AppError("Order is no longer open", 409, "ORDER_ALREADY_ACCEPTED");
  }
  if (existing.driver_offer_status !== "PENDING" || !existing.driver_offer_by_driver_id ||
      existing.driver_offer_proposed_by !== "DRIVER") {
    throw new AppError("No pending price offer for this order", 409, "NO_PENDING_PRICE_OFFER");
  }

  const order = (await runQuery(
    executor,
    `UPDATE orders
     SET driver_offer_price_kzt=$1,
         driver_offer_proposed_by='CLIENT',
         driver_offer_responded_at=NULL
     WHERE id=$2
     RETURNING *`,
    [priceKzt, existing.id]
  )).rows[0];

  return { order, driverId: existing.driver_offer_by_driver_id };
}

// Driver's response to the rider's counter -- mirrors respondToDriverPriceOffer
// but from the other side: only the specific driver who owns the pending
// offer slot (driver_offer_by_driver_id) can respond, since a different
// driver has no standing proposal on this order to accept or decline.
export async function respondToClientCounterOffer({ orderId, driverUserId, accept, executor }) {
  const driverRow = (await runQuery(executor, "SELECT * FROM drivers WHERE user_id=$1", [driverUserId])).rows[0];
  if (!driverRow) throw new AppError("Driver not found", 404, "DRIVER_NOT_FOUND");

  if (!accept) {
    const existing = (await runQuery(executor, "SELECT * FROM orders WHERE id=$1 FOR UPDATE", [orderId])).rows[0];
    if (!existing) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    if (existing.driver_offer_status !== "PENDING" || existing.driver_offer_by_driver_id !== driverRow.id ||
        existing.driver_offer_proposed_by !== "CLIENT") {
      throw new AppError("No pending price offer for this order", 409, "NO_PENDING_PRICE_OFFER");
    }
    const declined = (await runQuery(
      executor,
      `UPDATE orders
       SET driver_offer_status='DECLINED', driver_offer_responded_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [existing.id]
    )).rows[0];
    return { order: declined, driver: null, accepted: false };
  }

  // Same lock ordering as respondToDriverPriceOffer's accept path (driver
  // then order) to avoid a deadlock against acceptOrderForDriver/
  // submitDriverPriceOffer running concurrently.
  const driver = (await runQuery(executor, "SELECT * FROM drivers WHERE id=$1 FOR UPDATE", [driverRow.id])).rows[0];
  const existing = (await runQuery(executor, "SELECT * FROM orders WHERE id=$1 FOR UPDATE", [orderId])).rows[0];
  if (!existing) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  if (existing.driver_offer_status !== "PENDING" || existing.driver_offer_by_driver_id !== driver.id ||
      existing.driver_offer_proposed_by !== "CLIENT") {
    throw new AppError("No pending price offer for this order", 409, "NO_PENDING_PRICE_OFFER");
  }

  await assertDriverDispatchReady(driver, executor);
  await assertDriverHasNoActiveOrder(driver, executor);
  if (driver.status === "OFFLINE" || driver.status === "BREAK") throw new AppError("Driver is offline", 409, "DRIVER_OFFLINE");
  if (driver.status !== "FREE") throw new AppError("Driver is not available", 409, "DRIVER_OFFLINE");
  if (!OPEN_ORDER_STATUSES.includes(existing.status) || existing.driver_id) {
    throw new AppError("Order is no longer open", 409, "ORDER_ALREADY_ACCEPTED");
  }

  const order = (await runQuery(
    executor,
    `UPDATE orders
     SET status='DRIVER_FOUND',
         driver_id=$1,
         price=$2,
         accepted_at=NOW(),
         driver_offer_status='ACCEPTED',
         driver_offer_responded_at=NOW()
     WHERE id=$3
     RETURNING *`,
    [driver.id, existing.driver_offer_price_kzt, existing.id]
  )).rows[0];
  const updatedDriver = (await runQuery(
    executor,
    "UPDATE drivers SET status='BUSY', last_seen_at=NOW() WHERE id=$1 RETURNING *",
    [driver.id]
  )).rows[0];
  await runQuery(
    executor,
    "INSERT INTO order_status_history(order_id,status,message,actor_user_id) VALUES($1,'DRIVER_FOUND','Driver accepted client counter-offer',$2)",
    [existing.id, driverUserId]
  );

  return { order, driver: updatedDriver, accepted: true };
}
