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

async function registerClient() {
  const suffix = String(Date.now()).slice(-8);
  const phone = `+7703${suffix}`;
  const check = await request("/api/auth/phone/check", { method: "POST", body: { phone } });
  if (check.exists) throw new Error("Stage 3 smoke phone unexpectedly exists");
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
      name: "Stage 3 Client Flow",
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
  const mark = (step, extra = {}) => steps.push({ step, ...extra });

  const health = await request("/api/health/ready");
  mark("health", { status: health.status });

  const regionResponse = await request("/api/regions/active");
  const atakent = regionResponse.regions.find(region => region.code === "ATAKENT") || regionResponse.regions[0];
  if (!atakent?.id) throw new Error("No active region available for client flow smoke");
  mark("region", { code: atakent.code, name: atakent.name });

  const geocode = await request(`/api/maps/geocode?q=${encodeURIComponent("Атакент базар")}&region=${encodeURIComponent(atakent.name)}&limit=5`);
  if (!geocode.addresses?.length) throw new Error("Geocode did not return local/provider addresses");
  const destination = geocode.addresses[0];
  mark("geocode", { count: geocode.addresses.length, first: destination.title || destination.label });

  const reverse = await request(`/api/maps/reverse-geocode?lat=${destination.lat}&lng=${destination.lng}`);
  if (!reverse.address?.lat || !reverse.address?.lng) throw new Error("Reverse geocode did not return a point");
  mark("reverse_geocode", { title: reverse.address.title || reverse.address.label });

  const pickup = { lat: 40.844435, lng: 68.509021, text: "Атакент центр" };
  const estimate = await request("/api/tariffs/estimate", {
    method: "POST",
    body: {
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffLat: destination.lat,
      dropoffLng: destination.lng,
      tariff: "Economy"
    }
  });
  const priceKzt = Number(estimate.priceKzt || estimate.estimate?.estimatedPrice || 0);
  const distanceKm = Number(estimate.distanceKm || estimate.estimate?.pricing?.distanceKm || (estimate.route?.distanceMeters ? estimate.route.distanceMeters / 1000 : 0));
  const durationMin = Number(estimate.durationMin || estimate.estimate?.pricing?.durationMin || (estimate.route?.durationSeconds ? Math.ceil(estimate.route.durationSeconds / 60) : 0));
  if (!priceKzt || !distanceKm || !durationMin) {
    throw new Error("Tariff estimate is missing price/distance/duration");
  }
  mark("estimate", { priceKzt, distanceKm, durationMin });

  const client = await registerClient();
  mark("client_register", { phone: client.phone });

  const orderResponse = await request("/api/orders", {
    method: "POST",
    token: client.token,
    body: {
      riderName: "Stage 3 Client Flow",
      riderPhone: client.phone,
      pickupText: pickup.text,
      dropoffText: destination.title || destination.label || "Атакент адрес",
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffLat: destination.lat,
      dropoffLng: destination.lng,
      tariff: "Economy",
      paymentMethod: "CASH",
      distanceKm,
      durationMin,
      notes: "stage3 client flow smoke"
    }
  });
  const orderId = orderResponse.order.id;
  if (orderResponse.order.public_status !== "SEARCHING_DRIVER") throw new Error("New client order must start as SEARCHING_DRIVER");
  mark("order_created", { orderId, publicStatus: orderResponse.order.public_status });

  const driver = await login("+77000000000", "123456");
  const cancelled = await cancelExistingDriverOrder(driver.token);
  if (cancelled) mark("driver_cleanup", { orderId: cancelled });
  await request("/api/drivers/me/status", { method: "PATCH", token: driver.token, body: { status: "FREE" } });
  const accepted = await request(`/api/orders/${orderId}/accept`, { method: "POST", token: driver.token });
  if (accepted.order.public_status !== "DRIVER_FOUND" || !accepted.order.driver_name) {
    throw new Error("Driver assignment must return Driver Found data");
  }
  mark("driver_found", { driver: accepted.order.driver_name, vehicle: accepted.order.driver_car_model });

  const history = await request(`/api/orders/${orderId}/status-history`, { token: client.token });
  if (!history.history?.length || history.order.public_status !== "DRIVER_FOUND" || !history.order.driver_name) {
    throw new Error("Client status-history fallback must expose Driver Found order data");
  }
  mark("client_status_history", { count: history.history.length, publicStatus: history.order.public_status });

  await request(`/api/orders/${orderId}/cancel`, { method: "POST", token: driver.token });
  mark("cleanup_cancel");

  console.table(steps);
  console.log(`Stage 3 client flow smoke ok: ${API_URL}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
