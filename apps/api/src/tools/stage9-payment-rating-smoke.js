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
  const phone = `+7709${suffix}`;
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
      name: "Stage 9 Rating Client",
      password: "123456"
    }
  });
  return { phone, token: registered.token, user: registered.user };
}

async function cancelExistingDriverOrder(driverToken) {
  const active = await request("/api/drivers/me/active-order", { token: driverToken });
  if (!active.activeOrder?.id) return null;
  await request(`/api/orders/${active.activeOrder.id}/cancel`, { method: "POST", token: driverToken });
  return active.activeOrder.id;
}

async function main() {
  const steps = [];
  const mark = (name, extra = {}) => steps.push({ step: name, ...extra });

  const health = await request("/api/health/ready");
  mark("health", { status: health.status });

  const client = await registerSmokeClient();
  mark("client_register", { phone: client.phone });

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
  mark("estimate", { priceKzt: estimate.priceKzt, distanceKm: estimate.distanceKm });

  const orderResponse = await request("/api/orders", {
    method: "POST",
    token: client.token,
    body: {
      riderName: "Stage 9 Rating Client",
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
      notes: "stage9 rating smoke"
    }
  });
  const orderId = orderResponse.order.id;
  mark("order_created", { orderId, publicStatus: orderResponse.order.public_status });

  const earlyRate = await request(`/api/orders/${orderId}/rate`, {
    method: "POST",
    token: client.token,
    body: { rating: 5, tags: ["polite_driver"] },
    expectStatus: 409
  });
  if ((earlyRate.error || earlyRate.code) !== "ORDER_NOT_PAID") {
    throw new Error("Rating before PAID must fail with ORDER_NOT_PAID");
  }
  mark("early_rate_rejected", { error: earlyRate.error || earlyRate.code });

  const driver = await login("+77000000000", "123456");
  const cancelledOrderId = await cancelExistingDriverOrder(driver.token);
  if (cancelledOrderId) mark("driver_cleanup", { cancelledOrderId });
  await request("/api/drivers/me/status", { method: "PATCH", token: driver.token, body: { status: "FREE" } });
  const accepted = await request(`/api/orders/${orderId}/accept`, { method: "POST", token: driver.token });
  mark("driver_accept", { publicStatus: accepted.order.public_status });

  for (const [name, action] of [
    ["going_to_client", "going-to-client"],
    ["arrived", "arrived"],
    ["waiting", "waiting"],
    ["trip_started", "start"],
    ["trip_completed", "complete"]
  ]) {
    const updated = await request(`/api/orders/${orderId}/${action}`, { method: "POST", token: driver.token });
    mark(name, { publicStatus: updated.order.public_status });
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
      tags: ["polite_driver", "clean_car"],
      comment: "Stage 9 smoke rating"
    }
  });
  if (rated.order.public_status !== "RATED") throw new Error("Rating did not transition order to RATED");
  mark("rate_order", { publicStatus: rated.order.public_status, driverRating: rated.order.driver_rating });

  const duplicate = await request(`/api/orders/${orderId}/rate`, {
    method: "POST",
    token: client.token,
    body: { rating: 4 },
    expectStatus: 409
  });
  if ((duplicate.error || duplicate.code) !== "ORDER_ALREADY_RATED") {
    throw new Error("Duplicate rating must be rejected");
  }
  mark("duplicate_rate_rejected", { error: duplicate.error || duplicate.code });

  const history = await request(`/api/orders/${orderId}/status-history`, { token: client.token });
  const statuses = history.history.map(item => item.status);
  if (history.order.public_status !== "RATED" || !statuses.includes("RATED")) {
    throw new Error("Status history must include RATED");
  }
  mark("status_history", { count: statuses.length, publicStatus: history.order.public_status });

  console.table(steps);
  console.log(`Stage 9 payment/rating smoke ok: ${API_URL}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
