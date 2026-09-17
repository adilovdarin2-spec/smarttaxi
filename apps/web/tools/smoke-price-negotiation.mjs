import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const api = process.env.QA_API_URL || 'http://127.0.0.1:4001';
const web = process.env.QA_WEB_URL || 'http://127.0.0.1:5175';
for (const url of [api, web]) assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname));
async function request(endpoint, token, body) {
  const r = await fetch(api + endpoint, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json();
  assert(r.ok, `${endpoint}: ${r.status} ${JSON.stringify(data)}`);
  return data;
}
const health = await request('/api/health/ready');
assert.equal(health.env, 'development'); assert.equal(health.checks.sms, 'dev');
const driver = await request('/api/auth/login/password', null, { phone: '+77000000000', password: '123456' });
assert.equal((await request('/api/driver/orders/active', driver.token)).activeOrder, null);
assert.equal((await request('/api/driver/stands/me', driver.token)).entry, null);
await request('/api/driver/status/online', driver.token, {});
const phone = `+7708${String(Date.now()).slice(-7)}`;
const sent = await request('/api/auth/sms/send', null, { phone, purpose: 'REGISTER' });
assert(sent.devCode);
const verified = await request('/api/auth/sms/verify', null, { phone, purpose: 'REGISTER', code: sent.devCode });
const rider = await request('/api/auth/register/password', null, { phone, name: 'QA web negotiation', password: '123456', verificationToken: verified.verificationToken });
const { chromium } = createRequire(import.meta.url)(process.env.QA_PLAYWRIGHT_PACKAGE || 'playwright');
const width = Number(process.env.QA_VIEWPORT_WIDTH || 320);
assert([320, 390].includes(width));
const output = path.join(os.tmpdir(), 'baisapar-web-negotiation-qa', String(width));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.QA_BROWSER_EXECUTABLE ? { executablePath: process.env.QA_BROWSER_EXECUTABLE } : {}) });
const errors = [];
async function pageFor(account, route) {
  const context = await browser.newContext({ viewport: { width, height: 820 } });
  await context.addInitScript(token => localStorage.setItem('smarttaxi_token', token), account.token);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(web + route);
  return page;
}
async function shot(page, name) {
  for (const selector of ['.negotiation-panel', '.negotiation-form', '.price-offer-card']) {
    for (const element of await page.locator(selector).all()) {
      const bounds = await element.boundingBox();
      if (bounds) assert(bounds.x >= -1 && bounds.x + bounds.width <= width + 1, `${selector} overflow`);
    }
  }
  await page.screenshot({ path: path.join(output, name + '.png') });
}
let order, fixturePool, fixtureUserId;
try {
  const d = await pageFor(driver, '/driver');
  const p = await pageFor(rider, '/order');
  for (const counterAccept of [false, true]) {
    order = (await request('/api/orders', rider.token, { riderName: 'QA торг', riderPhone: phone,
      pickupText: 'улица Бектасова, 12', dropoffText: 'улица Кожанова, 34', pickupLat: 40.8458, pickupLng: 68.5041,
      dropoffLat: 40.844435, dropoffLng: 68.509021, tariff: 'Economy', paymentMethod: 'CASH', distanceKm: 1, durationMin: 3 })).order;
    await p.reload();
    await d.getByRole('navigation', { name: 'Меню водителя' }).getByRole('button', { name: 'Заказы', exact: true }).click();
    const card = d.locator(`[data-order-id="${order.id}"]`);
    await card.getByRole('button', { name: 'Предложить цену', exact: true }).click();
    await card.getByLabel('Ваша цена, ₸', { exact: true }).fill('999999');
    await card.getByRole('button', { name: 'Предложить', exact: true }).click();
    await card.getByText('Введите целую сумму в указанном диапазоне.', { exact: true }).waitFor();
    const offered = Math.round(Number(order.price)) + 100;
    await card.getByLabel('Ваша цена, ₸', { exact: true }).fill(String(offered));
    await shot(d, 'driver-price-form');
    await card.getByRole('button', { name: 'Предложить', exact: true }).click();
    await p.getByRole('button', { name: 'Предложить свою цену', exact: true }).click();
    await p.getByLabel('Ваша цена, ₸', { exact: true }).fill(String(order.price));
    await shot(p, 'rider-counter-form');
    await p.getByRole('button', { name: 'Предложить', exact: true }).click();
    await p.getByRole('region', { name: 'Ваша встречная цена' }).waitFor();
    assert.equal(await p.locator('.price-offer-accept').count(), 0, 'Rider cannot accept own counter');
    const counter = card.getByRole('region', { name: 'Встречная цена пассажира' });
    await counter.waitFor();
    await counter.scrollIntoViewIfNeeded();
    await shot(d, 'driver-counter');
    await shot(p, 'rider-waiting');
    if (!counterAccept) {
      await counter.getByRole('button', { name: 'Отклонить', exact: true }).click();
      await p.locator('.price-offer-card').waitFor({ state: 'hidden' });
      await card.getByRole('button', { name: 'Предложить цену', exact: true }).click();
      await card.getByLabel('Ваша цена, ₸', { exact: true }).fill(String(offered));
      await card.getByRole('button', { name: 'Предложить', exact: true }).click();
      let writes = 0;
      await p.route(`**/api/orders/${order.id}/price-offer/respond`, async route => {
        writes++;
        const committed = await route.fetch(); assert(committed.ok());
        await route.abort('failed');
      });
      await p.locator('.price-offer-accept').click();
      await p.locator('.price-offer-card').waitFor({ state: 'hidden' });
      assert.equal(writes, 1, 'Lost acknowledgement cannot replay acceptance');
      console.log('Driver offer → rider counter → driver decline → new offer → rider accept, lost acknowledgement recovered');
    } else {
      let writes = 0;
      await d.route(`**/api/orders/${order.id}/price-offer/driver-respond`, async route => {
        writes++;
        const committed = await route.fetch(); assert(committed.ok());
        await route.abort('failed');
      });
      await counter.getByRole('button', { name: 'Согласиться', exact: true }).click();
      await d.getByRole('button', { name: 'Еду к клиенту', exact: true }).waitFor();
      assert.equal(writes, 1);
      console.log('Driver offer → rider counter → driver accept, lost acknowledgement recovered and active trip opened');
    }
    const active = (await request('/api/driver/orders/active', driver.token)).activeOrder;
    assert.equal(active.id, order.id);
    assert.equal(Number(active.price), counterAccept ? Number(order.price) : offered);
    await request(`/api/orders/${order.id}/cancel-public`, rider.token, { riderPhone: phone });
    order = null;
    await d.reload();
  }
  // Change the actual server offer after the click captured its displayed
  // terms, but before delivering that request. No mocked business responses.
  for (const driverDecision of [false, true]) {
    await request('/api/driver/status/online', driver.token, {});
    order = (await request('/api/orders', rider.token, { riderName: 'QA stale consent', riderPhone: phone,
      pickupText: 'улица Бектасова, 12', dropoffText: 'улица Кожанова, 34', pickupLat: 40.8458, pickupLng: 68.5041,
      dropoffLat: 40.844435, dropoffLng: 68.509021, tariff: 'Economy', paymentMethod: 'CASH', distanceKm: 1, durationMin: 3 })).order;
    const endpoint = `/api/orders/${order.id}/price-offer`;
    let offered = (await request(endpoint, driver.token, { priceKzt: 800 })).order;
    const snapshot = o => ({ driverId: o.driver_offer_by_driver_id, priceKzt: Number(o.driver_offer_price_kzt), proposedBy: o.driver_offer_proposed_by });
    if (driverDecision) offered = (await request(endpoint + '/counter', rider.token, { priceKzt: 700, expectedOffer: snapshot(offered) })).order;
    const page = driverDecision ? d : p;
    await page.reload();
    if (driverDecision) await d.getByRole('navigation', { name: 'Меню водителя' }).getByRole('button', { name: 'Заказы', exact: true }).click();
    const button = driverDecision
      ? d.locator(`[data-order-id="${order.id}"]`).getByRole('button', { name: 'Согласиться', exact: true })
      : p.locator('.price-offer-accept');
    await button.waitFor();
    const pattern = `**${endpoint}/${driverDecision ? 'driver-respond' : 'respond'}`;
    let writes = 0;
    await page.route(pattern, async route => {
      writes++;
      assert.deepEqual(route.request().postDataJSON().expectedOffer, snapshot(offered));
      let newer = (await request(endpoint, driver.token, { priceKzt: 900 })).order;
      if (driverDecision) newer = (await request(endpoint + '/counter', rider.token, { priceKzt: 750, expectedOffer: snapshot(newer) })).order;
      const refused = await route.fetch();
      assert.equal(refused.status(), 409);
      assert.equal((await refused.json()).error, 'PRICE_OFFER_CHANGED');
      await route.fulfill({ response: refused });
    });
    await button.click();
    await page.getByText('Предложение изменилось. Проверьте новую цену и подтвердите её отдельно.', { exact: true }).waitFor();
    assert.equal(writes, 1, 'A conflict must not retry consent');
    const current = (await request('/api/orders/me/active', rider.token)).order;
    assert.equal(current.driver_id, null, 'Stale click cannot assign a new price');
    assert.equal(Number(current.driver_offer_price_kzt), driverDecision ? 750 : 900);
    await shot(page, driverDecision ? 'driver-price-changed' : 'rider-price-changed');
    await page.unroute(pattern);
    await button.click();
    if (driverDecision) await d.getByRole('button', { name: 'Еду к клиенту', exact: true }).waitFor();
    else await p.locator('.price-offer-card').waitFor({ state: 'hidden' });
    const assigned = (await request('/api/driver/orders/active', driver.token)).activeOrder;
    assert.equal(assigned.id, order.id);
    assert.equal(Number(assigned.price), driverDecision ? 750 : 900);
    await request(`/api/orders/${order.id}/cancel-public`, rider.token, { riderPhone: phone });
    order = null;
    await d.reload();
    console.log(`${driverDecision ? 'Driver' : 'Rider'} stale click refused; refreshed price needs a separate explicit acceptance`);
  }
  if (process.env.STAND_QA_DATABASE_URL) {
    const dbUrl = new URL(process.env.STAND_QA_DATABASE_URL);
    assert(['localhost', '127.0.0.1', '[::1]'].includes(dbUrl.hostname));
    const require = createRequire(import.meta.url);
    const { Pool } = require('pg');
    const bcrypt = require('bcryptjs');
    fixturePool = new Pool({ connectionString: dbUrl.toString(), max: 1 });
    const profile = (await request('/api/driver/profile', driver.token)).driver;
    assert.equal((await fixturePool.query('SELECT id FROM drivers WHERE id=$1', [profile.id])).rowCount, 1, 'QA DB must contain the authenticated local seed driver');
    const secondPhone = `+7707${String(Date.now()).slice(-7)}`;
    // A new local fixture account, never an existing user's role or token.
    // Authenticate through the normal password API below, not a forged JWT.
    fixtureUserId = (await fixturePool.query("INSERT INTO users(name,phone,password_hash,role) VALUES('QA second negotiation',$1,$2,'DRIVER') RETURNING id", [secondPhone, await bcrypt.hash('123456', 10)])).rows[0].id;
    const secondDriver = (await fixturePool.query("INSERT INTO drivers(user_id,name,phone,car_model,plate,status,current_region_id) VALUES($1,'QA второй водитель',$2,'QA car',$2,'FREE',$3) RETURNING id", [fixtureUserId, secondPhone, profile.currentRegionId])).rows[0];
    await fixturePool.query("INSERT INTO driver_region_approvals(driver_id,region_id,status,approved_at) VALUES($1,$2,'APPROVED',NOW())", [secondDriver.id, profile.currentRegionId]);
    const second = await request('/api/auth/login/password', null, { phone: secondPhone, password: '123456' });
    order = (await request('/api/orders', rider.token, { riderName: 'QA очередь цен', riderPhone: phone,
      pickupText: 'улица Бектасова, 12', dropoffText: 'улица Кожанова, 34', pickupLat: 40.8458, pickupLng: 68.5041,
      dropoffLat: 40.844435, dropoffLng: 68.509021, tariff: 'Economy', paymentMethod: 'CASH', distanceKm: 1, durationMin: 3 })).order;
    await p.reload();
    await request(`/api/orders/${order.id}/price-offer`, driver.token, { priceKzt: Number(order.price) + 100 });
    await request(`/api/orders/${order.id}/price-offer`, second.token, { priceKzt: Number(order.price) });
    const alternatives = p.getByRole('region', { name: 'Другие предложения' });
    await alternatives.waitFor();
    await alternatives.scrollIntoViewIfNeeded();
    await shot(p, 'rider-queued-offers');
    await p.reload();
    await alternatives.getByRole('button', { name: /Рассмотреть за/ }).click();
    await alternatives.waitFor({ state: 'hidden' });
    let current = (await request('/api/orders/me/active', rider.token)).order;
    assert.equal(current.driver_id, null, 'Reviewing an offer must not assign the trip');
    assert.equal(current.driver_offer_by_driver_id, secondDriver.id);
    await p.locator('.price-offer-accept').click();
    await p.locator('.price-offer-card').waitFor({ state: 'hidden' });
    current = (await request('/api/orders/me/active', rider.token)).order;
    assert.equal(current.driver_id, secondDriver.id);
    assert.equal(Number(current.price), Number(order.price));
    await request(`/api/orders/${order.id}/cancel-public`, rider.token, { riderPhone: phone });
    order = null;
    console.log('Second driver queue survives reload; review is not assignment; explicit acceptance assigns the selected driver');
  }
  assert.deepEqual(errors, []);
  console.log(`Real two-session negotiation QA ${width}px passed. ${output}`);
} finally {
  await browser.close();
  if (order) await request(`/api/orders/${order.id}/cancel-public`, rider.token, { riderPhone: phone });
  if (fixturePool) {
    try {
      if (fixtureUserId) {
        await fixturePool.query("UPDATE drivers SET status='OFFLINE',is_blocked=true WHERE user_id=$1", [fixtureUserId]);
        await fixturePool.query('UPDATE users SET is_active=false WHERE id=$1', [fixtureUserId]);
      }
    } finally { await fixturePool.end(); }
  }
}
