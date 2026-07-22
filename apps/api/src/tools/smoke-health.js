import assert from "node:assert/strict";

const API_URL = (process.env.API_URL || "http://127.0.0.1:4000").replace(/\/$/, "");

async function request(path) {
  const response = await fetch(`${API_URL}${path}`);
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.ok, true, `${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

const health = await request("/api/health");
assert.equal(health.ok, true, "health must be ok");
assert.equal(health.app, "SmartTaxi", "health must identify SmartTaxi");

const ready = await request("/api/health/ready");
assert.equal(ready.ok, true, "ready must be ok");
assert.equal(ready.checks?.db, "ok", "database must be ready");
assert.equal(ready.checks?.redis, "PONG", "redis must be ready");

console.log("Smoke health ok", {
  api: API_URL,
  db: ready.checks.db,
  redis: ready.checks.redis,
  osrm: ready.checks.osrm,
  maptiler: ready.checks.maptiler
});
