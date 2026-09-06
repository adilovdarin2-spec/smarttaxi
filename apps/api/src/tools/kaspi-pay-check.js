import assert from "node:assert/strict";
import crypto from "node:crypto";

// env.js reads process.env exactly once, at import time, into a frozen
// `env` object (not a live getter) — so every value this file needs has to
// be set BEFORE the first import of payment-provider.js (which imports
// env.js), not adjusted afterwards. KASPI_MERCHANT_ID/API_KEY/BASE_URL stay
// unset (so the "falls back to mock" behavior is exercised, matching a
// fresh checkout with no real credentials yet); KASPI_WEBHOOK_SECRET is set
// to a known value up front so signature verification can be tested
// against it directly.
const TEST_WEBHOOK_SECRET = "test-secret-for-kaspi-pay-check";
delete process.env.KASPI_MERCHANT_ID;
delete process.env.KASPI_API_KEY;
delete process.env.KASPI_API_BASE_URL;
process.env.KASPI_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

const {
  getPaymentProvider,
  providerNameForMethod,
  MockKaspiPayProvider,
  verifyKaspiWebhookSignature,
  mapKaspiStatus,
  refundKaspiPayment
} = await import("../modules/payments/payment-provider.js");

// --- unconfigured (default) state: must behave exactly like the old mock ---
{
  assert.equal(providerNameForMethod("CASH"), "MANUAL", "cash stays manual");
  assert.equal(providerNameForMethod("KASPI"), "MANUAL", "kaspi transfer stays manual (P2P, not the gateway)");
  assert.equal(providerNameForMethod("CARD"), "KASPI_PAY", "card routes to the kaspi pay provider slot");

  const provider = getPaymentProvider("KASPI_PAY");
  assert.ok(provider instanceof MockKaspiPayProvider, "no credentials configured -> falls back to the mock, not the real provider");

  const outcome = await provider.initiate({ payment: { id: "test-payment-1", amount: 1000 }, order: { id: "order-1" } });
  assert.equal(outcome.status, "PROCESSING", "mock still starts a payment as PROCESSING");
  assert.match(outcome.providerReference, /^MOCK-KZP-/, "mock still uses its own fake reference format");
}

// --- webhook signature verification ---
{
  const rawBody = JSON.stringify({ paymentId: "abc123", status: "PAID" });
  const validSignature = crypto.createHmac("sha256", TEST_WEBHOOK_SECRET).update(rawBody).digest("hex");

  assert.equal(verifyKaspiWebhookSignature(rawBody, validSignature), true, "correct HMAC-SHA256 signature verifies");
  assert.equal(verifyKaspiWebhookSignature(rawBody, "0".repeat(64)), false, "wrong signature is rejected");
  assert.equal(verifyKaspiWebhookSignature(rawBody, "tooshort"), false, "mismatched-length signature is rejected without throwing");
  assert.equal(verifyKaspiWebhookSignature(rawBody, null), false, "missing signature header is rejected");
}

// --- status mapping ---
{
  assert.equal(mapKaspiStatus("SUCCESS"), "PAID");
  assert.equal(mapKaspiStatus("PAID"), "PAID");
  assert.equal(mapKaspiStatus("CANCELLED_BY_CLIENT"), "FAILED");
  assert.equal(mapKaspiStatus("PROCESS_FAIL"), "FAILED");
  assert.equal(mapKaspiStatus("RISK_REJECT"), "FAILED");
  assert.equal(mapKaspiStatus("SOME_UNKNOWN_STATUS"), "PROCESSING", "unrecognized status stays PROCESSING rather than guessing PAID/FAILED");
}

// --- refund guardrails without real credentials ---
{
  await assert.rejects(
    () => refundKaspiPayment({ payment: { provider_reference: "kzp-1", amount: 1000 } }),
    { code: "KASPI_PAY_NOT_CONFIGURED" },
    "refund refuses to run without real Kaspi Pay credentials configured"
  );
}

// --- structural checks: routes/env wiring exist ---
{
  const fs = await import("node:fs");
  const root = new URL("../", import.meta.url);
  const envSource = fs.readFileSync(new URL("config/env.js", root), "utf8");
  const providerSource = fs.readFileSync(new URL("modules/payments/payment-provider.js", root), "utf8");
  const routesSource = fs.readFileSync(new URL("modules/payments/payments.routes.js", root), "utf8");
  const serverSource = fs.readFileSync(new URL("server.js", root), "utf8");

  ["KASPI_MERCHANT_ID", "KASPI_API_KEY", "KASPI_API_BASE_URL", "KASPI_WEBHOOK_SECRET"]
    .forEach(key => assert.ok(envSource.includes(key), `env.js must expose ${key}`));

  assert.ok(providerSource.includes("class KaspiPayProvider"), "real provider class exists");
  assert.ok(providerSource.includes("export async function refundKaspiPayment"), "refund export exists");
  assert.ok(providerSource.includes("export function verifyKaspiWebhookSignature"), "signature verification export exists");

  assert.ok(routesSource.includes("kaspiWebhookRouter"), "webhook router is exported");
  assert.ok(routesSource.includes('post("/webhook"'), "webhook route is registered");

  assert.ok(serverSource.includes("req.rawBody = buf"), "raw body capture is wired for signature verification");
  assert.ok(serverSource.includes('"/api/payments/kaspi"'), "webhook router is mounted at the fixed public path");
}

console.log("Kaspi Pay readiness checks ok");
