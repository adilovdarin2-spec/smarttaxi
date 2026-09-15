import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

// Plays out the actual scheme against a running API: a rider orders, the
// driver accepts, drives up, marks himself arrived at the pickup point — and
// then cancels without a word. The trip is worth a commission that is now
// never charged, and this checks that the cancellation reaches the owner's
// review queue with the facts that make it recognisable, and that the queue
// still moves no money on its own.
//
// Local development only; registers a throwaway rider through the dev SMS
// provider and refuses to run against anything else.
const BASE = process.env.SMOKE_API_BASE_URL || "http://127.0.0.1:4011";
const DEV_CODE = process.env.SMS_DEV_CODE || "111111";
const OWNER_PHONE = "+77000000099";
const OWNER_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || "ChangeMe_2026!";
const DRIVER_PHONE = process.env.DEFAULT_DRIVER_PHONE || "+77000000000";
const DRIVER_PASSWORD = process.env.DEFAULT_DRIVER_PASSWORD || "123456";

const log = (...args) => console.log("[cancel-review-smoke]", ...args);

function qaPhone() {
  return `+77${Array.from({ length: 9 }, () => randomBytes(1)[0] % 10).join("")}`;
}

async function api(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  return { status: response.status, payload };
}

async function expectOk(path, options, what) {
  const result = await api(path, options);
  assert.ok(
    result.status >= 200 && result.status < 300,
    `${what} failed: ${result.status} ${JSON.stringify(result.payload)}`
  );
  return result.payload;
}

async function registerRider() {
  const phone = qaPhone();
  const sent = await expectOk("/api/auth/sms/send", { method: "POST", body: { phone, purpose: "REGISTER" } }, "sms send");
  const code = sent.devCode || DEV_CODE;
  const verified = await expectOk(
    "/api/auth/sms/verify",
    { method: "POST", body: { phone, code, purpose: "REGISTER" } },
    "sms verify"
  );
  const registered = await expectOk("/api/auth/register/password", {
    method: "POST",
    body: { phone, name: "QA Пассажир отмены", password: "Qa123456!", verificationToken: verified.verificationToken }
  }, "register rider");
  return { phone, token: registered.token };
}

async function main() {
  const health = await expectOk("/api/health", {}, "health");
  assert.equal(health.env, "development", "this smoke is a local development tool only");
  assert.equal(health.checks.sms, "dev", "refusing to create accounts against a real SMS provider");

  const driverLogin = await expectOk("/api/auth/login/password", {
    method: "POST",
    body: { phone: DRIVER_PHONE, password: DRIVER_PASSWORD }
  }, "driver login");
  const driverToken = driverLogin.token;
  const profile = await expectOk("/api/driver/profile", { token: driverToken }, "driver profile");
  const regionId = profile.driver.currentRegionId || profile.driver.current_region_id;
  assert.ok(regionId, "the seeded driver must have a region");

  // Clear whatever an earlier run left on this driver.
  if (profile.activeOrder?.id) {
    await api(`/api/orders/${profile.activeOrder.id}/cancel`, { method: "POST", token: driverToken, body: {} });
    log("cleared a leftover active order");
  }
  await expectOk("/api/driver/status/online", { method: "POST", token: driverToken }, "driver online");

  const regions = await expectOk("/api/regions/active", {}, "regions");
  const region = regions.regions.find((row) => row.id === regionId) || regions.regions[0];

  const rider = await registerRider();
  // Real catalogue addresses, not synthetic offsets: a point in a field has
  // no road access and the routing provider rightly refuses to price it.
  const geocode = await expectOk(
    `/api/maps/geocode?q=${encodeURIComponent("улица")}&region=${encodeURIComponent(region.name)}&limit=10`,
    { token: rider.token },
    "geocode"
  );
  const candidates = (geocode.addresses || []).filter((row) => Number.isFinite(Number(row.lat)));
  assert.ok(candidates.length >= 2, `need two catalogue addresses in ${region.name}, got ${candidates.length}`);
  const pickup = { lat: Number(candidates[0].lat), lng: Number(candidates[0].lng) };
  const dropoff = { lat: Number(candidates[candidates.length - 1].lat), lng: Number(candidates[candidates.length - 1].lng) };
  const estimate = await expectOk("/api/tariffs/estimate", {
    method: "POST",
    token: rider.token,
    body: { pickupLat: pickup.lat, pickupLng: pickup.lng, dropoffLat: dropoff.lat, dropoffLng: dropoff.lng, tariff: "Economy" }
  }, "estimate");
  const distanceKm = Number(estimate.distanceKm || estimate.estimate?.pricing?.distanceKm || 2);
  const durationMin = Number(estimate.durationMin || estimate.estimate?.pricing?.durationMin || 6);

  const orderResponse = await expectOk("/api/orders", {
    method: "POST",
    token: rider.token,
    body: {
      riderName: "QA Пассажир отмены",
      riderPhone: rider.phone,
      pickupText: "Точка подачи QA",
      dropoffText: "Точка назначения QA",
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      tariff: "Economy",
      paymentMethod: "CASH",
      distanceKm,
      durationMin,
      notes: "cancellation review smoke"
    }
  }, "create order");
  const orderId = orderResponse.order.id;
  log("order created", orderResponse.order.short_id || orderId);

  await expectOk(`/api/orders/${orderId}/accept`, { method: "POST", token: driverToken }, "driver accept");

  // The car is standing at the pickup point — this is the fact that makes a
  // silent cancellation afterwards look like what it is.
  await expectOk("/api/drivers/me/location", {
    method: "PATCH",
    token: driverToken,
    body: { lat: pickup.lat, lng: pickup.lng, source: "qa-smoke" }
  }, "publish driver location");
  await expectOk(`/api/orders/${orderId}/arrived`, { method: "POST", token: driverToken }, "driver arrived");
  log("driver accepted and arrived at the pickup point");

  const beforeCancel = await expectOk("/api/admin/cancellation-reviews?limit=1", {
    token: (await expectOk("/api/auth/login/password", {
      method: "POST",
      body: { phone: OWNER_PHONE, password: OWNER_PASSWORD }
    }, "owner login")).token
  }, "review queue before");
  const pendingBefore = beforeCancel.summary.pending;

  // The cancellation itself: no reason given.
  const cancelled = await expectOk(`/api/orders/${orderId}/cancel`, {
    method: "POST",
    token: driverToken,
    body: {}
  }, "driver cancel");
  assert.equal(cancelled.order.public_status, "SEARCHING_DRIVER", "a driver cancellation still reopens the trip for dispatch");
  log("driver cancelled with no reason");

  const ownerToken = (await expectOk("/api/auth/login/password", {
    method: "POST",
    body: { phone: OWNER_PHONE, password: OWNER_PASSWORD }
  }, "owner login again")).token;

  const queue = await expectOk("/api/admin/cancellation-reviews?reviewStatus=PENDING&limit=20", { token: ownerToken }, "review queue");
  assert.ok(queue.summary.pending > pendingBefore, "the cancellation must reach the owner's queue");
  const audit = queue.audits.find((row) => row.orderId === orderId);
  assert.ok(audit, "this cancellation must be in the queue");
  assert.equal(audit.cancelledBy, "DRIVER");
  assert.equal(audit.reasonCode, null, "no reason was given and none may be invented");

  const codes = audit.signals.map((signal) => signal.code);
  assert.ok(codes.includes("CANCELLED_AFTER_ARRIVAL"), `expected an after-arrival signal, got ${codes.join(", ")}`);
  assert.ok(codes.includes("NO_REASON_GIVEN"), "a silent cancellation must be recorded as such");
  assert.ok(codes.includes("CAR_AT_PICKUP"), "the car's real distance to the pickup point must be a signal");
  assert.ok(audit.riskScore >= 25, `expected a reviewable score, got ${audit.riskScore}`);
  assert.ok(audit.driverDistanceToPickupM != null && audit.driverDistanceToPickupM < 120);
  log("audit filed:", audit.riskScore, codes.join(", "));

  // Nothing was charged. This is the guarantee the owner asked for.
  const driverBefore = profile.driver;
  const driverAfter = (await expectOk("/api/driver/profile", { token: driverToken }, "driver profile after")).driver;
  assert.equal(
    Number(driverAfter.balance ?? 0),
    Number(driverBefore.balance ?? 0),
    "a flagged cancellation must not move the driver's balance"
  );
  assert.equal(
    Number(driverAfter.debt ?? 0),
    Number(driverBefore.debt ?? 0),
    "a flagged cancellation must not create driver debt"
  );
  log("driver balance and debt unchanged");

  // The owner's verdict.
  const decided = await expectOk(`/api/admin/cancellation-reviews/${audit.id}/review`, {
    method: "POST",
    token: ownerToken,
    body: { reviewStatus: "CONFIRMED_FRAUD", reviewNote: "QA: проверка разбора" }
  }, "owner decision");
  assert.equal(decided.audit.reviewStatus, "CONFIRMED_FRAUD");
  assert.ok(decided.audit.reviewedAt, "a decision must be stamped");

  const afterDecision = await expectOk("/api/admin/cancellation-reviews?reviewStatus=PENDING&limit=20", { token: ownerToken }, "queue after decision");
  assert.ok(
    !afterDecision.audits.some((row) => row.id === audit.id),
    "a decided case must leave the pending queue"
  );
  log("owner decision recorded and the case left the queue");

  // --- clean up -------------------------------------------------------
  await expectOk(`/api/orders/${orderId}/cancel-public`, {
    method: "POST",
    token: rider.token,
    body: { riderPhone: rider.phone, reasonCode: "CHANGED_MIND" }
  }, "rider cleanup cancel");
  await expectOk("/api/driver/status/offline", { method: "POST", token: driverToken, body: {} }, "driver offline");

  console.log("Cancellation review smoke ok: queue entry, signals, no money moved, owner verdict, cleanup");
}

main().catch((error) => {
  console.error("[cancel-review-smoke] FAILED", error);
  process.exit(1);
});
