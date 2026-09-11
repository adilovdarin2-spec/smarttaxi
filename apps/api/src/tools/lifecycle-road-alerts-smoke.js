import assert from "node:assert/strict";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:4000";

async function api(path, { method = "GET", token, body, query } = {}) {
  const url = new URL(path, API_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }
  const response = await fetch(url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = payload?.code || payload?.error || response.statusText;
    throw new Error(`${method} ${url.pathname} failed: ${response.status} ${code}`);
  }
  return payload;
}

async function login(body) {
  const payload = await api("/api/auth/login", { method: "POST", body });
  assert.ok(payload.token, "login must return token");
  assert.ok(payload.user?.role, "login must return user role");
  return payload;
}

function pointInside(region, latOffset = 0, lngOffset = 0) {
  const lat = Number(region.centerLat) + latOffset;
  const lng = Number(region.centerLng) + lngOffset;
  return { lat, lng };
}

async function settleExistingDriverOrder(driverToken) {
  const active = await api("/api/drivers/me/active-order", { token: driverToken });
  const order = active.activeOrder;
  if (!order?.id) return null;
  if (order.status === "DRIVER_ASSIGNED") {
    await api(`/api/orders/${order.id}/arrived`, { method: "POST", token: driverToken });
    await api(`/api/orders/${order.id}/start`, { method: "POST", token: driverToken });
    return api(`/api/orders/${order.id}/complete`, { method: "POST", token: driverToken });
  }
  if (order.status === "DRIVER_ARRIVED") {
    await api(`/api/orders/${order.id}/start`, { method: "POST", token: driverToken });
    return api(`/api/orders/${order.id}/complete`, { method: "POST", token: driverToken });
  }
  if (order.status === "IN_PROGRESS") {
    return api(`/api/orders/${order.id}/complete`, { method: "POST", token: driverToken });
  }
  return api(`/api/orders/${order.id}/cancel`, { method: "POST", token: driverToken });
}

async function main() {
  const health = await api("/api/health/ready");
  assert.equal(health.status, "ok", "backend health must be ok");
  assert.equal(health.checks?.db, "ok", "database must be ok");
  assert.equal(health.checks?.redis, "PONG", "redis must be ok");

  const client = await login({ phone: "+77000000001", password: "123456" });
  const driver = await login({ phone: "+77000000000", password: "123456" });
  const admin = await login({ email: "admin@smarttaxi.local", password: "ChangeMe_2026!" });
  assert.equal(client.user.role, "CLIENT");
  assert.equal(driver.user.role, "DRIVER");
  assert.ok(["OWNER", "FINANCE"].includes(admin.user.role), "admin/owner role must access operations");

  const regionsPayload = await api("/api/regions/active");
  const region = regionsPayload.regions.find(item => item.code === "ATAKENT") || regionsPayload.regions[0];
  assert.ok(region?.id, "active launch region must exist");
  const pickup = pointInside(region, 0, 0);
  const dropoff = pointInside(region, 0.01, 0.01);
  const driverStart = pointInside(region, -0.006, -0.006);

  const tariffsPayload = await api("/api/tariffs", { query: { regionId: region.id } });
  const tariff = tariffsPayload.tariffs
    .filter(item => item.isActive !== false)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))[0];
  assert.ok(tariff?.id, "active tariff must exist for launch region");

  const routePayload = await api("/api/routes/preview", {
    method: "POST",
    body: {
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      tariffId: tariff.id
    }
  });
  assert.ok(routePayload.route?.geometry?.coordinates?.length > 1, "route preview must return provider geometry");
  assert.ok(routePayload.route.distanceMeters > 0, "route preview must return real distance");
  assert.ok(routePayload.route.durationSeconds > 0, "route preview must return real duration");
  assert.ok(routePayload.route.estimate?.estimatedPrice > 0, "route preview must return backend estimate");

  const distanceKm = Math.max(0.1, Number(routePayload.route.distanceMeters) / 1000);
  const durationMin = Math.max(1, Math.round(Number(routePayload.route.durationSeconds) / 60));
  const estimatePayload = await api("/api/orders/estimate", {
    method: "POST",
    body: {
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      tariffId: tariff.id,
      tariff: tariff.name,
      distanceKm,
      durationMin
    }
  });
  assert.ok(estimatePayload.estimate?.estimatedPrice > 0, "order estimate must return backend price");

  await settleExistingDriverOrder(driver.token).catch(() => null);
  const driverRegions = await api("/api/drivers/me/regions", { token: driver.token });
  const approvedRegion = driverRegions.regions.find(item => item.regionId === region.id) || driverRegions.regions[0];
  assert.ok(approvedRegion?.regionId, "driver must have an approved region");
  await api("/api/drivers/me/region", { method: "PATCH", token: driver.token, body: { regionId: approvedRegion.regionId } });
  await api("/api/drivers/me/status", { method: "PATCH", token: driver.token, body: { status: "FREE" } });
  await api("/api/drivers/me/location", {
    method: "PATCH",
    token: driver.token,
    body: { lat: driverStart.lat, lng: driverStart.lng, heading: 90, speed: 18, accuracy: 8, source: "smoke" }
  });

  const orderPayload = await api("/api/orders", {
    method: "POST",
    token: client.token,
    body: {
      riderName: "QA Client",
      riderPhone: "+77000000001",
      pickupText: `${region.name} QA pickup`,
      dropoffText: `${region.name} QA destination`,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      tariffId: tariff.id,
      tariff: tariff.name,
      paymentMethod: "CASH",
      distanceKm,
      durationMin,
      notes: "V10 lifecycle smoke"
    }
  });
  const orderId = orderPayload.order?.id;
  assert.ok(orderId, "client order creation must return order id");
  assert.equal(orderPayload.order.status, "NEW", "new order must start as NEW");

  const availableOrders = await api("/api/orders", { token: driver.token, query: { status: "NEW", limit: 50 } });
  assert.ok(availableOrders.orders.some(order => order.id === orderId), "driver must see regional new order");

  const accepted = await api(`/api/orders/${orderId}/accept`, { method: "POST", token: driver.token });
  assert.equal(accepted.order.status, "DRIVER_ASSIGNED", "driver accept must assign order");

  const driverRoute = await api("/api/routes/driver-to-pickup", {
    method: "POST",
    token: client.token,
    body: { orderId }
  });
  assert.ok(driverRoute.route?.distanceMeters > 0, "client must receive real driver-to-pickup route after assignment");

  const arrived = await api(`/api/orders/${orderId}/arrived`, { method: "POST", token: driver.token });
  assert.equal(arrived.order.status, "DRIVER_ARRIVED", "arrived status must persist");
  const started = await api(`/api/orders/${orderId}/start`, { method: "POST", token: driver.token });
  assert.equal(started.order.status, "IN_PROGRESS", "start status must persist");
  const completed = await api(`/api/orders/${orderId}/complete`, { method: "POST", token: driver.token });
  assert.equal(completed.order.status, "COMPLETED", "complete status must persist");
  assert.ok(Number(completed.order.price) > 0, "completed order must keep final price");

  const adminOrders = await api("/api/orders", { token: admin.token, query: { limit: 30 } });
  assert.ok(adminOrders.orders.some(order => order.id === orderId), "admin/operator must see completed order");

  const alertPoint = pointInside(region, 0.002, 0.002);
  const createdAlert = await api("/api/driver/road-alerts", {
    method: "POST",
    token: driver.token,
    body: {
      regionId: region.id,
      type: "SPEED_CAMERA",
      comment: "Проверка предупреждения для безопасного соблюдения скорости",
      lat: alertPoint.lat,
      lng: alertPoint.lng,
      speedLimit: 60
    }
  });
  assert.ok(createdAlert.alert?.id, "driver must create road alert");
  assert.equal(createdAlert.alert.speedLimit, 60, "road alert must persist speed limit");

  const listedAlerts = await api("/api/driver/road-alerts", { token: driver.token, query: { regionId: region.id } });
  assert.ok(listedAlerts.alerts.some(alert => alert.id === createdAlert.alert.id), "driver must list created road alert");

  const confirmedAlert = await api(`/api/driver/road-alerts/${createdAlert.alert.id}/confirm`, {
    method: "PATCH",
    token: driver.token
  });
  assert.ok(confirmedAlert.alert.confirmationsCount >= createdAlert.alert.confirmationsCount + 1, "confirm must increment count");
  assert.ok(confirmedAlert.alert.confidenceScore > createdAlert.alert.confidenceScore, "confirm must increase confidence");

  const adminAlerts = await api("/api/admin/road-alerts", { token: admin.token, query: { status: "ACTIVE", regionId: region.id } });
  assert.ok(adminAlerts.alerts.some(alert => alert.id === createdAlert.alert.id), "admin/operator must see active road alert");

  const expiredAlert = await api(`/api/admin/road-alerts/${createdAlert.alert.id}/expire`, {
    method: "PATCH",
    token: admin.token
  });
  assert.equal(expiredAlert.alert.status, "EXPIRED", "admin moderation must expire road alert");

  console.log(JSON.stringify({
    ok: true,
    region: region.name,
    tariff: tariff.displayName || tariff.name,
    orderId,
    finalStatus: completed.order.status,
    finalPrice: completed.order.price,
    roadAlertId: createdAlert.alert.id,
    roadAlertStatus: expiredAlert.alert.status,
    routeDistanceMeters: routePayload.route.distanceMeters,
    driverRouteDistanceMeters: driverRoute.route.distanceMeters
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
