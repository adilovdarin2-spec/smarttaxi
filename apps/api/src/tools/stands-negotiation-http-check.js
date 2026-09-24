import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const { io } = createRequire(import.meta.url)('socket.io-client');

const base = process.env.QA_API_URL || 'http://127.0.0.1:4001';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname));
async function api(path, token, body, method = body === undefined ? 'GET' : 'POST', expectedStatus) {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = r.status === 204 ? null : await r.json();
  if (expectedStatus) assert.equal(r.status, expectedStatus, `${path}: ${JSON.stringify(data)}`);
  else assert.ok(r.ok, `${path}: ${r.status} ${JSON.stringify(data)}`);
  return data;
}
async function register(prefix) {
  const phone = `+770${prefix}${String(Date.now()).slice(-7)}`;
  const sent = await api('/api/auth/sms/send', null, { phone, purpose: 'REGISTER' });
  assert.ok(sent.devCode);
  const verified = await api('/api/auth/sms/verify', null, { phone, purpose: 'REGISTER', code: sent.devCode });
  return { phone, ...(await api('/api/auth/register/password', null, { phone, name: 'QA negotiation', password: '123456', verificationToken: verified.verificationToken })) };
}
const ready = await api('/api/health/ready');
assert.equal(ready.env, 'development');
assert.equal(ready.checks.sms, 'dev');
let owner, driver, rider, passenger, stand, entry, order, socket, browser;
try {
  owner = await api('/api/auth/login/password', null, { phone: '+77000000099', password: 'ChangeMe_2026!' });
  driver = await api('/api/auth/login/password', null, { phone: '+77000000000', password: '123456' });
  assert.equal((await api('/api/driver/orders/active', driver.token)).activeOrder, null, 'Do not disturb an existing trip');
  assert.equal((await api('/api/driver/stands/me', driver.token)).entry, null, 'Do not disturb an existing queue');
  rider = await register('8');
  passenger = await register('9');
  const region = (await api('/api/regions/active')).regions.find(r => r.code === 'ATAKENT');
  assert.ok(region);
  const profile = await api('/api/driver/profile', driver.token);
  assert.equal(profile.driver.currentRegionId, region.id, 'Select the seeded local driver Atakent region before running');
  stand = (await api('/api/admin/stands', owner.token, { regionId: region.id, name: `QA negotiation ${Date.now()}`, kind: 'INTERCITY', lat: 40.8458, lng: 68.5041, radiusM: 150 })).stand;
  socket = io(base, { auth: { token: rider.token }, transports: ['websocket'], reconnection: false });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 10000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('connect_error', e => { clearTimeout(timer); reject(e); });
  });
  const notifications = [];
  socket.on('stand_reservation_cancelled', event => notifications.push(event));
  for (const counter of [false, true]) {
    await api('/api/driver/status/online', driver.token, {});
    entry = (await api(`/api/driver/stands/${stand.id}/join`, driver.token, { lat: stand.lat, lng: stand.lng, totalSeats: 4 })).entry;
    const booking = (await api(`/api/stands/entries/${entry.id}/reserve`, rider.token, { seats: 1 })).reservation;
    await api(`/api/driver/stands/reservations/${booking.id}/accept`, driver.token, {});
    order = (await api('/api/orders', passenger.token, { riderName: 'QA negotiation', riderPhone: passenger.phone,
      pickupText: 'QA Атакент, начало', dropoffText: 'QA Атакент, конец', pickupLat: 40.8458, pickupLng: 68.5041,
      dropoffLat: 40.844435, dropoffLng: 68.509021, tariff: 'Economy', paymentMethod: 'CASH', distanceKm: 1, durationMin: 3,
      notes: 'Local QA stand negotiation only' })).order;
    const priceKzt = Number(order.price);
    const proposal = (await api(`/api/orders/${order.id}/price-offer`, driver.token, { priceKzt })).order;
    const expectedOffer = { driverId: proposal.driver_offer_by_driver_id, priceKzt: Number(proposal.driver_offer_price_kzt), proposedBy: 'DRIVER' };
    const endpoint = counter ? 'driver-respond' : 'respond';
    if (counter) {
      await api(`/api/orders/${order.id}/price-offer/counter`, passenger.token, { priceKzt, expectedOffer });
      expectedOffer.proposedBy = 'CLIENT';
    }
    let page;
    if (!counter && process.env.QA_PLAYWRIGHT_PACKAGE) {
      const web = process.env.QA_WEB_URL || 'http://127.0.0.1:5175';
      assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(web).hostname));
      const { chromium } = createRequire(import.meta.url)(process.env.QA_PLAYWRIGHT_PACKAGE);
      browser = await chromium.launch({ headless: true, ...(process.env.QA_BROWSER_EXECUTABLE ? { executablePath: process.env.QA_BROWSER_EXECUTABLE } : {}) });
      const width = Number(process.env.QA_VIEWPORT_WIDTH || 320);
      assert.ok([320, 360, 390].includes(width));
      const context = await browser.newContext({ viewport: { width, height: 740 } });
      await context.addInitScript(token => localStorage.setItem('smarttaxi_token', token), passenger.token);
      page = await context.newPage();
      await page.goto(web + '/order');
      await page.locator('.price-offer-accept').waitFor();
    }
    // Preference changed after the offer: refuse assignment without touching
    // the confirmed stand booking, then accept normally after unblocking.
    const driverId = profile.driver.id;
    await api('/api/favorites/drivers', passenger.token, { driverId, type: 'BLOCKED' });
    try {
      const rejected = await api(`/api/orders/${order.id}/price-offer/${endpoint}`, counter ? driver.token : passenger.token, { accept: true, expectedOffer }, 'POST', 403);
      assert.equal(rejected.error, 'DRIVER_BLOCKED_BY_CLIENT');
      assert.equal((await api('/api/driver/orders/active', driver.token)).activeOrder, null);
      assert.equal((await api('/api/driver/stands/me', driver.token)).entry.id, entry.id);
      const unchanged = (await api('/api/stands/reservations/me', rider.token)).reservation;
      assert.equal(unchanged.id, booking.id);
      assert.equal(unchanged.status, 'CONFIRMED');
      assert.ok(!notifications.some(n => n.reservationId === booking.id), 'Refusal must not announce a stand cancellation');
      if (page) {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const response = page.waitForResponse(r => r.url().endsWith(`/api/orders/${order.id}/price-offer/respond`) && r.request().method() === 'POST');
        await page.locator('.price-offer-accept').click();
        assert.equal((await response).status(), 403);
        const message = page.getByText('Водитель больше не может принять этот заказ. Выберите другого водителя или отклоните предложение.', { exact: true });
        await message.waitFor();
        await page.locator('.price-offer-accept').evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
        const width = page.viewportSize().width;
        for (const selector of ['.price-offer-card', '.price-offer-accept', '.price-offer-decline', '.price-offer-card .state-note']) {
          const bounds = await page.locator(selector).boundingBox();
          assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1, `${selector} clipped on ${width}px`);
        }
        for (const selector of ['.price-offer-accept', '.price-offer-decline']) {
          const bounds = await page.locator(selector).boundingBox();
          assert.ok(bounds.y >= -1 && bounds.y + bounds.height <= page.viewportSize().height + 1, `Both actions must be reachable by scrolling: ${JSON.stringify(bounds)}`);
        }
        const output = path.join(os.tmpdir(), 'onedriver-assignment-policy-qa');
        await mkdir(output, { recursive: true });
        const screenshot = path.join(output, `rider-refused-${width}.png`);
        await page.screenshot({ path: screenshot });
        assert.deepEqual(errors, []);
        console.log(`Real rider browser: private-safe refusal without clipping, ${screenshot}`);
      }
    } finally {
      await api(`/api/favorites/drivers/${driverId}`, passenger.token, undefined, 'DELETE');
    }
    const accepted = await api(`/api/orders/${order.id}/price-offer/${endpoint}`, counter ? driver.token : passenger.token, { accept: true, expectedOffer });
    assert.equal(accepted.order.public_status, 'DRIVER_FOUND');
    assert.equal((await api('/api/driver/stands/me', driver.token)).entry, null);
    assert.equal((await api('/api/stands/reservations/me', rider.token)).reservation, null);
    const outcome = (await api(`/api/stands/reservations/${booking.id}/status`, rider.token)).outcome;
    assert.equal(outcome.status, 'CANCELLED');
    assert.equal(outcome.reason, 'ACCEPTED_ORDER');
    const deadline = Date.now() + 5000;
    while (!notifications.some(n => n.reservationId === booking.id) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
    assert.ok(notifications.some(n => n.reservationId === booking.id && n.standId === stand.id), 'Real authenticated rider socket receives committed cancellation');
    assert.equal((await api(`/api/stands/${stand.id}`, rider.token)).entries.length, 0);
    await api(`/api/orders/${order.id}/cancel-public`, passenger.token, { riderPhone: passenger.phone });
    order = null;
    await browser?.close();
    browser = null;
    console.log(`HTTP ${endpoint}: blocked assignment refused with booking intact; after unblock assigned order, released stand, cancelled reservation, rider socket notified`);
  }
} finally {
  await browser?.close();
  socket?.disconnect();
  if (order && passenger) await api(`/api/orders/${order.id}/cancel-public`, passenger.token, { riderPhone: passenger.phone });
  if (entry && driver) {
    const mine = await api('/api/driver/stands/me', driver.token);
    if (mine.entry?.id === entry.id) await api(`/api/driver/stands/entries/${entry.id}/leave`, driver.token, {});
  }
  if (stand && owner) await api(`/api/admin/stands/${stand.id}`, owner.token, undefined, 'DELETE');
}
