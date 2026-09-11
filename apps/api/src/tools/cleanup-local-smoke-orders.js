import assert from "node:assert/strict";
import { env } from "../config/env.js";

// Local QA hygiene only. This tool never deletes rows or touches an arbitrary
// rider: it finds the exact disposable identities/notes created by the stage 2
// and stage 3 smoke scripts, then asks the normal authenticated owner endpoint
// to perform the terminal cancellation and audit/history writes. One local
// owner session also works for old fixtures whose disposable password changed.
const API_URL = (process.env.API_URL || "http://127.0.0.1:4001").replace(/\/$/, "");
const apiHost = new URL(API_URL).hostname;
const loopback = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

assert(loopback.has(apiHost), "Smoke cleanup requires a loopback API");
assert.equal(env.NODE_ENV, "development", "Smoke cleanup requires development mode");

async function request(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const detail = data?.error?.code || data?.error || data?.code || data?.message || text;
    throw new Error(`${method} ${path} failed (${response.status}): ${detail}`);
  }
  return data;
}

async function main() {
  const health = await request("/api/health/ready");
  assert.equal(health.env, "development", "Connected API is not development");
  assert.equal(health.checks?.db, "ok", "Connected API database is not ready");

  const owner = await request("/api/auth/login/password", {
    method: "POST",
    body: {
      phone: process.env.QA_OWNER_PHONE || "+77000000099",
      password: process.env.QA_OWNER_PASSWORD || env.DEFAULT_ADMIN_PASSWORD
    }
  });
  assert.equal(owner.user?.role, "OWNER", "Cleanup account must be the local owner");

  async function listCandidates() {
    const open = [];
    for (const status of ["NEW", "SEARCHING_DRIVER"]) {
      const page = await request(`/api/orders?status=${status}&limit=200&offset=0`, {
        token: owner.token
      });
      assert(page.total <= 200, `Refuse partial ${status} cleanup; narrow the QA database first`);
      open.push(...page.orders);
    }
    return open.filter(order =>
      (order.rider_name === "Stage 2 Smoke Client" && order.notes === "stage2 smoke") ||
      (order.rider_name === "Stage 3 Client Flow" && order.notes === "stage3 client flow smoke")
    );
  }

  const candidates = await listCandidates();

  const cancelled = [];
  for (const candidate of candidates) {
    const result = await request(`/api/orders/${candidate.id}/cancel`, {
      method: "POST",
      token: owner.token,
      body: {}
    });
    assert.equal(result.order?.public_status, "CANCELLED_BY_OPERATOR");
    cancelled.push({ id: candidate.id, phone: candidate.rider_phone });
  }

  const remaining = (await listCandidates()).length;
  assert.equal(remaining, 0, "Smoke orders still remain in dispatch");
  console.log(JSON.stringify({ cancelled: cancelled.length, remaining, orders: cancelled }, null, 2));
}

await main();
