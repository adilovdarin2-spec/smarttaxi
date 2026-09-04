const API_URL = (process.env.API_URL || "http://127.0.0.1:4000").replace(/\/$/, "");

function bearer(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = "GET", token, body } = {}) {
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
// KZ mobile contract is +77 followed by nine digits.  The previous
// eight-digit suffix made this smoke-only generated number one digit too
// long, so it exercised validation failure instead of the registration flow.
const suffix = String(Date.now()).slice(-7);
  const phone = `+7701${suffix}`;
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
      name: "Stage 2 Smoke Client",
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

  const regions = await request("/api/regions");
  const atakent = regions.regions.find(region => region.code === "ATAKENT") || regions.regions[0];
  if (!atakent) throw new Error("No active regions returned by /api/regions");
  mark("regions", { count: regions.regions.length, region: atakent.code });

  const address = await request(`/api/maps/geocode?q=${encodeURIComponent("Атакент базар")}&region=${encodeURIComponent(atakent.name || "Atakent")}`);
  mark("geocode", { count: address.addresses?.length || 0 });

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

  const client = await registerSmokeClient();
  mark("client_register", { phone: client.phone });

  const orderResponse = await request("/api/orders", {
    method: "POST",
    token: client.token,
    body: {
      riderName: "Stage 2 Smoke Client",
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
      notes: "stage2 smoke"
    }
  });
  const orderId = orderResponse.order.id;
  mark("order_created", { orderId, status: orderResponse.order.status, publicStatus: orderResponse.order.public_status });

  const driver = await login("+77000000000", "123456");
  const cancelledOrderId = await cancelExistingDriverOrder(driver.token);
  if (cancelledOrderId) mark("driver_cleanup", { cancelledOrderId });
  await request("/api/drivers/me/status", { method: "PATCH", token: driver.token, body: { status: "FREE" } });
  mark("driver_online");

  const accepted = await request(`/api/orders/${orderId}/accept`, { method: "POST", token: driver.token });
  mark("driver_accept", { status: accepted.order.status, publicStatus: accepted.order.public_status });

  const lifecycle = [
    ["going_to_client", "going-to-client"],
    ["arrived", "arrived"],
    ["waiting", "waiting"],
    ["trip_started", "start"],
    ["trip_completed", "complete"]
  ];
  for (const [name, action] of lifecycle) {
    const updated = await request(`/api/orders/${orderId}/${action}`, { method: "POST", token: driver.token });
    mark(name, { status: updated.order.status, publicStatus: updated.order.public_status });
  }

  // The seeded finance operator is the account that is authorised to confirm
  // a cash payment. Keep this aligned with seeds/seed.js; the old ...098
  // number never existed and made the final lifecycle step fail at login.
  const operator = await login("+77000000097", "123456");
  const paid = await request(`/api/orders/${orderId}/mark-paid`, { method: "POST", token: operator.token });
  mark("mark_paid", { status: paid.order.status, publicStatus: paid.order.public_status });

  const history = await request(`/api/orders/${orderId}/status-history`, { token: client.token });
  mark("status_history", { count: history.history.length });

  console.table(steps);
  console.log(`Stage 2 smoke ok: ${API_URL}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
