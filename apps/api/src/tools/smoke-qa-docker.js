import assert from "node:assert/strict";

const qaApiUrl = "http://127.0.0.1:4001";
const supplied = process.env.API_URL?.replace(/\/$/, "");

assert(
  !supplied || supplied === qaApiUrl,
  `smoke:qa-docker is fixed to ${qaApiUrl}; remove the conflicting API_URL`,
);

process.env.API_URL = qaApiUrl;

const preflightResponse = await fetch(`${qaApiUrl}/api/health/ready`, {
  signal: AbortSignal.timeout(10_000),
});
const readiness = await preflightResponse.json().catch(() => ({}));
assert.equal(preflightResponse.ok, true, "QA Docker API is not ready");
assert.equal(readiness.env, "development", "QA smoke requires NODE_ENV=development");
assert.equal(readiness.checks?.sms, "dev", "QA smoke requires the local dev SMS provider");

await import("./smoke-full.js");
