import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Real local API writes. Fault injection drops the browser acknowledgement
// only AFTER the server has accepted a seat; it never fabricates a booking.
const api = process.env.QA_API_URL || 'http://127.0.0.1:4001';
const web = process.env.QA_WEB_URL || 'http://127.0.0.1:5175';
for (const value of [api, web]) assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname));
async function request(endpoint, { token, method = 'GET', body } = {}) {
  const response = await fetch(api + endpoint, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  assert(response.ok, `${endpoint}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
const health = await request('/api/health/ready');
assert.equal(health.env, 'development');
assert.equal(health.checks.sms, 'dev');
const owner = await request('/api/auth/login/password', { method: 'POST', body: { phone: '+77000000099', password: 'ChangeMe_2026!' } });
const { chromium } = createRequire(import.meta.url)(process.env.QA_PLAYWRIGHT_PACKAGE || 'playwright');
const width = Number(process.env.QA_VIEWPORT_WIDTH || 360);
assert([320, 360, 390].includes(width));
const output = path.join(os.tmpdir(), 'baisapar-stand-recovery-qa', String(width));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  ...(process.env.QA_BROWSER_EXECUTABLE ? { executablePath: process.env.QA_BROWSER_EXECUTABLE } : {}) });
const context = await browser.newContext({ viewport: { width, height: 740 },
  geolocation: { latitude: 40.8458, longitude: 68.5041, accuracy: 8 }, permissions: ['geolocation'] });
const page = await context.newPage();
async function screenshot(target, name) {
  for (const element of await target.locator('.driver-stand-place, .driver-core-error, .client-stand-reservation, .client-stand-sheet').all()) {
    const bounds = await element.boundingBox();
    if (bounds) assert(bounds.x >= -1 && bounds.x + bounds.width <= width + 1, `Stand control overflows ${width}px`);
  }
  await target.screenshot({ path: path.join(output, name + '.png') });
}
const errors = [];
page.on('pageerror', error => errors.push(error.message));
// React boundaries catch render/cleanup failures before window.pageerror.
function captureBoundaryErrors(target) {
  target.on('console', message => {
    if (message.type() === 'error' && /TypeError|ReferenceError|Minified React error|application render failed/i.test(message.text())) {
      errors.push(message.text());
      console.error('Browser caught exception:', message.text());
    }
  });
}
captureBoundaryErrors(page);
let driver, stand, entry;
try {
  await page.goto(web + '/driver');
  await page.getByLabel('Телефон', { exact: true }).fill('+77000000000');
  await page.getByLabel('Пароль', { exact: true }).fill('123456');
  const login = page.waitForResponse(r => r.url().endsWith('/api/auth/login/password'));
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  driver = await (await login).json();
  assert.equal((await request('/api/driver/orders/active', { token: driver.token })).activeOrder, null, 'Do not disturb an existing trip');
  assert.equal((await request('/api/driver/stands/me', { token: driver.token })).entry, null, 'Do not disturb an existing queue');
  await page.locator('.driver-core-region-card select').selectOption({ label: 'Атакент' });
  const online = page.getByRole('button', { name: 'Выйти на линию', exact: true });
  if (await online.count()) await online.click();
  await page.getByRole('button', { name: 'Уйти с линии', exact: true }).waitFor();
  const { regions } = await request('/api/regions/active');
  const region = regions.find(r => r.code === 'ATAKENT');
  ({ stand } = await request('/api/admin/stands', { token: owner.token, method: 'POST', body: {
    name: `QA восстановление ${Date.now()}`, regionId: region.id, kind: 'INTERCITY',
    lat: 40.8458, lng: 68.5041, radiusM: 150, boardingSlots: 1, defaultSeats: 4 } }));
  await page.getByRole('navigation', { name: 'Меню водителя' }).getByRole('button', { name: 'Стоянка', exact: true }).click();
  const card = page.locator('.driver-stand-card').filter({ hasText: stand.name });
  await card.getByRole('button', { name: 'Встать в очередь', exact: true }).click();
  await card.getByLabel('Направление', { exact: true }).fill('Шымкент');
  await card.getByLabel('Цена за место, ₸', { exact: true }).fill('2500');
  // The driver's offer may stay open while accuracy deteriorates. The final
  // submit must be gated too, not only the button that opened the form.
  await context.setGeolocation({ latitude: 40.8458, longitude: 68.5041, accuracy: 500 });
  await card.getByText('Включите геолокацию, чтобы встать в очередь', { exact: true }).waitFor();
  assert(await card.getByRole('button', { name: 'Встать в очередь', exact: true }).isDisabled());
  assert.equal((await request('/api/driver/stands/me', { token: driver.token })).entry, null);
  await card.getByText('Включите геолокацию, чтобы встать в очередь', { exact: true }).scrollIntoViewIfNeeded();
  await screenshot(page, 'driver-offer-needs-accurate-gps');
  await context.setGeolocation({ latitude: 40.8458, longitude: 68.5041, accuracy: 8 });
  await card.getByRole('button', { name: 'Встать в очередь', exact: true }).click();
  await page.locator('.driver-stand-place').waitFor();
  ({ entry } = await request('/api/driver/stands/me', { token: driver.token }));
  assert.equal(entry.standId, stand.id);
  const seatsPath = `**/api/driver/stands/entries/${entry.id}/seats`;
  let posts = 0;
  let blockReads = false;
  await page.route('**/api/driver/stands/me', route => blockReads
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'QA_READ_UNAVAILABLE', message: 'Проверка потери связи' }) })
    : route.continue());
  await page.route(seatsPath, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    posts++;
    console.log('Injecting lost seat acknowledgement');
    blockReads = true;
    const response = await route.fetch();
    assert(response.ok(), 'The server must really record this seat');
    console.log('Seat committed; dropping acknowledgement');
    await route.abort('failed');
  });
  await page.getByRole('button', { name: '+1 место', exact: true }).click();
  await page.getByText('Данные стоянки не подтверждены.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Обновить стоянки', exact: true }).scrollIntoViewIfNeeded();
  assert(await page.getByRole('button', { name: '+1 место', exact: true }).isDisabled());
  assert.equal((await request('/api/driver/stands/me', { token: driver.token })).entry.takenSeats, 1);
  assert.equal(posts, 1, 'A failed acknowledgement cannot replay POST');
  await screenshot(page, 'driver-uncertain-seat');
  blockReads = false;
  await page.getByRole('button', { name: 'Обновить стоянки', exact: true }).click();
  await page.locator('.driver-stand-seats strong').filter({ hasText: '1 из 4' }).waitFor();
  assert.equal(posts, 1);
  await page.unroute(seatsPath);
  await page.getByRole('button', { name: '+1 место', exact: true }).click();
  await page.locator('.driver-stand-seats strong').filter({ hasText: '2 из 4' }).waitFor();
  await page.getByRole('button', { name: 'Освободить место', exact: true }).click();
  await page.locator('.driver-stand-seats strong').filter({ hasText: '1 из 4' }).waitFor();
  await screenshot(page, 'driver-recovered-seat');

  const phone = `+7708${String(Date.now()).slice(-7)}`;
  const sent = await request('/api/auth/sms/send', { method: 'POST', body: { phone, purpose: 'REGISTER' } });
  assert(sent.devCode);
  const verified = await request('/api/auth/sms/verify', { method: 'POST', body: { phone, purpose: 'REGISTER', code: sent.devCode } });
  const account = await request('/api/auth/register/password', { method: 'POST', body: { phone, name: 'QA стоянки', password: '123456', verificationToken: verified.verificationToken } });
  const riderContext = await browser.newContext({ viewport: { width, height: 740 } });
  await riderContext.addInitScript(token => localStorage.setItem('smarttaxi_token', token), account.token);
  const rider = await riderContext.newPage();
  rider.on('pageerror', error => errors.push(error.message));
  captureBoundaryErrors(rider);
  await rider.goto(web + '/order');
  await rider.getByRole('button', { name: 'Открыть меню', exact: true }).click();
  await rider.locator('.client-drawer-nav button').filter({ has: rider.getByText('Стоянки', { exact: true }) }).click();
  await rider.locator('.client-stand-row').filter({ hasText: stand.name }).click();
  const reservePath = `**/api/stands/entries/${entry.id}/reserve`;
  let reservations = 0;
  await rider.route(reservePath, async route => {
    reservations++;
    const response = await route.fetch();
    assert(response.ok());
    await route.abort('failed');
  });
  await rider.getByLabel('Сколько мест', { exact: true }).selectOption('3');
  await rider.getByRole('button', { name: 'Забронировать место', exact: true }).click();
  await rider.getByText('Ваша бронь на стоянке', { exact: true }).waitFor();
  await rider.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(reservations, 1);
  assert.equal((await request('/api/stands/reservations/me', { token: account.token })).reservation.status, 'PENDING');
  await screenshot(rider, 'rider-reservation-recovered');
  await page.getByText('Ожидают подтверждения: 3 места', { exact: true }).waitFor();
  assert(await page.getByRole('button', { name: '+1 место', exact: true }).isDisabled());
  const held = (await request('/api/driver/stands/me', { token: driver.token })).entry;
  assert.equal(held.pendingSeats, 3);
  assert.equal(held.freeSeats, 0);
  await page.locator('.driver-stand-seats').scrollIntoViewIfNeeded();
  await screenshot(page, 'driver-all-capacity-held');
  await page.locator('.driver-stand-request').getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await page.locator('.driver-stand-seats strong').filter({ hasText: '4 из 4' }).waitFor();
  await page.getByRole('button', { name: 'Освободить место', exact: true }).click();
  await page.locator('.driver-stand-seats strong').filter({ hasText: '3 из 4' }).waitFor();
  assert(await page.getByRole('button', { name: 'Освободить место', exact: true }).isDisabled());
  await page.locator('.driver-stand-seats').scrollIntoViewIfNeeded();
  await screenshot(page, 'driver-app-seats-protected');
  await rider.getByRole('button', { name: 'Отменить бронь', exact: true }).click();
  await rider.getByText('Ваша бронь на стоянке', { exact: true }).waitFor({ state: 'hidden' });
  await page.locator('.driver-stand-seats strong').filter({ hasText: '0 из 4' }).waitFor();
  // A real null-coordinate heartbeat cannot keep a car in the queue forever.
  // No mocked API response here: verify the persisted timestamp via GET/me.
  const heartbeat = page.waitForResponse(response => response.url().endsWith('/api/driver/stands/presence') &&
    response.request().method() === 'POST' && response.request().postDataJSON()?.lat === null,
    { timeout: 35000 });
  await context.setGeolocation({ latitude: 40.8458, longitude: 68.5041, accuracy: 500 });
  await page.getByText('Не удалось подтвердить геолокацию.', { exact: false }).waitFor();
  const beforePresence = (await request('/api/driver/stands/me', { token: driver.token })).entry.lastSeenAt;
  assert(beforePresence);
  assert.equal((await (await heartbeat).json()).presence.inside, null);
  const afterPresence = (await request('/api/driver/stands/me', { token: driver.token })).entry.lastSeenAt;
  assert.equal(afterPresence, beforePresence, 'An unknown position cannot refresh last_seen_at');
  await screenshot(page, 'driver-presence-needs-gps');
  await context.setGeolocation({ latitude: 40.8458, longitude: 68.5041, accuracy: 8 });
  await page.getByText('Не удалось подтвердить геолокацию.', { exact: false }).waitFor({ state: 'hidden' });

  // Owner closure must clear the live driver/rider screens and cancel an
  // actual confirmed booking, without either client pressing refresh.
  await rider.unroute(reservePath);
  await rider.locator('.client-stand-row').filter({ hasText: stand.name }).click();
  await rider.getByLabel('Сколько мест', { exact: true }).selectOption('1');
  await rider.getByRole('button', { name: 'Забронировать место', exact: true }).click();
  await rider.getByText('Ваша бронь на стоянке', { exact: true }).waitFor();
  await page.locator('.driver-stand-request').getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await page.locator('.driver-stand-seats strong').filter({ hasText: '1 из 4' }).waitFor();
  assert.equal((await request('/api/stands/reservations/me', { token: account.token })).reservation.status, 'CONFIRMED');
  await request(`/api/admin/stands/${stand.id}`, { token: owner.token, method: 'PATCH', body: { isActive: false } });
  await page.locator('.driver-stand-place').waitFor({ state: 'hidden' });
  await rider.getByText('Ваша бронь на стоянке', { exact: true }).waitFor({ state: 'hidden' });
  await rider.locator('.client-stand-row').filter({ hasText: stand.name }).waitFor({ state: 'hidden' });
  await rider.locator('.client-stands').waitFor({ state: 'visible' });
  assert.equal(await rider.getByRole('heading', { name: 'Не удалось открыть экран' }).count(), 0);
  assert.equal((await request('/api/driver/stands/me', { token: driver.token })).entry, null);
  assert.equal((await request('/api/stands/reservations/me', { token: account.token })).reservation, null);
  await screenshot(page, 'driver-owner-closed-stand');
  await screenshot(rider, 'rider-owner-cancelled-booking');
  assert.deepEqual(errors, []);
  console.log('Stand browser recovery passed: accurate-GPS join gate, real committed seat, failed acknowledgement/read, guarded refresh, passenger reservation recovery/cancellation, unknown-GPS heartbeat, owner closure clears driver and confirmed rider booking. Screenshots: ' + output);
} catch (error) {
  console.error('Stand QA failed', error.message, await page.locator('body').innerText());
  await page.screenshot({ path: path.join(output, 'failure.png') });
  throw error;
} finally {
  if (entry && driver) {
    const mine = await request('/api/driver/stands/me', { token: driver.token });
    if (mine.entry?.id === entry.id) await request(`/api/driver/stands/entries/${entry.id}/leave`, { token: driver.token, method: 'POST' });
  }
  if (stand) await request(`/api/admin/stands/${stand.id}`, { token: owner.token, method: 'DELETE' });
  await browser.close();
}
