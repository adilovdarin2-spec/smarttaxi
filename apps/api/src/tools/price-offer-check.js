import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { offeredPriceBounds } from "../modules/orders/order-pricing.service.js";
import {
  submitDriverPriceOffer,
  respondToDriverPriceOffer
} from "../modules/orders/order-dispatch.service.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const migrations = readFileSync(join(root, "db", "migrations.js"), "utf8");
const ordersRoutes = readFileSync(join(root, "modules", "orders", "orders.routes.js"), "utf8");
const server = readFileSync(join(root, "server.js"), "utf8");

assert.match(migrations, /ADD COLUMN IF NOT EXISTS driver_offer_price_kzt INTEGER/i, "migration must add driver_offer_price_kzt");
assert.match(migrations, /ADD COLUMN IF NOT EXISTS driver_offer_status TEXT/i, "migration must add driver_offer_status");
assert.match(migrations, /ADD COLUMN IF NOT EXISTS driver_offer_by_driver_id/i, "migration must add driver_offer_by_driver_id");
assert.match(migrations, /driver_offer_status IN \('PENDING','ACCEPTED','DECLINED'\)/i, "driver_offer_status must be constrained to PENDING/ACCEPTED/DECLINED");

assert.match(server, /app\.use\("\/api\/orders", ordersRoutes\)/, "orders routes must be mounted at /api/orders");
assert.match(server, /app\.use\("\/api\/driver\/orders", ordersRoutes\)/, "orders routes must also be mounted at /api/driver/orders (price-offer reachable from the driver-facing base path too)");

assert.match(ordersRoutes, /router\.post\("\/:id\/price-offer", requireAuth, requireRole\("DRIVER"\), rateLimit\(\{ prefix: "orders-price-offer", windowMs: 60_000, max: 20 \}\)/, "price-offer submit route must require DRIVER role and be rate limited 20/min");
assert.match(ordersRoutes, /router\.post\("\/:id\/price-offer\/respond", requireAuth, requireRole\("CLIENT"\), rateLimit\(\{ prefix: "orders-price-offer-respond", windowMs: 60_000, max: 30 \}\)/, "price-offer respond route must require CLIENT role and be rate limited 30/min");

// Known, deliberately-not-fixed risk (see SECURITY_CHECKLIST.md "New risk
// areas" / commission bypass): the floor is a flat amount, not a percentage
// of the order's estimated price, so a driver+client can negotiate the
// official price down to almost nothing regardless of the real trip cost.
// This assertion isn't a bug check — it pins the current (risky) behavior so
// a silent change here (in either direction) gets noticed and cross-checked
// against the checklist instead of drifting unnoticed.
const bounds = offeredPriceBounds(50_000);
assert.equal(bounds.minAllowed, 200, "offered price floor is currently a flat 200 KZT regardless of estimated price — known commission-bypass risk, see SECURITY_CHECKLIST.md");
assert.equal(bounds.maxAllowed, 1_000_000, "offered price ceiling is currently a flat 1,000,000 KZT cap");
assert.deepEqual(offeredPriceBounds(1), offeredPriceBounds(999_999), "offered price bounds must not vary with the estimated price (confirms the floor is not proportional)");

function createExecutor() {
  const state = {
    drivers: [
      { id: "driver-1", user_id: "driver-user-1", is_blocked: false, current_region_id: "region-a", status: "FREE" },
      { id: "driver-2", user_id: "driver-user-2", is_blocked: false, current_region_id: "region-a", status: "FREE" }
    ],
    regions: [{ id: "region-a", is_active: true }],
    approvals: [
      { driver_id: "driver-1", region_id: "region-a", status: "APPROVED" },
      { driver_id: "driver-2", region_id: "region-a", status: "APPROVED" }
    ],
    clients: [{ id: "client-1", user_id: "client-user-1" }],
    preferences: [],
    orders: [{
      id: "order-1",
      status: "SEARCHING_DRIVER",
      driver_id: null,
      region_id: "region-a",
      client_id: "client-1",
      driver_offer_price_kzt: null,
      driver_offer_status: null,
      driver_offer_by_driver_id: null
    }]
  };

  return {
    state,
    async query(sql, params = []) {
      if (/SELECT \* FROM drivers WHERE user_id=\$1 FOR UPDATE/i.test(sql)) {
        return { rows: state.drivers.filter(d => d.user_id === params[0]) };
      }
      if (/SELECT \* FROM drivers WHERE id=\$1 FOR UPDATE/i.test(sql)) {
        return { rows: state.drivers.filter(d => d.id === params[0]) };
      }
      if (/SELECT \* FROM regions WHERE id=\$1/i.test(sql)) {
        return { rows: state.regions.filter(r => r.id === params[0]) };
      }
      if (/FROM driver_region_approvals\s+WHERE driver_id=\$1 AND region_id=\$2/i.test(sql)) {
        return { rows: state.approvals.filter(a => a.driver_id === params[0] && a.region_id === params[1]) };
      }
      if (/SELECT \* FROM orders WHERE id=\$1 FOR UPDATE/i.test(sql)) {
        return { rows: state.orders.filter(o => o.id === params[0]) };
      }
      if (/SELECT 1 FROM client_driver_preferences WHERE client_id=\$1 AND driver_id=\$2 AND type='BLOCKED'/i.test(sql)) {
        return { rows: state.preferences.filter(p => p.client_id === params[0] && p.driver_id === params[1] && p.type === "BLOCKED") };
      }
      if (/UPDATE orders\s+SET driver_offer_price_kzt=\$1/i.test(sql)) {
        const order = state.orders.find(o => o.id === params[2]);
        Object.assign(order, {
          driver_offer_price_kzt: params[0],
          driver_offer_status: "PENDING",
          driver_offer_by_driver_id: params[1],
          driver_offer_responded_at: null
        });
        return { rows: [order] };
      }
      if (/SELECT \* FROM clients WHERE user_id=\$1/i.test(sql)) {
        return { rows: state.clients.filter(c => c.user_id === params[0]) };
      }
      if (/UPDATE orders\s+SET driver_offer_status='DECLINED'/i.test(sql)) {
        const order = state.orders.find(o => o.id === params[0]);
        Object.assign(order, { driver_offer_status: "DECLINED", driver_offer_responded_at: "now" });
        return { rows: [order] };
      }
      if (/SELECT id FROM orders WHERE driver_id=\$1 AND status = ANY\(\$2::text\[\]\) LIMIT 1/i.test(sql)) {
        return { rows: [] };
      }
      if (/UPDATE orders\s+SET status='DRIVER_FOUND',\s*driver_id=\$1,\s*price=\$2/i.test(sql)) {
        const order = state.orders.find(o => o.id === params[2]);
        Object.assign(order, {
          status: "DRIVER_FOUND",
          driver_id: params[0],
          price: params[1],
          driver_offer_status: "ACCEPTED",
          driver_offer_responded_at: "now"
        });
        return { rows: [order] };
      }
      if (/UPDATE drivers SET status='BUSY', last_seen_at=NOW\(\) WHERE id=\$1 RETURNING \*/i.test(sql)) {
        const driver = state.drivers.find(d => d.id === params[0]);
        driver.status = "BUSY";
        return { rows: [driver] };
      }
      if (/INSERT INTO order_status_history/i.test(sql)) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in price-offer check: ${sql}`);
    }
  };
}

// Driver submits an offer on an open order.
{
  const executor = createExecutor();
  const { order } = await submitDriverPriceOffer({ orderId: "order-1", userId: "driver-user-1", priceKzt: 200, executor });
  assert.equal(order.driver_offer_status, "PENDING", "submitting an offer sets status to PENDING");
  assert.equal(order.driver_offer_price_kzt, 200, "submitting an offer stores the offered price, including the 200 KZT floor case");
  assert.equal(order.driver_offer_by_driver_id, "driver-1", "submitting an offer records which driver made it");
}

// A blocked-by-client driver cannot submit an offer, even with a stale order id.
{
  const executor = createExecutor();
  executor.state.preferences.push({ client_id: "client-1", driver_id: "driver-1", type: "BLOCKED" });
  await assert.rejects(
    () => submitDriverPriceOffer({ orderId: "order-1", userId: "driver-user-1", priceKzt: 500, executor }),
    { code: "DRIVER_BLOCKED_BY_CLIENT" },
    "a driver blocked by the order's client must not be able to submit a price offer"
  );
}

// Cannot offer on an order that's already been claimed by another driver.
{
  const executor = createExecutor();
  executor.state.orders[0].status = "DRIVER_FOUND";
  executor.state.orders[0].driver_id = "driver-2";
  await assert.rejects(
    () => submitDriverPriceOffer({ orderId: "order-1", userId: "driver-user-1", priceKzt: 500, executor }),
    { code: "ORDER_ALREADY_ACCEPTED" },
    "a driver must not be able to offer on an order that's no longer open"
  );
}

// Client accepts a pending offer: order is assigned at the offered price.
{
  const executor = createExecutor();
  await submitDriverPriceOffer({ orderId: "order-1", userId: "driver-user-1", priceKzt: 350, executor });
  const { order, accepted } = await respondToDriverPriceOffer({ orderId: "order-1", clientUserId: "client-user-1", accept: true, executor });
  assert.equal(accepted, true, "respond must report accepted:true");
  assert.equal(order.status, "DRIVER_FOUND", "accepting assigns the order");
  assert.equal(order.driver_id, "driver-1", "accepting assigns the offering driver");
  assert.equal(order.price, 350, "accepting sets the order price to the negotiated (possibly steeply discounted) price — this is exactly the commission-bypass surface flagged in SECURITY_CHECKLIST.md");
  assert.equal(order.driver_offer_status, "ACCEPTED", "accepting marks the offer ACCEPTED");
  assert.equal(executor.state.drivers.find(d => d.id === "driver-1").status, "BUSY", "accepting marks the driver BUSY");
}

// Client declines: order stays open, driver can re-offer at a different price.
{
  const executor = createExecutor();
  await submitDriverPriceOffer({ orderId: "order-1", userId: "driver-user-1", priceKzt: 350, executor });
  const { order, accepted } = await respondToDriverPriceOffer({ orderId: "order-1", clientUserId: "client-user-1", accept: false, executor });
  assert.equal(accepted, false, "respond must report accepted:false");
  assert.equal(order.status, "SEARCHING_DRIVER", "declining must not touch the order status");
  assert.equal(order.driver_offer_status, "DECLINED", "declining marks the offer DECLINED");
  assert.equal(order.driver_id, null, "declining must not assign a driver");

  const second = await submitDriverPriceOffer({ orderId: "order-1", userId: "driver-user-1", priceKzt: 500, executor });
  assert.equal(second.order.driver_offer_status, "PENDING", "after a decline, the same driver can submit a new offer at a different price");
}

// Another client cannot respond to someone else's order.
{
  const executor = createExecutor();
  executor.state.clients.push({ id: "client-2", user_id: "client-user-2" });
  await submitDriverPriceOffer({ orderId: "order-1", userId: "driver-user-1", priceKzt: 350, executor });
  await assert.rejects(
    () => respondToDriverPriceOffer({ orderId: "order-1", clientUserId: "client-user-2", accept: true, executor }),
    { code: "FORBIDDEN_ORDER" },
    "a client must not be able to respond to a price offer on someone else's order"
  );
}

console.log("Driver price-offer (\"торг\") checks ok");
