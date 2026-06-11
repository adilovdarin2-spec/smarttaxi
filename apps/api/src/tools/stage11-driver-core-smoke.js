const API_URL = (process.env.API_URL || "http://127.0.0.1:4000").replace(/\/$/, "");

function bearer(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = "GET", token, body, expectStatus } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...bearer(token)
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (expectStatus && response.status === expectStatus) return data;
  if (!response.ok) {
    const detail = data?.error?.code || data?.code || data?.message || text;
    throw new Error(`${method} ${path} failed (${response.status}): ${detail}`);
  }
  return data;
}

async function login(phone, password) {
  return request("/api/auth/login/password", {
    method: "POST",
    body: { phone, password }
  });
}

async function registerSmokeClient() {
  const suffix = String(Date.now()).slice(-8);
  const phone = `+7708${suffix}`;
  await request("/api/auth/phone/check", { method: "POST", body: { phone } });
  const sent = await request("/api/auth/sms/send", { method: "POST", body: { phone, purpose: "REGISTER" } });
  const verified = await request("/api/auth/sms/verify", {
    method: "POST",
    body: { phone, purpose: "REGISTER", code: sent.devCode || "111111" }
  });
  const registered = await request("/api/auth/register/password", {
    method: "POST",
    body: {
      phone,
      verificationToken: verified.verificationToken,
      name: "Stage 11 Driver Flow Client",
      password: "123456"
    }
  });
  return { phone, token: registered.token, user: registered.user };
}

async function cleanupActiveDriverOrder(driverToken, steps) {
  const active = await request("/api/driver/orders/active", { token: driverToken });
  if (!active.activeOrder?.id) return;
  await request(`/api/driver/orders/${active.activeOrder.id}/cancel`, { method: "POST", token: driverToken });
  steps.push({ step: "driver_cleanup", orderId: active.activeOrder.id });
}

async function createClientOrder(client, notes = "stage11") {
  const pickup = { lat: 40.844435, lng: 68.509021, text: "Атакент центр" };
  const dropoff = { lat: 40.84621, lng: 68.50486, text: "Атакент автовокзал" };
  const estimate = await request("/api/tariffs/estimate", {
    method: "POST",
    body: {
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      tariff: "Economy"
    }
  });
  if (!estimate.priceKzt) throw new Error("Estimate did not return priceKzt");
  const order = await request("/api/orders", {
    method: "POST",
    token: client.token,
    body: {
      riderName: "Stage 11 Driver Flow Client",
      riderPhone: client.phone,
      pickupText: pickup.text,
      dropoffText: dropoff.text,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      tariff: "Economy",
      paymentMethod: "CASH",
      distanceKm: estimate.distanceKm,
      durationMin: estimate.durationMin,
      notes
    }
  });
  return { order: order.order, estimate };
}

async function main() {
  const steps = [];
  const mark = (step, extra = {}) => steps.push({ step, ...extra });

  const health = await request("/api/health/ready");
  mark("health", { status: health.status });

  const driverLogin = await login("+77000000000", "123456");
  const driverToken = driverLogin.token;
  mark("driver_login", { role: driverLogin.user?.role });
  await cleanupActiveDriverOrder(driverToken, steps);

  const offline = await request("/api/driver/status/offline", { method: "POST", token: driverToken });
  mark("driver_offline", { publicStatus: offline.driver.publicStatus });

  const offlineIncoming = await request("/api/driver/orders/incoming", { token: driverToken });
  if (offlineIncoming.orders.length !== 0) throw new Error("Offline driver must not see incoming orders");
  mark("offline_incoming_empty");

  const online = await request("/api/driver/status/online", { method: "POST", token: driverToken });
  if (online.driver.publicStatus !== "ONLINE") throw new Error("Driver did not go online");
  mark("driver_online", { publicStatus: online.driver.publicStatus });

  const client = await registerSmokeClient();
  mark("client_register", { phone: client.phone });

  const first = await createClientOrder(client, "stage11 reject path");
  mark("first_order_created", { orderId: first.order.id, publicStatus: first.order.public_status });

  const incoming = await request("/api/driver/orders/incoming", { token: driverToken });
  if (!incoming.orders.some(order => order.id === first.order.id)) {
    throw new Error("Driver incoming orders did not include new client order");
  }
  mark("incoming_visible", { count: incoming.orders.length });

  const rejected = await request(`/api/driver/orders/${first.order.id}/reject`, { method: "POST", token: driverToken });
  if (!rejected.rejected) throw new Error("Reject endpoint did not confirm rejection");
  mark("driver_reject", { orderId: first.order.id });

  await request(`/api/orders/${first.order.id}/cancel-public`, {
    method: "POST",
    token: client.token,
    body: { riderPhone: client.phone }
  });
  mark("first_order_cancelled");

  const second = await createClientOrder(client, "stage11 full lifecycle");
  const orderId = second.order.id;
  mark("second_order_created", { orderId, price: second.order.price });

  const secondIncoming = await request("/api/driver/orders/incoming", { token: driverToken });
  if (!secondIncoming.orders.some(order => order.id === orderId)) {
    throw new Error("Second order is not visible to online driver");
  }
  mark("second_incoming_visible");

  const accepted = await request(`/api/driver/orders/${orderId}/accept`, { method: "POST", token: driverToken });
  if (accepted.order.public_status !== "DRIVER_FOUND") throw new Error("Accept did not move order to DRIVER_FOUND");
  mark("driver_accept", { publicStatus: accepted.order.public_status });

  const offlineWithActive = await request("/api/driver/status/offline", {
    method: "POST",
    token: driverToken,
    expectStatus: 409
  });
  if ((offlineWithActive.error || offlineWithActive.code) !== "DRIVER_HAS_ACTIVE_ORDER") {
    throw new Error("Driver with active order must not go offline");
  }
  mark("offline_blocked_with_active", { error: offlineWithActive.error || offlineWithActive.code });

  const active = await request("/api/driver/orders/active", { token: driverToken });
  if (active.activeOrder?.id !== orderId) throw new Error("Active driver order mismatch");
  mark("active_order", { publicStatus: active.activeOrder.public_status });

  for (const [step, action, expected] of [
    ["going_to_client", "going-to-client", "DRIVER_GOING_TO_CLIENT"],
    ["arrived", "arrived", "DRIVER_ARRIVED"],
    ["waiting", "waiting", "WAITING_CLIENT"],
    ["trip_started", "start", "TRIP_STARTED"],
    ["trip_completed", "complete", "TRIP_COMPLETED"]
  ]) {
    const updated = await request(`/api/driver/orders/${orderId}/${action}`, { method: "POST", token: driverToken });
    if (updated.order.public_status !== expected) {
      throw new Error(`${step} expected ${expected}, got ${updated.order.public_status}`);
    }
    mark(step, { publicStatus: updated.order.public_status });
  }

  const operator = await login("+77000000098", "123456");
  const paid = await request(`/api/orders/${orderId}/mark-paid`, { method: "POST", token: operator.token });
  if (paid.order.public_status !== "PAID") throw new Error("Order did not reach PAID");
  mark("mark_paid", { publicStatus: paid.order.public_status });

  const rated = await request(`/api/orders/${orderId}/rate`, {
    method: "POST",
    token: client.token,
    body: {
      rating: 5,
      tags: ["polite_driver"],
      comment: "Stage 11 full lifecycle smoke"
    }
  });
  if (rated.order.public_status !== "RATED") throw new Error("Order did not reach RATED");
  mark("rate_order", { publicStatus: rated.order.public_status });

  const history = await request(`/api/orders/${orderId}/status-history`, { token: client.token });
  const statuses = history.history.map(item => item.status);
  for (const status of ["DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT", "DRIVER_ARRIVED", "WAITING_CLIENT", "TRIP_STARTED", "TRIP_COMPLETED", "PAID", "RATED"]) {
    if (!statuses.includes(status)) throw new Error(`Status history missing ${status}`);
  }
  mark("status_history", { count: statuses.length });

  const earnings = await request("/api/driver/earnings/today", { token: driverToken });
  const debt = await request("/api/driver/debt", { token: driverToken });
  if (earnings.completedOrders < 1) throw new Error("Driver earnings did not include completed order");
  mark("driver_earnings", { completedOrders: earnings.completedOrders, gross: earnings.todayGrossKzt, debt: debt.debtKzt });

  console.table(steps);
  console.log(`Stage 11 driver core smoke ok: ${API_URL}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
