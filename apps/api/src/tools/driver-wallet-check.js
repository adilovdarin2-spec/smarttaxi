import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIN_PAYOUT_KZT,
  MIN_TOPUP_KZT,
  cancelPayoutRequest,
  createDriverTopupRequest,
  createPayoutRequest,
  getWalletSummary,
  listDriverTopupRequests,
  listWalletTransactions,
  reviewPayoutRequest
} from "../modules/wallet/wallet.service.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const schema = readFileSync(join(root, "db", "schema.sql"), "utf8");
const migrations = readFileSync(join(root, "db", "migrations.js"), "utf8");
const walletRoutes = readFileSync(join(root, "modules", "wallet", "wallet.routes.js"), "utf8");
const adminRoutes = readFileSync(join(root, "modules", "admin", "admin.routes.js"), "utf8");

assert.match(schema, /CREATE TABLE IF NOT EXISTS driver_payout_requests/i, "schema must create driver_payout_requests table");
assert.match(migrations, /CREATE TABLE IF NOT EXISTS driver_payout_requests/i, "migration must create driver_payout_requests table");
assert.match(migrations, /status TEXT NOT NULL DEFAULT 'PENDING' CHECK \(status IN \('PENDING','APPROVED','PAID','REJECTED','CANCELLED'\)\)/i, "payout status must be constrained");

assert.match(walletRoutes, /router\.get\("\/", requireAuth, requireRole\("DRIVER"\)/, "wallet summary endpoint must require driver role");
assert.match(walletRoutes, /router\.post\("\/payout-requests", requireAuth, requireRole\("DRIVER"\)/, "payout creation must require driver role");
assert.match(adminRoutes, /router\.patch\("\/payout-requests\/:id", requireAuth, requireRole\("OWNER", "FINANCE"\)/, "payout review must be owner/finance only");

assert.match(schema, /CREATE TABLE IF NOT EXISTS driver_topup_requests/i, "schema must create driver_topup_requests table");
assert.match(migrations, /CREATE TABLE IF NOT EXISTS driver_topup_requests/i, "migration must create driver_topup_requests table");
assert.match(walletRoutes, /router\.post\("\/topup-requests", requireAuth, requireRole\("DRIVER"\)/, "topup creation must require driver role");
assert.match(walletRoutes, /router\.get\("\/topup-requests", requireAuth, requireRole\("DRIVER"\)/, "topup listing must require driver role");

function createExecutor() {
  const state = {
    drivers: [
      { id: "driver-1", user_id: "user-1", balance: 10000, debt: 1500, is_blocked: false },
      { id: "driver-blocked", user_id: "user-2", balance: 50000, debt: 0, is_blocked: true }
    ],
    payoutRequests: [],
    topupRequests: [],
    financialTransactions: [
      { id: "ft-1", order_id: "order-1", driver_id: "driver-1", type: "ORDER_COMPLETED", payment_method: "KASPI_TRANSFER", gross_amount: 1000, service_commission: 150, driver_earning: 850, driver_debt_delta: 0, currency: "KZT", status: "POSTED", created_at: "2026-01-03T00:00:00.000Z", order_short_id: "A1" },
      { id: "ft-2", order_id: "order-2", driver_id: "driver-1", type: "ORDER_COMPLETED", payment_method: "CASH", gross_amount: 1000, service_commission: 150, driver_earning: 850, driver_debt_delta: 0, currency: "KZT", status: "POSTED", created_at: "2026-01-02T00:00:00.000Z", order_short_id: "A2" },
      { id: "ft-3", order_id: null, driver_id: "driver-1", type: "DRIVER_DEBT_ADJUSTED", payment_method: "UNKNOWN", gross_amount: 0, service_commission: 0, driver_earning: 0, driver_debt_delta: -500, currency: "KZT", status: "POSTED", created_at: "2026-01-01T00:00:00.000Z", order_short_id: null }
    ]
  };
  let payoutSeq = 0;
  let topupSeq = 0;

  return {
    state,
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, " ").trim();

      if (s.startsWith("SELECT balance, debt FROM drivers WHERE id=$1")) {
        return { rows: state.drivers.filter(d => d.id === params[0]).map(d => ({ balance: d.balance, debt: d.debt })) };
      }
      if (s.startsWith("SELECT COALESCE(SUM(amount_kzt),0)::int pending FROM driver_payout_requests")) {
        const pending = state.payoutRequests
          .filter(p => p.driver_id === params[0] && ["PENDING", "APPROVED"].includes(p.status))
          .reduce((sum, p) => sum + p.amount_kzt, 0);
        return { rows: [{ pending }] };
      }
      if (s.startsWith("SELECT ft.*, o.short_id order_short_id FROM financial_transactions")) {
        const rows = state.financialTransactions
          .filter(t => t.driver_id === params[0] && t.status === "POSTED")
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .slice(params[2], params[2] + params[1]);
        return { rows };
      }
      if (s.startsWith("SELECT COUNT(*)::int total FROM financial_transactions")) {
        const total = state.financialTransactions.filter(t => t.driver_id === params[0] && t.status === "POSTED").length;
        return { rows: [{ total }] };
      }
      if (s.startsWith("SELECT * FROM drivers WHERE id=$1 FOR UPDATE")) {
        return { rows: state.drivers.filter(d => d.id === params[0]) };
      }
      if (s.startsWith("INSERT INTO driver_payout_requests")) {
        const [driverId, amountKzt, method, details] = params;
        payoutSeq += 1;
        const row = {
          id: `payout-${payoutSeq}`,
          driver_id: driverId,
          amount_kzt: amountKzt,
          method,
          payout_details: JSON.parse(details),
          status: "PENDING",
          rejection_reason: null,
          provider_reference: null,
          reviewed_by_user_id: null,
          reviewed_at: null,
          paid_at: null,
          created_at: "2026-01-04T00:00:00.000Z",
          updated_at: "2026-01-04T00:00:00.000Z"
        };
        state.payoutRequests.push(row);
        return { rows: [row] };
      }
      if (s.startsWith("UPDATE drivers SET balance=balance-$1 WHERE id=$2")) {
        const driver = state.drivers.find(d => d.id === params[1]);
        driver.balance -= params[0];
        return { rows: [driver] };
      }
      if (s.startsWith("UPDATE drivers SET balance=balance-$1, debt=debt-$1 WHERE id=$2")) {
        const driver = state.drivers.find(d => d.id === params[1]);
        driver.balance -= params[0];
        driver.debt -= params[0];
        return { rows: [driver] };
      }
      if (s.startsWith("SELECT balance FROM drivers WHERE id=$1")) {
        return { rows: state.drivers.filter(d => d.id === params[0]).map(d => ({ balance: d.balance })) };
      }
      if (s.startsWith("INSERT INTO financial_transactions( driver_id, type, payment_method, gross_amount, service_commission, driver_earning, driver_debt_delta, currency, status, metadata )")) {
        return { rows: [] };
      }
      if (s.startsWith("UPDATE drivers SET balance=balance+$1 WHERE id=$2")) {
        const driver = state.drivers.find(d => d.id === params[1]);
        driver.balance += params[0];
        return { rows: [driver] };
      }
      if (s.startsWith("SELECT * FROM driver_payout_requests WHERE id=$1 AND driver_id=$2 FOR UPDATE")) {
        return { rows: state.payoutRequests.filter(p => p.id === params[0] && p.driver_id === params[1]) };
      }
      if (s.startsWith("UPDATE driver_payout_requests SET status='CANCELLED'")) {
        const row = state.payoutRequests.find(p => p.id === params[0]);
        row.status = "CANCELLED";
        row.updated_at = "2026-01-04T00:05:00.000Z";
        return { rows: [row] };
      }
      if (s.startsWith("SELECT * FROM driver_payout_requests WHERE id=$1 FOR UPDATE")) {
        return { rows: state.payoutRequests.filter(p => p.id === params[0]) };
      }
      if (s.startsWith("UPDATE driver_payout_requests SET status=$1")) {
        const [status, reason, providerReference, actorUserId, id] = params;
        const row = state.payoutRequests.find(p => p.id === id);
        row.status = status;
        if (status === "REJECTED") row.rejection_reason = reason;
        if (providerReference) row.provider_reference = providerReference;
        row.reviewed_by_user_id = actorUserId;
        row.reviewed_at = "2026-01-04T00:06:00.000Z";
        if (status === "PAID") row.paid_at = "2026-01-04T00:07:00.000Z";
        row.updated_at = "2026-01-04T00:06:00.000Z";
        return { rows: [row] };
      }
      if (s.startsWith("INSERT INTO driver_topup_requests")) {
        const [driverId, amountKzt] = params;
        topupSeq += 1;
        const row = {
          id: `topup-${topupSeq}`,
          driver_id: driverId,
          amount_kzt: amountKzt,
          method: "KASPI_PAY",
          status: "PENDING",
          provider_reference: null,
          created_at: "2026-01-04T00:00:00.000Z",
          updated_at: "2026-01-04T00:00:00.000Z"
        };
        state.topupRequests.push(row);
        return { rows: [row] };
      }
      if (s.startsWith("SELECT * FROM driver_topup_requests WHERE driver_id=$1")) {
        return { rows: state.topupRequests.filter(r => r.driver_id === params[0]) };
      }
      throw new Error(`Unexpected SQL in wallet check: ${s}`);
    }
  };
}

// --- getWalletSummary ---
{
  const executor = createExecutor();
  const summary = await getWalletSummary("driver-1", executor);
  assert.equal(summary.balanceKzt, 10000, "summary reports current balance");
  assert.equal(summary.debtKzt, 1500, "summary reports current debt");
  assert.equal(summary.pendingPayoutKzt, 0, "no pending payouts initially");
  assert.equal(summary.minPayoutKzt, MIN_PAYOUT_KZT, "summary exposes minimum payout threshold");
}

// --- createPayoutRequest guardrails ---
{
  const executor = createExecutor();
  await assert.rejects(
    () => createPayoutRequest({ driverId: "driver-1", amountKzt: MIN_PAYOUT_KZT - 1, method: "KASPI_TRANSFER" }, executor),
    { code: "PAYOUT_BELOW_MINIMUM" },
    "payout below minimum is rejected"
  );
  await assert.rejects(
    () => createPayoutRequest({ driverId: "driver-1", amountKzt: 999999, method: "KASPI_TRANSFER" }, executor),
    { code: "PAYOUT_EXCEEDS_BALANCE" },
    "payout above balance is rejected"
  );
  await assert.rejects(
    () => createPayoutRequest({ driverId: "driver-blocked", amountKzt: MIN_PAYOUT_KZT, method: "KASPI_TRANSFER" }, executor),
    { code: "DRIVER_BLOCKED" },
    "blocked driver cannot request payout"
  );
}

// --- createPayoutRequest -> cancelPayoutRequest refund flow ---
// driver-1 starts with balance=10000, debt=1500. createPayoutRequest now
// settles that debt against balance before checking/holding anything
// (10000-1500=8500), so the numbers below are post-settlement, not a plain
// balance-minus-amount.
{
  const executor = createExecutor();
  const created = await createPayoutRequest({ driverId: "driver-1", amountKzt: 5000, method: "KASPI_TRANSFER", details: { phone: "+77001234567" } }, executor);
  assert.equal(created.payoutRequest.status, "PENDING", "new payout request starts pending");
  assert.equal(created.driver.balance, 3500, "debt is settled from balance first (8500), then the payout is held (8500-5000)");

  const cancelled = await cancelPayoutRequest({ driverId: "driver-1", id: created.payoutRequest.id }, executor);
  assert.equal(cancelled.payoutRequest.status, "CANCELLED", "cancel sets status to cancelled");
  assert.equal(cancelled.driver.balance, 8500, "cancelling refunds the held balance (debt stays settled, doesn't come back)");

  await assert.rejects(
    () => cancelPayoutRequest({ driverId: "driver-1", id: created.payoutRequest.id }, executor),
    { code: "PAYOUT_REQUEST_NOT_PENDING" },
    "already-cancelled payout cannot be cancelled again"
  );
}

// --- reviewPayoutRequest admin lifecycle ---
{
  const executor = createExecutor();
  const created = await createPayoutRequest({ driverId: "driver-1", amountKzt: 4000, method: "KASPI_TRANSFER" }, executor);

  await assert.rejects(
    () => reviewPayoutRequest({ id: created.payoutRequest.id, status: "PAID", actorUserId: "admin-1" }, executor),
    { code: "PAYOUT_REQUEST_NOT_APPROVED" },
    "cannot mark paid before approval"
  );

  const approved = await reviewPayoutRequest({ id: created.payoutRequest.id, status: "APPROVED", actorUserId: "admin-1" }, executor);
  assert.equal(approved.payoutRequest.status, "APPROVED", "admin can approve a pending payout");
  assert.equal(approved.driver, null, "approving does not touch balance");

  const paid = await reviewPayoutRequest({ id: created.payoutRequest.id, status: "PAID", actorUserId: "admin-1", providerReference: "KASPI-TX-1" }, executor);
  assert.equal(paid.payoutRequest.status, "PAID", "admin can mark an approved payout as paid");
  assert.equal(paid.payoutRequest.providerReference, "KASPI-TX-1", "provider reference is stored");

  await assert.rejects(
    () => reviewPayoutRequest({ id: created.payoutRequest.id, status: "REJECTED", actorUserId: "admin-1" }, executor),
    { code: "PAYOUT_REQUEST_FINALIZED" },
    "a paid payout cannot be rejected afterwards"
  );
}

// --- reviewPayoutRequest rejection refunds balance ---
// Same pre-settlement math as above: 10000-1500 debt settlement = 8500,
// then the 3000 payout is held.
{
  const executor = createExecutor();
  const created = await createPayoutRequest({ driverId: "driver-1", amountKzt: 3000, method: "KASPI_TRANSFER" }, executor);
  assert.equal(created.driver.balance, 5500, "balance held after request (post debt-settlement)");

  const rejected = await reviewPayoutRequest({ id: created.payoutRequest.id, status: "REJECTED", reason: "Неверные реквизиты", actorUserId: "admin-1" }, executor);
  assert.equal(rejected.payoutRequest.status, "REJECTED", "rejection updates status");
  assert.equal(rejected.payoutRequest.rejectionReason, "Неверные реквизиты", "rejection stores the reason");
  assert.equal(rejected.driver.balance, 8500, "rejecting a payout refunds the held balance (debt stays settled)");
}

// --- listWalletTransactions kind mapping ---
{
  const executor = createExecutor();
  const { items, total } = await listWalletTransactions({ driverId: "driver-1", limit: 30, offset: 0 }, executor);
  assert.equal(total, 3, "all posted transactions for the driver are counted");
  assert.equal(items.length, 3, "all posted transactions are returned within the limit");
  assert.equal(items[0].orderShortId, "A1", "transactions sort newest first");

  const earning = items.find(item => item.orderShortId === "A1");
  assert.equal(earning.kind, "EARNING", "KASPI trip is an earning that credited the balance");
  assert.equal(earning.amountKzt, 850, "earning amount matches driver_earning");

  const cashTrip = items.find(item => item.orderShortId === "A2");
  assert.equal(cashTrip.kind, "CASH_TRIP_COMMISSION", "cash trip only moved debt, not balance");
  assert.equal(cashTrip.amountKzt, 150, "cash trip amount matches the commission charged to debt");

  const adjustment = items.find(item => item.orderShortId === null);
  assert.equal(adjustment.kind, "ADJUSTMENT", "manual debt adjustment is surfaced as an adjustment");
  assert.equal(adjustment.amountKzt, -500, "adjustment amount matches driver_debt_delta");
}

// --- createDriverTopupRequest / listDriverTopupRequests ---
{
  const executor = createExecutor();
  await assert.rejects(
    () => createDriverTopupRequest({ driverId: "driver-1", amountKzt: MIN_TOPUP_KZT - 1 }, executor),
    { code: "TOPUP_BELOW_MINIMUM" },
    "topup below minimum is rejected"
  );
  const created = await createDriverTopupRequest({ driverId: "driver-1", amountKzt: 2000 }, executor);
  assert.equal(created.status, "PENDING", "topup request starts pending -- no live payment gateway yet");
  assert.equal(created.amountKzt, 2000, "topup request records the requested amount");
  assert.equal(created.driverId, "driver-1", "topup request is scoped to the requesting driver");

  const list = await listDriverTopupRequests("driver-1", executor);
  assert.equal(list.length, 1, "the created topup request shows up in the driver's list");
  assert.equal(list[0].id, created.id, "listed request matches the created one");
}

console.log("Driver wallet checks ok");
