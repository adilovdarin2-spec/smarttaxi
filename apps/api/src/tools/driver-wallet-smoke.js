// Live smoke test for the driver wallet/payout flow. Requires a running API
// (npm run dev) against a seeded database (npm run seed) — unlike
// driver-wallet-check.js this hits real HTTP endpoints and a real DB, so it
// is not part of `npm test`. Run with: npm run smoke:driver-wallet
import assert from "node:assert/strict";

const API_URL = (process.env.API_URL || "http://127.0.0.1:4000").replace(/\/$/, "");
const MIN_PAYOUT_KZT = 3000;

function bearer(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = "GET", token, body, expectStatus } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...bearer(token) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (expectStatus && response.status === expectStatus) return data;
  if (!response.ok) {
    const detail = data?.error || data?.code || data?.message || text;
    throw new Error(`${method} ${path} failed (${response.status}): ${JSON.stringify(detail)}`);
  }
  return data;
}

async function login(phone, password) {
  return request("/api/auth/login/password", { method: "POST", body: { phone, password } });
}

const driverLogin = await login("+77000000000", "123456");
const driverToken = driverLogin.token;
const financeLogin = await login("+77000000097", "123456");
const financeToken = financeLogin.token;

const summary = await request("/api/drivers/me/wallet", { token: driverToken });
assert.ok(typeof summary.balanceKzt === "number", "wallet summary returns balanceKzt");
assert.ok(typeof summary.debtKzt === "number", "wallet summary returns debtKzt");
assert.equal(summary.minPayoutKzt, MIN_PAYOUT_KZT, "wallet summary echoes the minimum payout threshold");

const transactions = await request("/api/drivers/me/wallet/transactions?limit=10", { token: driverToken });
assert.ok(Array.isArray(transactions.items), "transactions endpoint returns an items array");

const existingPayouts = await request("/api/drivers/me/wallet/payout-requests", { token: driverToken });
assert.ok(Array.isArray(existingPayouts.payoutRequests), "payout-requests endpoint returns an array");

await assert.rejects(
  () => request("/api/drivers/me/wallet/payout-requests", { method: "POST", token: driverToken, body: { amountKzt: MIN_PAYOUT_KZT - 1 } }),
  /400/,
  "requesting below the minimum payout is rejected"
);

if (summary.balanceKzt < MIN_PAYOUT_KZT) {
  console.log(`[skip] driver balance (${summary.balanceKzt} KZT) is below the ${MIN_PAYOUT_KZT} KZT minimum — skipping the payout create/approve/reject flow. Complete a KASPI trip as this driver first to exercise it fully.`);
  console.log("Driver wallet smoke ok (guardrails only)");
  process.exit(0);
}

// Approve + pay flow
const created = await request("/api/drivers/me/wallet/payout-requests", {
  method: "POST",
  token: driverToken,
  body: { amountKzt: MIN_PAYOUT_KZT, method: "KASPI_TRANSFER", details: { phone: "+77001234567" } }
});
assert.equal(created.payoutRequest.status, "PENDING", "created payout request starts pending");
assert.equal(created.driver.balanceKzt ?? created.driver.balance, summary.balanceKzt - MIN_PAYOUT_KZT, "balance is held on request");

const approved = await request(`/api/admin/payout-requests/${created.payoutRequest.id}`, {
  method: "PATCH",
  token: financeToken,
  body: { status: "APPROVED" }
});
assert.equal(approved.payoutRequest.status, "APPROVED", "finance can approve a pending payout");

const paid = await request(`/api/admin/payout-requests/${created.payoutRequest.id}`, {
  method: "PATCH",
  token: financeToken,
  body: { status: "PAID", providerReference: "SMOKE-TEST-TX" }
});
assert.equal(paid.payoutRequest.status, "PAID", "finance can mark an approved payout as paid");

const afterPaid = await request("/api/drivers/me/wallet/payout-requests?status=PAID", { token: driverToken });
assert.ok(afterPaid.payoutRequests.some(p => p.id === created.payoutRequest.id), "driver sees the paid payout request in their own history");

// Reject flow (only if enough balance remains)
const summaryAfterFirst = await request("/api/drivers/me/wallet", { token: driverToken });
if (summaryAfterFirst.balanceKzt >= MIN_PAYOUT_KZT) {
  const secondRequest = await request("/api/drivers/me/wallet/payout-requests", {
    method: "POST",
    token: driverToken,
    body: { amountKzt: MIN_PAYOUT_KZT, method: "KASPI_TRANSFER" }
  });
  const rejected = await request(`/api/admin/payout-requests/${secondRequest.payoutRequest.id}`, {
    method: "PATCH",
    token: financeToken,
    body: { status: "REJECTED", reason: "Смоук-тест" }
  });
  assert.equal(rejected.payoutRequest.status, "REJECTED", "finance can reject a pending payout");
  const summaryAfterReject = await request("/api/drivers/me/wallet", { token: driverToken });
  assert.equal(summaryAfterReject.balanceKzt, summaryAfterFirst.balanceKzt, "rejecting a payout refunds the held balance");
} else {
  console.log("[skip] insufficient remaining balance to exercise the reject/refund flow");
}

console.log("Driver wallet smoke ok");
