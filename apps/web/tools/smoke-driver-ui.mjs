import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Local integration QA: real seeded-driver login, real API transitions, and a
// separate client registered through the local development SMS provider.
// Failure assertions intercept only this browser's named action requests.
const base = process.env.QA_WEB_URL || "http://127.0.0.1:5175";
const apiBase = process.env.QA_API_URL || "http://127.0.0.1:4001";
for (const url of [base, apiBase]) {
  assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname), "Driver UI smoke is local-only");
}
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QA_PLAYWRIGHT_PACKAGE || "playwright");
const { PNG } = createRequire(require.resolve(process.env.QA_PLAYWRIGHT_PACKAGE || "playwright"))("pngjs");
const output = process.env.QA_OUTPUT_DIR || path.join(os.tmpdir(), "smarttaxi-driver-ui-qa");
await mkdir(output, { recursive: true });
const evidence = [];
const mark = (step, detail = {}) => { evidence.push({ step, ...detail }); console.log(JSON.stringify({ step, ...detail })); };
const browser = await chromium.launch({ headless: true, ...(process.env.QA_BROWSER_EXECUTABLE ? { executablePath: process.env.QA_BROWSER_EXECUTABLE } : {}) });
// Explicit browser GPS test input inside ATAKENT. The application sends it
// through its real authenticated location API; this is not a physical drive.
let gps = { latitude: 40.8458, longitude: 68.5041, accuracy: 8 };
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: gps, permissions: ["geolocation"] });
await context.addInitScript(() => {
  const watch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
  const clear = navigator.geolocation.clearWatch.bind(navigator.geolocation);
  window.driverQaWatches = new Set();
  navigator.geolocation.watchPosition = (...args) => {
    const id = watch(...args);
    window.driverQaWatches.add(id);
    return id;
  };
  navigator.geolocation.clearWatch = id => {
    window.driverQaWatches.delete(id);
    clear(id);
  };
});
const page = await context.newPage();
const errors = [];
const routeReports = [];
const locationReports = [];
page.on("pageerror", error => errors.push(error.message));
function captureRoutes(target, name) {
  target.on("response", async response => {
    const url = new URL(response.url());
    if (!["/api/routes/driver-to-pickup", "/api/drivers/me/location"].includes(url.pathname)) return;
    try {
      const payload = await response.json();
      if (url.pathname.endsWith("/location")) {
        locationReports.push({ status: response.status(), at: Date.now(), location: payload.location, error: payload.error });
      } else {
        routeReports.push({ browser: name, status: response.status(), at: Date.now(), route: payload.route, error: payload.error });
      }
    } catch { /* Ignore a response interrupted when this isolated page closes. */ }
  });
}
captureRoutes(page, "driver");
let token;
let newOrder;
let client;
let passenger;
let roadAlertId;
let frontendMode;

async function request(endpoint, { method = "GET", body, auth = token } = {}) {
  const response = await fetch(`${apiBase}${endpoint}`, {
    method,
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  assert(response.ok, `${method} ${endpoint}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
async function shot(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  if (passenger && name.startsWith("driver-") && name !== "driver-active-360") {
    for (const width of [390, 360]) {
      await passenger.setViewportSize({ width, height: width === 390 ? 844 : 740 });
      await passenger.waitForTimeout(300);
      assert.equal(await passenger.locator(".search-nearby-driver, .driver-found-map-layer, .search-map-radar-marker").count(), 0, "Only real map markers/ETA may represent the live trip");
      if (await passenger.locator(".search-driver-head").count()) {
        assert.doesNotMatch(await passenger.locator(".search-driver-head").innerText(), /3 водител|1[–-]3 минут/, "Search must not promise an invented nearby count or ETA");
      }
      for (const element of await passenger.locator(".driver-found-reference-sheet, .driver-found-driver-card, .driver-found-route-card, .ride-status-rail, .driver-found-call-round").all()) {
        const box = await element.boundingBox();
        if (box) assert(box.x >= -1 && box.x + box.width <= width + 1, `Passenger element overflows ${width}px: ${JSON.stringify(box)}`);
      }
      const passengerName = name.replace("driver-", "passenger-") + (width === 360 ? "-360" : "");
      await passenger.screenshot({ path: path.join(output, `${passengerName}.png`) });
    }
    await passenger.setViewportSize({ width: 390, height: 844 });
  }
}
async function onScreen(locator) {
  const box = await locator.boundingBox();
  const { width, height } = page.viewportSize();
  assert(box && box.y >= 0 && box.x >= 0 && box.y + box.height <= height + 1 && box.x + box.width <= width + 1, `Control outside viewport: ${JSON.stringify(box)}`);
  const panel = await locator.evaluate(element => {
    const bounds = element.closest(".driver-core-panel")?.getBoundingClientRect();
    return bounds ? { top: bounds.top, bottom: bounds.bottom } : null;
  });
  if (panel) assert(box.y >= panel.top - 1 && box.y + box.height <= panel.bottom + 1, "Action must not be clipped by the scrolling sheet or bottom navigation");
}
async function waitForEvidence(predicate, label, timeout = 25000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) {
      const recent = routeReports.slice(-6).map(item => ({ browser: item.browser, status: item.status, phase: item.route?.phase, error: item.error }));
      assert.fail(`${label}: ${JSON.stringify({ recent, location: locationReports.at(-1) })}`);
    }
    await page.waitForTimeout(150);
  }
}
async function assertDriverCar(target, name) {
  const marker = target.locator(".driver-marker").first();
  const image = marker.locator("img");
  await image.waitFor();
  await target.waitForFunction(() => {
    const image = document.querySelector(".driver-marker img");
    return image?.complete && image.naturalWidth > 0;
  });
  const details = await image.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const marker = element.parentElement.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      src: new URL(element.currentSrc).pathname,
      naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight,
      width: rect.width, height: rect.height,
      withinMarker: rect.left >= marker.left - 1 && rect.right <= marker.right + 1 && rect.top >= marker.top - 1 && rect.bottom <= marker.bottom + 1,
      display: style.display, visibility: style.visibility, opacity: style.opacity,
      objectFit: style.objectFit
    };
  });
  assert.equal(details.src, "/map/driver_car_topview_white.png", `${name}: use the existing original vehicle asset`);
  assert(details.width >= 24 && details.height >= 24 && details.withinMarker && details.display !== "none" && details.visibility === "visible" && Number(details.opacity) > 0, `${name}: loaded car image must visibly fit its marker, not just an empty wrapper: ${JSON.stringify(details)}`);
  mark("loaded_car_image_visible", { browser: name, ...details });
}
async function assertFinishFlag(target, name) {
  const marker = target.locator(".finish-flag-map-marker").first();
  const svg = marker.locator("svg");
  await svg.waitFor();
  const details = await svg.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const marker = element.closest(".finish-flag-map-marker").getBoundingClientRect();
    const paint = element.getBBox();
    const style = getComputedStyle(element);
    return {
      viewBox: element.getAttribute("viewBox"), width: rect.width, height: rect.height,
      paintedWidth: paint.width, paintedHeight: paint.height,
      contained: rect.left >= marker.left - 1 && rect.right <= marker.right + 1 && rect.top >= marker.top - 1 && rect.bottom <= marker.bottom + 1,
      display: style.display, visibility: style.visibility, opacity: style.opacity
    };
  });
  assert.equal(details.viewBox, "0 0 58 76");
  assert(Math.abs(details.width - 58) < 1 && Math.abs(details.height - 76) < 1 && details.paintedWidth > 20 && details.paintedHeight > 50 && details.contained && details.display !== "none" && details.visibility === "visible" && Number(details.opacity) > 0, `${name}: finish SVG must have visible contained geometry: ${JSON.stringify(details)}`);
  const bounds = await marker.boundingBox();
  const map = await target.locator(".maplibregl-canvas").first().boundingBox();
  assert(bounds.x >= map.x - 1 && bounds.y >= map.y - 1 && bounds.x + bounds.width <= map.x + map.width + 1 && bounds.y + bounds.height <= map.y + map.height + 1, `${name}: finish flag must fit the visible destination-leg map`);
  // Sample the actual composited screen, not a detached SVG render. Eight
  // blue and eight white cells prove the flag is visible over the map/buildings.
  const bitmap = PNG.sync.read(await svg.screenshot());
  let blueCells = 0;
  let whiteCells = 0;
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      const x = Math.round((24 + column * 6) * bitmap.width / 58);
      const y = Math.round((17.75 + row * 6.5) * bitmap.height / 76);
      const offset = (y * bitmap.width + x) * 4;
      const [red, green, blue] = bitmap.data.subarray(offset, offset + 3);
      if (blue > 150 && blue - red > 60 && blue - green > 20) blueCells++;
      if (red > 190 && green > 190 && blue > 190 && Math.abs(red - green) < 25 && Math.abs(blue - red) < 45) whiteCells++;
    }
  }
  assert(blueCells >= 7 && whiteCells >= 7, `${name}: actual finish checkerboard must remain visible above the canvas: ${JSON.stringify({ blueCells, whiteCells })}`);
  mark("finish_flag_visible_above_map", { browser: name, ...details, blueCells, whiteCells });
}
async function assertLiveRoute(phase, label) {
  for (const [target, name] of [[page, "driver"], [passenger, "passenger"]]) {
    await waitForEvidence(() => routeReports.some(item => item.browser === name && item.status === 200 && item.route?.phase === phase && item.route?.driverLat === gps.latitude && item.route?.driverLng === gps.longitude), `${name} real ${phase} response`);
    const report = routeReports.findLast(item => item.browser === name && item.status === 200 && item.route?.phase === phase && item.route?.driverLng === gps.longitude);
    assert(report.route.geometry?.coordinates?.length > 2 && report.route.distanceMeters > 0 && !report.route.fallback, "Requires real routed geometry, not a fallback straight line");
    await target.locator(".maplibregl-canvas").first().waitFor();
    await target.locator(".driver-marker").first().waitFor();
    await target.waitForTimeout(1000);
    await assertDriverCar(target, name);
    const marker = await target.locator(".driver-marker").first().boundingBox();
    const mapBounds = await target.locator(".maplibregl-canvas").first().boundingBox();
    assert(marker && marker.x >= mapBounds.x - 1 && marker.x + marker.width <= mapBounds.x + mapBounds.width + 1 && marker.y >= mapBounds.y - 1 && marker.y + marker.height <= mapBounds.y + mapBounds.height + 1, "Actual driver marker must fit the map");
    const canvas = target.locator(".maplibregl-canvas").first();
    const mask = await target.locator(".maplibregl-marker, .driver-core-header, .map-controls, .map-badge, .map-error-chip, .driver-core-action-notice").all();
    const bitmap = PNG.sync.read(await canvas.screenshot({ mask, maskColor: "#ffffff" }));
    let bluePixels = 0;
    for (let i = 0; i < bitmap.data.length; i += 4) {
      const [red, green, blue] = bitmap.data.subarray(i, i + 3);
      // The passenger map applies a muted blue treatment, so allow its
      // anti-aliased route colour while still excluding neutral buildings.
      if (red < 150 && green > 65 && green < 195 && blue > 185 && blue - red > 75 && blue - green > 45) bluePixels++;
    }
    assert(bluePixels > 8, `${name} route line must be rendered outside masked marker/control elements (bluePixels=${bluePixels})`);
    mark("live_route_verified", { browser: name, label, phase, points: report.route.geometry.coordinates.length, bluePixels });
    if (phase === "to_dropoff") await assertFinishFlag(target, name);
  }
}
async function tab(name) {
  await page.getByRole("navigation", { name: "Меню водителя" }).getByRole("button", { name, exact: true }).click();
  await onScreen(page.getByRole("navigation", { name: "Меню водителя" }));
}
async function failAction(orderId, action, label, expectedSelector) {
  const pattern = `**/api/driver/orders/${orderId}/${action}`;
  await page.route(pattern, route => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "INVALID_STATUS_TRANSITION" }) }));
  await page.locator(`[data-order-id="${orderId}"]`).getByRole("button", { name: label, exact: true }).click();
  await page.locator(".driver-core-error").filter({ hasText: "Это действие сейчас недоступно" }).waitFor();
  assert(await page.locator(expectedSelector).isVisible(), `${action} failure must preserve current order UI`);
  assert.equal(await page.locator(".driver-core-tabs button.active").innerText(), action === "accept" || action === "reject" ? "Заказы" : "Поездка");
  await page.unroute(pattern);
  mark(`failed_${action}_preserves_order`);
}
async function transition(orderId, label, status, image) {
  const button = page.locator(`[data-order-id="${orderId}"]`).getByRole("button", { name: label, exact: true });
  await button.waitFor();
  await onScreen(button);
  const [response] = await Promise.all([
    page.waitForResponse(response => response.url().includes(`/api/driver/orders/${orderId}/`) && response.request().method() === "POST"),
    button.click()
  ]);
  const result = await response.json();
  assert.equal(result.order?.public_status || result.order?.status, status);
  await page.waitForFunction(() => !document.querySelector(".driver-core-card-actions .app-button:disabled"));
  if (passenger) {
    const titles = { DRIVER_GOING_TO_CLIENT: "Водитель найден", DRIVER_ARRIVED: "Водитель на месте", WAITING_CLIENT: "Идёт ожидание", TRIP_STARTED: "Поездка началась", TRIP_COMPLETED: "Поездка окончена", PAID: "Оставьте отзыв" };
    if (titles[status]) await passenger.getByRole("heading", { name: titles[status], exact: true }).waitFor({ timeout: 20000 });
  }
  if (image) await shot(image);
  mark(status);
}

try {
  const health = await request("/api/health/ready", { auth: null });
  assert.equal(health.status, "ok");
  assert.equal(health.env, "development", "Never run driver UI mutations outside local development");
  const frontendResponse = await page.goto(`${base}/driver`);
  frontendMode = await page.locator('script[src="/@vite/client"]').count() ? "vite-development" : "built-web";
  if (process.env.QA_EXPECT_FRONTEND_MODE) assert.equal(frontendMode, process.env.QA_EXPECT_FRONTEND_MODE);
  mark("local_frontend_verified", { web: base, api: apiBase, mode: frontendMode, server: frontendResponse?.headers().server || "unavailable" });
  await page.getByLabel("Телефон", { exact: true }).fill(process.env.QA_DRIVER_PHONE || "+77000000000");
  await page.getByLabel("Пароль", { exact: true }).fill(process.env.QA_DRIVER_PASSWORD || "123456");
  const loginResponse = page.waitForResponse(response => response.url().endsWith("/api/auth/login/password"));
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  const login = await (await loginResponse).json();
  assert.equal(login.user?.role, "DRIVER");
  token = login.token;
  await page.getByRole("navigation", { name: "Меню водителя" }).waitFor();
  await page.locator(".driver-core-loading").waitFor({ state: "hidden" });
  await waitForEvidence(() => locationReports.some(item => item.status === 200 && Number(item.location?.lng) === gps.longitude), "Real driver location API accepted browser GPS fixture");
  mark("simulated_browser_gps_sent_to_real_api", { latitude: gps.latitude, longitude: gps.longitude });
  await assertDriverCar(page, "driver initial location");
  await page.waitForFunction(() => !document.body.textContent.includes("Загружаем карту"), null, { timeout: 25000 }).catch(() => mark("map_provider_still_loading"));
  const initial = await request("/api/driver/orders/active");
  const active = initial.activeOrder;
  if (active) assert.equal(active.id, process.env.QA_EXISTING_ORDER_ID, "Refusing to change an unrelated existing order; supply the authorized QA order ID");

  for (const size of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
    await page.setViewportSize(size);
    for (const name of ["Линия", "Заказы", "Поездка", "Дорога", "Доход"]) {
      await tab(name);
      await onScreen(page.getByRole("button", { name: "Выйти", exact: true }));
      await shot(`driver-${name === "Линия" ? "line" : name === "Заказы" ? "orders" : name === "Поездка" ? "active" : name === "Дорога" ? "road" : "earnings"}-${size.width}`);
    }
  }
  mark("all_five_tabs_visible", { widths: [390, 360] });
  const roadComment = `Локальная проверка дорожного события ${Date.now()}`;
  const roadCreated = await request("/api/driver/road-alerts", { method: "POST", body: {
    type: "ROAD_WORK", comment: roadComment, lat: 40.844435, lng: 68.509021
  } });
  roadAlertId = roadCreated.alert.id;
  await tab("Дорога");
  const roadCard = page.locator(".driver-core-road-card").filter({ hasText: roadComment });
  await roadCard.waitFor();
  await roadCard.scrollIntoViewIfNeeded();
  for (const button of await roadCard.getByRole("button").all()) await onScreen(button);
  await shot("driver-road-event");
  await roadCard.getByRole("button", { name: "Не актуально", exact: true }).click();
  await roadCard.waitFor({ state: "hidden" });
  roadAlertId = null;
  mark("real_road_event_visible_and_expired");
  await page.setViewportSize({ width: 390, height: 844 });
  await tab("Поездка");
  if (active) {
    assert.equal(active.status, "DRIVER_FOUND", "Existing lifecycle QA must begin with accepted order");
    await failAction(active.id, "cancel", "Отменить", ".driver-core-active");
    assert.equal((await request("/api/driver/orders/active")).activeOrder?.id, active.id);
    await transition(active.id, "Еду к клиенту", "DRIVER_GOING_TO_CLIENT", "driver-going");
    await transition(active.id, "Я приехал", "DRIVER_ARRIVED", "driver-arrived");
    await failAction(active.id, "no-show", "Клиент не вышел", ".driver-core-active");
    await transition(active.id, "Начать ожидание", "WAITING_CLIENT", "driver-waiting");
    await transition(active.id, "Начать поездку", "TRIP_STARTED", "driver-trip");
    await transition(active.id, "Завершить поездку", "TRIP_COMPLETED", "driver-complete");
    await transition(active.id, "Подтвердить оплату", "PAID", "driver-paid");
  } else if (process.env.QA_EXISTING_ORDER_ID) {
    const pending = (await request("/api/orders/me/driver-history?limit=50")).orders.find(order => order.id === process.env.QA_EXISTING_ORDER_ID);
    if (pending && ["TRIP_COMPLETED", "PAYMENT_PENDING"].includes(pending.public_status || pending.status)) {
      await page.locator(`[data-order-id="${pending.id}"]`).waitFor();
      await shot("driver-payment-recovered");
      mark("payment_recovered_after_reload", { orderId: pending.id });
      await transition(pending.id, "Подтвердить оплату", "PAID", "driver-paid");
    }
  }

  await tab("Линия");
  const online = page.getByRole("button", { name: "Выйти на линию", exact: true });
  if (await online.count()) await online.click();
  await page.getByRole("button", { name: "Уйти с линии", exact: true }).waitFor();
  await tab("Заказы");
  const phone = `+7708${String(Date.now()).slice(-7)}`;
  const sent = await request("/api/auth/sms/send", { method: "POST", body: { phone, purpose: "REGISTER" }, auth: null });
  assert(sent.devCode, "Requires local development SMS provider; never contacts a production SMS sender");
  const verified = await request("/api/auth/sms/verify", { method: "POST", body: { phone, purpose: "REGISTER", code: sent.devCode }, auth: null });
  client = await request("/api/auth/register/password", { method: "POST", body: { phone, verificationToken: verified.verificationToken, name: "Local browser driver QA", password: "123456" }, auth: null });
  client.phone = phone;
  const estimate = await request("/api/tariffs/estimate", { method: "POST", auth: client.token, body: {
    pickupLat: 40.84621, pickupLng: 68.50486, dropoffLat: 40.844435, dropoffLng: 68.509021, tariff: "Economy"
  } });
  assert(estimate.priceKzt > 0 && estimate.distanceKm > 0, "Real local route estimate required");
  const started = Date.now();
  const created = await request("/api/orders", { method: "POST", auth: client.token, body: {
    riderName: "Local browser driver QA", riderPhone: phone,
    pickupText: "Атакент автовокзал", dropoffText: "Базар Атакент",
    pickupLat: 40.84621, pickupLng: 68.50486, dropoffLat: 40.844435, dropoffLng: 68.509021,
    tariff: "Economy", paymentMethod: "CASH", distanceKm: estimate.distanceKm, durationMin: estimate.durationMin,
    notes: "Local browser driver QA; isolated disposable order"
  } });
  newOrder = created.order;
  const passengerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // This is the real token issued by the verified local registration above.
  // It is neither a forged token nor an unauthenticated UI fixture.
  await passengerContext.addInitScript(token => localStorage.setItem("smarttaxi_token", token), client.token);
  passenger = await passengerContext.newPage();
  captureRoutes(passenger, "passenger");
  await passenger.goto(`${base}/order`);
  await passenger.locator(`.trip-search-card[data-order-id="${newOrder.id}"]`).waitFor({ timeout: 20000 });
  mark("passenger_search_recovered_after_open");
  const card = page.locator(`[data-order-id="${newOrder.id}"]`);
  await card.waitFor({ timeout: 20000 });
  assert.equal((await request("/api/driver/orders/active")).activeOrder, null, "Incoming broadcast must not become active trip");
  mark("incoming_without_reload", { elapsedMs: Date.now() - started, orderId: newOrder.id });
  await shot("driver-incoming-live");
  await failAction(newOrder.id, "accept", "Принять", `[data-order-id="${newOrder.id}"]`);
  await failAction(newOrder.id, "reject", "Пропустить", `[data-order-id="${newOrder.id}"]`);
  const profilePattern = "**/api/driver/profile";
  await page.route(profilePattern, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "SERVICE_UNAVAILABLE" }) }));
  await card.getByRole("button", { name: "Принять", exact: true }).click();
  await page.locator(".driver-core-view-active").waitFor();
  await page.getByRole("button", { name: "Еду к клиенту", exact: true }).waitFor();
  assert.equal(await page.locator(".driver-core-header .driver-core-status").innerText(), "Занят", "The authoritative accepted order keeps the header BUSY while profile refresh fails");
  await passenger.getByRole("heading", { name: "Водитель найден", exact: true }).waitFor({ timeout: 20000 });
  await page.unroute(profilePattern);
  mark("successful_accept_survives_profile_refresh_failure");
  assert.equal((await request("/api/driver/orders/active")).activeOrder?.id, newOrder.id);
  assert.equal(await page.evaluate(() => window.driverQaWatches.size), 1, "Geolocation watch must remain running while BUSY");
  mark("busy_geolocation_watch_retained");
  await assertLiveRoute("to_pickup", "accepted");
  const latestLocationAt = locationReports.findLast(item => item.status === 200).at;
  await page.waitForTimeout(Math.max(0, 15500 - (Date.now() - latestLocationAt)));
  gps = { ...gps, longitude: Number((gps.longitude + 0.0003).toFixed(6)) };
  await context.setGeolocation(gps);
  await waitForEvidence(() => locationReports.some(item => item.status === 200 && Number(item.location?.lng) === gps.longitude), "Longitude-only update reached actual API");
  await assertLiveRoute("to_pickup", "longitude-only movement");
  const movingState = await request("/api/driver/orders/active");
  assert.equal(movingState.activeOrder?.id, newOrder.id);
  assert.equal(movingState.driver?.publicStatus, "BUSY", "A location update must not free a driver with an active order");
  mark("longitude_only_movement_routed_without_latitude_change");
  await shot("driver-accepted-live");
  await page.setViewportSize({ width: 360, height: 740 });
  await onScreen(page.getByRole("button", { name: "Еду к клиенту", exact: true }));
  await onScreen(page.getByRole("navigation", { name: "Меню водителя" }));
  await shot("driver-active-360");
  await page.setViewportSize({ width: 390, height: 844 });
  await failAction(newOrder.id, "cancel", "Отменить", ".driver-core-active");
  await transition(newOrder.id, "Еду к клиенту", "DRIVER_GOING_TO_CLIENT", "driver-going");
  await transition(newOrder.id, "Я приехал", "DRIVER_ARRIVED", "driver-arrived");
  await failAction(newOrder.id, "no-show", "Клиент не вышел", ".driver-core-active");
  await transition(newOrder.id, "Начать ожидание", "WAITING_CLIENT", "driver-waiting");
  await transition(newOrder.id, "Начать поездку", "TRIP_STARTED", "driver-trip");
  await assertLiveRoute("to_dropoff", "trip started");
  await shot("driver-trip-live-route");
  await transition(newOrder.id, "Завершить поездку", "TRIP_COMPLETED", "driver-complete");
  await passenger.reload();
  await passenger.getByRole("heading", { name: "Поездка окончена", exact: true }).waitFor({ timeout: 20000 });
  mark("passenger_unpaid_trip_recovered_after_reload");
  await page.reload();
  await tab("Поездка");
  await page.locator(`[data-order-id="${newOrder.id}"]`).waitFor();
  mark("new_payment_recovered_after_reload");
  await transition(newOrder.id, "Подтвердить оплату", "PAID", "driver-paid");
  assert.equal((await request("/api/driver/orders/active")).activeOrder, null);
  newOrder = null;
  mark("successful_accept_through_payment");
  assert.deepEqual(errors, [], "No uncaught browser errors");
  mark("passed");
} catch (error) {
  await shot("driver-failure").catch(() => {});
  console.error(await page.locator("body").innerText().catch(() => ""));
  throw error;
} finally {
  await writeFile(path.join(output, "result.json"), JSON.stringify(evidence, null, 2));
  await writeFile(path.join(output, "network.json"), JSON.stringify({
    web: base, api: apiBase, frontendMode,
    fixture: "Simulated browser geolocation; real local authenticated APIs and OSRM responses",
    locations: locationReports,
    routes: routeReports.map(item => ({ browser: item.browser, status: item.status, at: item.at, error: item.error,
      phase: item.route?.phase, driverLat: item.route?.driverLat, driverLng: item.route?.driverLng,
      targetLat: item.route?.targetLat, targetLng: item.route?.targetLng,
      points: item.route?.geometry?.coordinates?.length, distanceMeters: item.route?.distanceMeters,
      fallback: item.route?.fallback, providerStatus: item.route?.providerStatus }))
  }, null, 2));
  await browser.close();
  if (roadAlertId) {
    await request(`/api/driver/road-alerts/${roadAlertId}/expire`, { method: "PATCH" }).catch(error => console.error(`QA alert cleanup: ${error.message}`));
  }
  // Only the new isolated order belongs to this script. Preserve all others.
  if (newOrder?.id && client?.token) {
    await request(`/api/orders/${newOrder.id}/cancel-public`, { method: "POST", auth: client.token, body: { riderPhone: client.phone } }).catch(error => console.error(`QA order cleanup: ${error.message}`));
  }
}
