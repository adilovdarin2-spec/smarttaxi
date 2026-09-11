import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  acceptOrderForDriver,
  assertStatusTransition,
  dispatchRegionRoom,
  driverRegionRoom,
  listOrdersForDriver,
  orderRoom,
  publicOrderStatus,
  TRANSITION_RULES
} from "../modules/orders/order-dispatch.service.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const schema = readFileSync(join(root, "db", "schema.sql"), "utf8");
const migrations = readFileSync(join(root, "db", "migrations.js"), "utf8");
const ordersRoutes = readFileSync(join(root, "modules", "orders", "orders.routes.js"), "utf8");
const driverCoreRoutes = readFileSync(join(root, "modules", "drivers", "driver-core.routes.js"), "utf8");
const dispatchService = readFileSync(join(root, "modules", "orders", "order-dispatch.service.js"), "utf8");
const server = readFileSync(join(root, "server.js"), "utf8");

assert.match(schema, /idx_orders_region_status_created_at/i, "schema must add region/status order index");
assert.match(schema, /idx_orders_one_active_per_driver/i, "schema should enforce one active order per driver on fresh databases");
assert.match(schema, /idx_orders_one_active_per_client/i, "schema should enforce one active order per client on fresh databases");
assert.match(migrations, /duplicate_active_driver_orders/i, "migration must avoid destructive cleanup before partial unique index");
assert.match(migrations, /duplicate_active_client_orders/i, "migration must avoid destructive cleanup before client active-order index");
assert.match(dispatchService, /SELECT \* FROM drivers WHERE user_id=\$1 FOR UPDATE/i, "accept must lock driver row");
assert.match(dispatchService, /SELECT \* FROM orders WHERE id=\$1 FOR UPDATE/i, "accept must lock order row");
assert.match(ordersRoutes, /listOrdersForDriver/i, "driver order listing must use region-scoped dispatch service");
assert.match(ordersRoutes, /acceptOrderForDriver/i, "accept endpoint must use transactional dispatch service");
assert.match(driverCoreRoutes, /const activeOrder = await activeOrderForDriver\(driver\);[\s\S]*const nextStatus = activeOrder \? "BUSY" : "FREE"/, "driver online must keep BUSY when an active order exists");
assert.match(ordersRoutes, /emitOrderCreated\(req\.io, order\)/, "order creation must emit after transaction returns");
assert.match(ordersRoutes, /emitOrderUpdated\(req\.io, order, "order_accepted"\)/, "accept must emit after transaction returns");
assert.doesNotMatch(ordersRoutes, /\.to\("drivers"\)/, "order offers must not use global drivers room");
assert.doesNotMatch(ordersRoutes, /\.to\("dispatch"\)/, "order updates must not use global dispatch room");
assert.match(server, /socket\.on\("join_drivers", async \(\)/, "driver room join must ignore client-supplied region id");
assert.match(server, /driver\.current_region_id/, "driver room join must use backend current_region_id");
assert.match(server, /assertDriverDispatchReady\(driver, query\)/, "driver socket join must validate active approved region");
assert.doesNotMatch(server, /socket\.join\("drivers"\)/, "server must not join global drivers room");
assert.doesNotMatch(server, /socket\.to\("dispatch"\)/, "server must not emit driver location to global dispatch room");
const forbiddenAccountingPattern = new RegExp([
  "financial_" + "transactions",
  "pay" + "out",
  "payment_" + "intent",
  "acquir" + "ing"
].join("|"), "i");
assert.doesNotMatch(dispatchService, forbiddenAccountingPattern, "M4 dispatch service must not add accounting integrations");

assert.equal(driverRegionRoom("region-a"), "region:region-a:drivers", "driver realtime room is region scoped");
assert.equal(dispatchRegionRoom("region-a"), "region:region-a:dispatch", "dispatch realtime room is region scoped");
assert.equal(orderRoom("order-a"), "order:order-a", "order room is order scoped");
assert.equal(publicOrderStatus("SEARCHING_DRIVER"), "SEARCHING_DRIVER", "SEARCHING_DRIVER is public");
assert.equal(publicOrderStatus("DRIVER_FOUND"), "DRIVER_FOUND", "DRIVER_FOUND is public");
assert.equal(publicOrderStatus("TRIP_STARTED"), "TRIP_STARTED", "TRIP_STARTED is public");
assert.equal(publicOrderStatus("NEW"), "SEARCHING_DRIVER", "legacy NEW maps to SEARCHING_DRIVER");
assert.equal(publicOrderStatus("DRIVER_ASSIGNED"), "DRIVER_FOUND", "legacy DRIVER_ASSIGNED maps to DRIVER_FOUND");
assert.equal(publicOrderStatus("CANCELLED"), "CANCELLED_BY_CLIENT", "legacy CANCELLED maps to CANCELLED_BY_CLIENT");

function createExecutor() {
  const state = {
    regions: [
      { id: "region-a", is_active: true },
      { id: "region-b", is_active: true },
      { id: "region-inactive", is_active: false }
    ],
    approvals: [
      { driver_id: "driver-1", region_id: "region-a", status: "APPROVED" },
      { driver_id: "driver-2", region_id: "region-a", status: "APPROVED" },
      { driver_id: "driver-blocked-region", region_id: "region-a", status: "BLOCKED" },
      { driver_id: "driver-inactive-region", region_id: "region-inactive", status: "APPROVED" },
      { driver_id: "driver-active-order", region_id: "region-a", status: "APPROVED" },
      { driver_id: "driver-stale-busy", region_id: "region-a", status: "APPROVED" }
    ],
    drivers: [
      { id: "driver-1", user_id: "user-1", current_region_id: "region-a", is_blocked: false, status: "FREE", debt: 0 },
      { id: "driver-2", user_id: "user-2", current_region_id: "region-a", is_blocked: false, status: "FREE", debt: 0 },
      { id: "driver-no-approval", user_id: "user-no-approval", current_region_id: "region-a", is_blocked: false, status: "FREE", debt: 0 },
      { id: "driver-blocked-region", user_id: "user-blocked-region", current_region_id: "region-a", is_blocked: false, status: "FREE", debt: 0 },
      { id: "driver-global-blocked", user_id: "user-global-blocked", current_region_id: "region-a", is_blocked: true, status: "FREE", debt: 0 },
      { id: "driver-inactive-region", user_id: "user-inactive-region", current_region_id: "region-inactive", is_blocked: false, status: "FREE", debt: 0 },
      { id: "driver-active-order", user_id: "user-active-order", current_region_id: "region-a", is_blocked: false, status: "FREE", debt: 0 },
      { id: "driver-stale-busy", user_id: "user-stale-busy", current_region_id: "region-a", is_blocked: false, status: "BUSY", debt: 0 }
    ],
    orders: [
      { id: "order-a", region_id: "region-a", status: "SEARCHING_DRIVER", driver_id: null, created_at: 10 },
      { id: "order-b", region_id: "region-b", status: "SEARCHING_DRIVER", driver_id: null, created_at: 9 },
      { id: "order-active", region_id: "region-a", status: "DRIVER_FOUND", driver_id: "driver-active-order", created_at: 8 },
      { id: "order-assigned", region_id: "region-a", status: "DRIVER_FOUND", driver_id: "driver-already", created_at: 7 }
    ],
    history: []
  };

  return {
    state,
    async query(sql, params = []) {
      if (/SELECT \* FROM drivers WHERE user_id=\$1 FOR UPDATE/i.test(sql)) {
        return { rows: state.drivers.filter(driver => driver.user_id === params[0]) };
      }
      if (/SELECT \* FROM regions WHERE id=\$1/i.test(sql)) {
        return { rows: state.regions.filter(region => region.id === params[0]) };
      }
      if (/FROM driver_region_approvals\s+WHERE driver_id=\$1 AND region_id=\$2/i.test(sql)) {
        return { rows: state.approvals.filter(approval => approval.driver_id === params[0] && approval.region_id === params[1]) };
      }
      if (/SELECT id FROM orders WHERE driver_id=\$1 AND status = ANY\(\$2::text\[\]\) LIMIT 1/i.test(sql)) {
        return { rows: state.orders.filter(order => order.driver_id === params[0] && params[1].includes(order.status)).slice(0, 1) };
      }
      if (/SELECT \* FROM orders WHERE id=\$1 FOR UPDATE/i.test(sql)) {
        return { rows: state.orders.filter(order => order.id === params[0]) };
      }
      if (/UPDATE orders SET status='DRIVER_FOUND'/i.test(sql)) {
        const order = state.orders.find(row => row.id === params[1]);
        order.status = "DRIVER_FOUND";
        order.driver_id = params[0];
        order.accepted_at = "2026-01-01T00:00:00.000Z";
        return { rows: [order] };
      }
      if (/UPDATE drivers SET status='BUSY'/i.test(sql)) {
        const driver = state.drivers.find(row => row.id === params[0]);
        driver.status = "BUSY";
        return { rows: [driver] };
      }
      if (/UPDATE drivers SET status='FREE'/i.test(sql)) {
        const driver = state.drivers.find(row => row.id === params[0]);
        driver.status = "FREE";
        state.recoveredBusy = true;
        return { rows: [driver] };
      }
      if (/INSERT INTO order_status_history/i.test(sql)) {
        state.history.push({ order_id: params[0], actor_user_id: params[1] });
        return { rows: [] };
      }
      if (/FROM orders o/i.test(sql) && /WHERE o.region_id=\$2/i.test(sql)) {
        const [driverId, regionId, filter, limit] = params;
        let rows;
        if (/AND o.status=\$3/i.test(sql)) {
          rows = state.orders.filter(order =>
            order.region_id === regionId &&
            ((["SEARCHING_DRIVER", "NEW"].includes(order.status) && order.driver_id === null) || order.driver_id === driverId) &&
            order.status === filter
          );
        } else {
          rows = state.orders.filter(order =>
            order.region_id === regionId &&
            ((["SEARCHING_DRIVER", "NEW"].includes(order.status) && order.driver_id === null) || (order.driver_id === driverId && filter.includes(order.status)))
          );
        }
        return { rows: rows.sort((a, b) => b.created_at - a.created_at).slice(0, limit) };
      }
      if (/SELECT DISTINCT ON \(type\) type, status\s+FROM driver_documents/i.test(sql)) {
        // This file's fixtures aren't about document review — every driver
        // here is treated as fully document-approved (see
        // driver-approval-check.js for the dedicated document-gate tests).
        return { rows: ["DRIVER_LICENSE_FRONT", "DRIVER_LICENSE_BACK", "ID_CARD_FRONT", "ID_CARD_BACK", "VEHICLE_REGISTRATION"].map(type => ({ type, status: "APPROVED" })) };
      }
      throw new Error(`Unexpected SQL in dispatch realtime check: ${sql}`);
    }
  };
}

const listingExecutor = createExecutor();
const driver = listingExecutor.state.drivers[0];
const visible = await listOrdersForDriver({ driver, limit: 20, executor: listingExecutor });
assert.deepEqual(visible.map(order => order.id), ["order-a"], "driver sees only open orders from selected approved active region");
assert.equal(visible.some(order => order.region_id === "region-b"), false, "driver cannot see other-region orders");

await assert.rejects(
  () => acceptOrderForDriver({ orderId: "order-b", userId: "user-1", executor: createExecutor() }),
  { code: "ORDER_REGION_MISMATCH" },
  "driver cannot accept order outside current_region_id"
);

await assert.rejects(
  () => acceptOrderForDriver({ orderId: "order-a", userId: "user-no-approval", executor: createExecutor() }),
  { code: "DRIVER_REGION_NOT_APPROVED" },
  "driver cannot accept without approval for region"
);

await assert.rejects(
  () => acceptOrderForDriver({ orderId: "order-a", userId: "user-blocked-region", executor: createExecutor() }),
  { code: "DRIVER_REGION_BLOCKED" },
  "driver with BLOCKED region approval cannot accept"
);

await assert.rejects(
  () => acceptOrderForDriver({ orderId: "order-a", userId: "user-global-blocked", executor: createExecutor() }),
  { code: "DRIVER_BLOCKED" },
  "globally blocked driver cannot accept"
);

await assert.rejects(
  () => acceptOrderForDriver({ orderId: "order-a", userId: "user-inactive-region", executor: createExecutor() }),
  { code: "DRIVER_REGION_INACTIVE" },
  "inactive selected region cannot accept"
);

await assert.rejects(
  () => acceptOrderForDriver({ orderId: "order-a", userId: "user-active-order", executor: createExecutor() }),
  { code: "DRIVER_HAS_ACTIVE_ORDER" },
  "driver with active order cannot accept another"
);

const staleBusyExecutor = createExecutor();
const staleBusyAccepted = await acceptOrderForDriver({ orderId: "order-a", userId: "user-stale-busy", executor: staleBusyExecutor });
assert.equal(staleBusyExecutor.state.recoveredBusy, true, "stale BUSY driver without active order is recovered");
assert.equal(staleBusyAccepted.driver.status, "BUSY", "recovered driver is marked busy after accepting new order");

await assert.rejects(
  () => acceptOrderForDriver({ orderId: "order-assigned", userId: "user-1", executor: createExecutor() }),
  { code: "ORDER_ALREADY_ACCEPTED" },
  "order must be NEW and unassigned before accept"
);

const acceptExecutor = createExecutor();
const accepted = await acceptOrderForDriver({ orderId: "order-a", userId: "user-1", executor: acceptExecutor });
assert.equal(accepted.order.driver_id, "driver-1", "accept sets order driver_id");
assert.equal(accepted.order.status, "DRIVER_FOUND", "accept sets DRIVER_FOUND status");
assert.equal(accepted.driver.status, "BUSY", "accept marks driver busy");

await assert.rejects(
  () => acceptOrderForDriver({ orderId: "order-a", userId: "user-2", executor: acceptExecutor }),
  { code: "ORDER_ALREADY_ACCEPTED" },
  "two drivers cannot accept the same order"
);

let status = "SEARCHING_DRIVER";
assert.doesNotThrow(() => assertStatusTransition({ status }, "DRIVER_FOUND"), "SEARCHING_DRIVER -> DRIVER_FOUND succeeds");
status = "DRIVER_FOUND";
assert.doesNotThrow(() => assertStatusTransition({ status }, "DRIVER_GOING_TO_CLIENT"), "DRIVER_FOUND -> DRIVER_GOING_TO_CLIENT succeeds");
status = "DRIVER_GOING_TO_CLIENT";
assert.doesNotThrow(() => assertStatusTransition({ status }, "DRIVER_ARRIVED"), "DRIVER_GOING_TO_CLIENT -> DRIVER_ARRIVED succeeds");
status = "DRIVER_ARRIVED";
assert.doesNotThrow(() => assertStatusTransition({ status }, "WAITING_CLIENT"), "DRIVER_ARRIVED -> WAITING_CLIENT succeeds");
status = "WAITING_CLIENT";
assert.doesNotThrow(() => assertStatusTransition({ status }, "TRIP_STARTED"), "WAITING_CLIENT -> TRIP_STARTED succeeds");
status = "TRIP_STARTED";
assert.doesNotThrow(() => assertStatusTransition({ status }, "TRIP_COMPLETED"), "TRIP_STARTED -> TRIP_COMPLETED succeeds");
assert.throws(() => assertStatusTransition({ status: "SEARCHING_DRIVER" }, "TRIP_STARTED"), { code: "INVALID_STATUS_TRANSITION" }, "invalid transition fails");
assert.throws(() => assertStatusTransition({ status: "TRIP_STARTED" }, "CANCELLED_BY_DRIVER"), { code: "INVALID_STATUS_TRANSITION" }, "driver cannot cancel after trip start");
assert.throws(() => assertStatusTransition({ status: "TRIP_STARTED" }, "CANCELLED_BY_CLIENT"), { code: "INVALID_STATUS_TRANSITION" }, "client cannot cancel after trip start");
for (const cancellationStatus of ["CANCELLED_BY_CLIENT", "CANCELLED_BY_DRIVER", "CANCELLED_BY_OPERATOR"]) {
  assert.equal(TRANSITION_RULES[cancellationStatus].includes("TRIP_STARTED"), false, `${cancellationStatus} must not allow TRIP_STARTED`);
  assert.equal(TRANSITION_RULES[cancellationStatus].includes("IN_PROGRESS"), false, `${cancellationStatus} must not allow legacy IN_PROGRESS`);
}
assert.throws(() => assertStatusTransition({ status: "PAID" }, "CANCELLED_BY_CLIENT"), { code: "INVALID_STATUS_TRANSITION" }, "paid order is terminal");
assert.throws(() => assertStatusTransition({ status: "CANCELLED_BY_CLIENT" }, "DRIVER_FOUND"), { code: "INVALID_STATUS_TRANSITION" }, "cancelled order is terminal");
assert.match(ordersRoutes, /existing\.driver_id !== driver\.id/, "driver cannot update order they do not own");
assert.match(ordersRoutes, /CLIENT_HAS_ACTIVE_ORDER/, "client cannot create duplicate active orders");

console.log("Dispatch and realtime checks ok");
