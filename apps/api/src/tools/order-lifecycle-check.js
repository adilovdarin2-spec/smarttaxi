import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createOrderCancelledTransaction } from "../modules/finance/finance.service.js";
import { isOrderSearchTimedOut } from "../modules/orders/order-dispatch.service.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const ordersRoutes = readFileSync(join(root, "modules", "orders", "orders.routes.js"), "utf8");
const dispatchService = readFileSync(join(root, "modules", "orders", "order-dispatch.service.js"), "utf8");
const migrations = readFileSync(join(root, "db", "migrations.js"), "utf8");
const financeService = readFileSync(join(root, "modules", "finance", "finance.service.js"), "utf8");
const paymentsRoutes = readFileSync(join(root, "modules", "payments", "payments.routes.js"), "utf8");

// --- structural: CARD orders must not credit real money before the payment
// is actually confirmed. A driver's withdrawable balance and a client's
// spendable cashback both used to be credited unconditionally the instant a
// trip reached TRIP_COMPLETED, even for CARD trips whose Kaspi Pay charge was
// still PENDING/PROCESSING (and could yet come back FAILED — the mock
// gateway alone has a 10% forced failure rate, with no clawback anywhere).
// This locks in the fix: crediting is deferred to settleConfirmedOrderEarnings(),
// called only once the order actually reaches PAID.
{
  const tripCompletedBlock = ordersRoutes.slice(
    ordersRoutes.indexOf('if (status === "TRIP_COMPLETED") {'),
    ordersRoutes.indexOf('if (status === "PAID") {')
  );
  assert.match(
    tripCompletedBlock,
    /if \(\["CASH", "KASPI"\]\.includes\(updated\.payment_method\)\)/,
    "TRIP_COMPLETED must branch on CASH/KASPI before crediting anything"
  );
  assert.doesNotMatch(
    tripCompletedBlock.slice(tripCompletedBlock.indexOf("} else")),
    /balance=balance\+/,
    "the non-CASH/KASPI (CARD) branch of TRIP_COMPLETED must not credit drivers.balance directly — only settleConfirmedOrderEarnings() may do that, once payment is confirmed"
  );
  // The invariant being locked in is the CASH/KASPI early return, not the
  // exact parameter list. `executor` has since lost its `= defaultQuery`
  // default — deliberately, by the look of it: settlement moves money and
  // both call sites hand in an open transaction, so forcing the executor to
  // be passed explicitly is the safer signature. Pinning the defaults here
  // made this check fail on a change that was an improvement, so the
  // signature is now matched loosely and the early return precisely.
  assert.match(
    financeService,
    /export async function settleConfirmedOrderEarnings\([^)]*\) \{\s*\n\s*if \(\["CASH", "KASPI"\]\.includes\(order\.payment_method\)\) return/,
    "settleConfirmedOrderEarnings must no-op for CASH/KASPI (already settled as debt at TRIP_COMPLETED)"
  );
  assert.match(
    ordersRoutes,
    /if \(status === "PAID"\) \{[\s\S]*?settleConfirmedOrderEarnings\(updated, client, req\.user\.id\)/,
    "the manual OWNER/FINANCE mark-paid path must run settleConfirmedOrderEarnings so a CARD order marked paid out-of-band still gets credited"
  );
  assert.match(
    paymentsRoutes,
    /settleConfirmedOrderEarnings\(updatedOrder, client, req\.user\?\.id \|\| null\)/,
    "the automatic payment-confirmed path (webhook/poll) must run settleConfirmedOrderEarnings"
  );
}

// --- structural: paid-waiting billing wiring exists ---
assert.match(ordersRoutes, /paid_waiting_started_at=\$3, waiting_total=\$4/, "TRIP_STARTED must freeze waiting_total from paid_waiting_started_at");
assert.match(ordersRoutes, /price=price\+\$1,\s*\n\s*service_commission=service_commission\+\$2/, "TRIP_COMPLETED must fold waiting_total into price/service_commission");
assert.match(ordersRoutes, /pricing_snapshot = pricing_snapshot \|\| jsonb_build_object/, "TRIP_COMPLETED must refresh pricing_snapshot so finance ledger reflects the waiting-inclusive total");

// --- structural: driver-cancel-after-accept reopens instead of dead-ending ---
assert.match(ordersRoutes, /status='SEARCHING_DRIVER',\s*\n\s*driver_id=NULL/, "driver cancel must reopen the order for dispatch, not terminal-cancel it");
assert.match(ordersRoutes, /last_cancelled_by_driver_id=\$1/, "driver cancel must stamp which driver bailed");
assert.match(dispatchService, /last_cancelled_by_driver_id IS NULL OR o\.last_cancelled_by_driver_id <> \$1/, "listOrdersForDriver must exclude the order from the driver who just cancelled it");
assert.match(dispatchService, /existing\.last_cancelled_by_driver_id === driver\.id/, "acceptOrderForDriver must refuse re-acceptance by the same driver who cancelled");

// --- structural: migration is additive only ---
assert.match(migrations, /ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_cancelled_by_driver_id UUID REFERENCES drivers\(id\) ON DELETE SET NULL/, "last_cancelled_by_driver_id column must be added additively");
assert.match(migrations, /ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_cancelled_by_driver_at TIMESTAMPTZ/, "last_cancelled_by_driver_at column must be added additively");
assert.doesNotMatch(migrations, /DROP (COLUMN|TABLE)/i, "migrations must never drop anything");

// --- isOrderSearchTimedOut: pure function ---
{
  const now = Date.now();
  assert.equal(
    isOrderSearchTimedOut({ status: "SEARCHING_DRIVER", driver_id: null, created_at: new Date(now - 76_000).toISOString() }),
    true,
    "an order past the timeout with nobody assigned is timed out"
  );
  assert.equal(
    isOrderSearchTimedOut({ status: "SEARCHING_DRIVER", driver_id: null, created_at: new Date(now - 10_000).toISOString() }),
    false,
    "a fresh order is not timed out yet"
  );
  assert.equal(
    isOrderSearchTimedOut({ status: "SEARCHING_DRIVER", driver_id: "driver-1", created_at: new Date(now - 200_000).toISOString() }),
    false,
    "an already-assigned order is never 'search timed out'"
  );
  assert.equal(
    isOrderSearchTimedOut({ status: "DRIVER_FOUND", driver_id: null, created_at: new Date(now - 200_000).toISOString() }),
    false,
    "only orders still actually searching can be timed out"
  );
}

// --- createOrderCancelledTransaction: cancellation/no-show fee ---
function createExecutor() {
  const state = {
    financialTransactions: [],
    tariffs: [{ region_id: "region-1", name: "Economy", cancellation_fee: 500, no_show_fee: 800 }],
    clients: [{ id: "client-1", cashback_balance: 300 }, { id: "client-rich", cashback_balance: 5000 }],
    drivers: [{ id: "driver-1", balance: 1000 }],
    cashbackTransactions: []
  };
  return {
    state,
    async query(sql, params = []) {
      if (/FROM financial_transactions ft[\s\S]*WHERE ft\.order_id=\$1 AND ft\.type=\$2 AND ft\.status='POSTED'/i.test(sql)) {
        return { rows: [] };
      }
      if (/SELECT \* FROM payments WHERE order_id=\$1 AND status='PAID'/i.test(sql)) {
        return { rows: [] };
      }
      if (/SELECT cancellation_fee, no_show_fee FROM tariffs WHERE region_id=\$1 AND name=\$2/i.test(sql)) {
        return { rows: state.tariffs.filter(t => t.region_id === params[0] && t.name === params[1]) };
      }
      if (/SELECT cashback_balance FROM clients WHERE id=\$1 FOR UPDATE/i.test(sql)) {
        return { rows: state.clients.filter(c => c.id === params[0]) };
      }
      if (/UPDATE clients SET cashback_balance=cashback_balance-\$1 WHERE id=\$2 RETURNING cashback_balance/i.test(sql)) {
        const client = state.clients.find(c => c.id === params[1]);
        client.cashback_balance -= params[0];
        return { rows: [{ cashback_balance: client.cashback_balance }] };
      }
      if (/INSERT INTO cashback_transactions/i.test(sql)) {
        state.cashbackTransactions.push({ clientId: params[0], orderId: params[1], type: params[2], amount: params[3], balanceAfter: params[4] });
        return { rows: [] };
      }
      if (/UPDATE drivers SET balance=balance\+\$1 WHERE id=\$2/i.test(sql)) {
        const driver = state.drivers.find(d => d.id === params[1]);
        driver.balance += params[0];
        return { rows: [driver] };
      }
      if (/INSERT INTO financial_transactions/i.test(sql)) {
        const row = {
          id: `ft-${state.financialTransactions.length + 1}`,
          order_id: params[0],
          driver_id: params[1],
          region_id: params[3],
          tariff_id: params[4],
          type: "ORDER_CANCELLED",
          payment_method: params[5],
          gross_amount: params[6],
          service_commission: 0,
          driver_earning: params[6],
          driver_debt_delta: 0,
          currency: "KZT",
          status: "POSTED",
          metadata: JSON.parse(params[7]),
          created_by_user_id: params[8]
        };
        state.financialTransactions.push(row);
        return { rows: [row] };
      }
      throw new Error(`Unexpected SQL in order lifecycle check: ${sql}`);
    }
  };
}

function baseOrder(overrides) {
  return {
    id: "order-1",
    status: "CANCELLED_BY_CLIENT",
    payment_status: "PENDING",
    payment_method: "CASH",
    region_id: "region-1",
    tariff: "Economy",
    driver_id: "driver-1",
    client_id: "client-1",
    accepted_at: null,
    pricing_snapshot: {},
    price: 1200,
    ...overrides
  };
}

{
  // Client cancels before any driver accepted -> no fee, nothing charged.
  const executor = createExecutor();
  const tx = await createOrderCancelledTransaction(baseOrder({ accepted_at: null }), null, executor);
  assert.equal(tx.grossAmount, 0, "no cancellation fee before a driver accepted");
  assert.equal(executor.state.clients.find(c => c.id === "client-1").cashback_balance, 300, "client balance untouched when no fee applies");
}

{
  // Client cancels AFTER a driver accepted -> cancellation_fee charged,
  // capped by the client's actual cashback_balance (300 < nominal 500).
  const executor = createExecutor();
  const tx = await createOrderCancelledTransaction(baseOrder({ accepted_at: "2026-07-15T10:00:00.000Z" }), null, executor);
  assert.equal(tx.grossAmount, 300, "cancellation fee is capped at the client's available cashback_balance");
  assert.equal(executor.state.clients.find(c => c.id === "client-1").cashback_balance, 0, "capped fee drains the client's balance to zero, not negative");
  assert.equal(executor.state.drivers.find(d => d.id === "driver-1").balance, 1300, "driver is credited exactly what was actually collected");
  assert.equal(tx.metadata.feeType, "CANCELLATION_FEE");
}

{
  // Client with enough balance -> full nominal fee charged.
  const executor = createExecutor();
  const tx = await createOrderCancelledTransaction(
    baseOrder({ accepted_at: "2026-07-15T10:00:00.000Z", client_id: "client-rich" }),
    null,
    executor
  );
  assert.equal(tx.grossAmount, 500, "full nominal cancellation_fee is charged when the client can cover it");
  assert.equal(executor.state.clients.find(c => c.id === "client-rich").cashback_balance, 4500);
}

{
  // Driver cancels (CANCELLED_BY_DRIVER) -> never charges the client, even
  // with accepted_at set — this is not the rider's fault.
  const executor = createExecutor();
  const tx = await createOrderCancelledTransaction(
    baseOrder({ status: "CANCELLED_BY_DRIVER", accepted_at: "2026-07-15T10:00:00.000Z" }),
    null,
    executor
  );
  assert.equal(tx.grossAmount, 0, "driver-initiated cancellation never charges the rider a fee");
  assert.equal(executor.state.clients.find(c => c.id === "client-1").cashback_balance, 300);
}

{
  // NO_SHOW -> no_show_fee charged regardless of accepted_at value.
  const executor = createExecutor();
  const tx = await createOrderCancelledTransaction(
    baseOrder({ status: "NO_SHOW", client_id: "client-rich" }),
    null,
    executor
  );
  assert.equal(tx.grossAmount, 800, "no-show charges the tariff's no_show_fee");
  assert.equal(tx.metadata.feeType, "NO_SHOW_FEE");
}

console.log("Order lifecycle (paid waiting, driver-cancel reopen, cancellation/no-show fee) checks ok");
