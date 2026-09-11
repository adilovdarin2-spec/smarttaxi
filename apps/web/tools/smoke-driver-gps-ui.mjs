import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Real local driver auth and Chromium permission denial. Only the named GPS
// failure response is injected; successful writes always reach the local API.
const base = process.env.QA_WEB_URL || 'http://127.0.0.1:5175';
const apiBase = process.env.QA_API_URL || 'http://127.0.0.1:4001';
for (const url of [base, apiBase]) {
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname), 'Local QA only');
}
const health = await (await fetch(`${apiBase}/api/health/ready`)).json();
assert.equal(health.env, 'development');
assert.equal(health.status, 'ok');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QA_PLAYWRIGHT_PACKAGE || 'playwright');
const output = process.env.QA_OUTPUT_DIR || path.join(os.tmpdir(), 'smarttaxi-driver-gps-qa');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  ...(process.env.QA_BROWSER_EXECUTABLE ? { executablePath: process.env.QA_BROWSER_EXECUTABLE } : {}) });
const context = await browser.newContext({ viewport: { width: 360, height: 740 }, permissions: [],
  geolocation: { latitude: 40.8458, longitude: 68.5041, accuracy: 8 } });
await context.addInitScript(() => {
  const watch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
  const clear = navigator.geolocation.clearWatch.bind(navigator.geolocation);
  window.driverQaWatches = new Set();
  navigator.geolocation.watchPosition = (...args) => {
    const id = watch(...args); window.driverQaWatches.add(id); return id;
  };
  navigator.geolocation.clearWatch = id => { window.driverQaWatches.delete(id); clear(id); };
});
const page = await context.newPage();
const errors = [];
const evidence = [];
let token;
let initialStatus;
let statusChanged = false;
let locationWrites = 0;
const locationPattern = '**/api/drivers/me/location';
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (new URL(request.url()).pathname === '/api/drivers/me/location') locationWrites++;
});
const mark = step => { evidence.push({ step }); console.log(step); };
async function api(endpoint, options = {}) {
  const response = await fetch(`${apiBase}${endpoint}`, { ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
  const payload = await response.json();
  assert(response.ok, `Local API ${endpoint}: ${response.status}`);
  return payload;
}
async function shot(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.map-loading-chip').waitFor({ state: 'hidden', timeout: 30000 });
  await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
}
async function assertNoticeFits() {
  const notice = page.locator('.driver-core-location-notice');
  await notice.scrollIntoViewIfNeeded();
  for (const element of [notice, notice.getByRole('button')]) {
    const box = await element.boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= 361 && box.y >= 0 && box.y + box.height <= 741,
      'GPS warning and retry fit the compact viewport');
  }
}
try {
  await page.goto(`${base}/driver`);
  assert.equal(await page.evaluate(async () => (await navigator.permissions.query({ name: 'geolocation' })).state), 'denied');
  await page.getByLabel('Телефон', { exact: true }).fill(process.env.QA_DRIVER_PHONE || '+77000000000');
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.QA_DRIVER_PASSWORD || '123456');
  const loginResponse = page.waitForResponse(response => response.url().endsWith('/api/auth/login/password'));
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  const login = await (await loginResponse).json();
  assert.equal(login.user?.role, 'DRIVER');
  token = login.token;
  await page.getByRole('navigation', { name: 'Меню водителя' }).waitFor();
  await page.locator('.driver-core-loading').waitFor({ state: 'hidden' });
  const initial = await api('/api/driver/orders/active');
  assert.equal(initial.activeOrder, null, 'Refuse to alter an unrelated active trip');
  initialStatus = initial.driver.publicStatus || initial.driver.status;
  if (!['ONLINE', 'FREE'].includes(initialStatus)) {
    await page.getByRole('button', { name: 'Выйти на линию', exact: true }).click();
    statusChanged = true;
  }
  await page.getByRole('button', { name: 'Уйти с линии', exact: true }).waitFor();
  await page.waitForFunction(() => window.driverQaWatches.size === 1);
  await shot('gps-denied');
  await page.getByRole('heading', { name: 'Разрешите геолокацию', exact: true }).waitFor({ timeout: 4000 });
  await assertNoticeFits();
  assert.equal(locationWrites, 0, 'Permission denial must not invent a location write');
  await shot('gps-denied');
  mark('real_browser_permission_denial_is_visible');
  for (const name of ['Заказы', 'Поездка', 'Дорога', 'Доход']) {
    await page.getByRole('navigation', { name: 'Меню водителя' }).getByRole('button', { name, exact: true }).click();
    await assertNoticeFits();
    if (name === 'Дорога') {
      assert(await page.getByRole('button', { name: 'Сообщить', exact: true }).isDisabled(),
        'Cannot place a road event without a real location');
      await shot('gps-denied-road');
    }
  }
  await page.getByRole('navigation', { name: 'Меню водителя' }).getByRole('button', { name: 'Линия', exact: true }).click();
  mark('gps_recovery_remains_reachable_on_all_five_tabs');

  // Test permission grant is limited to this isolated browser context, not
  // the connected phone or the user's browser profile.
  await context.grantPermissions(['geolocation']);
  const firstWrite = page.waitForResponse(response => response.url().endsWith('/api/drivers/me/location') && response.status() === 200);
  await page.getByRole('button', { name: 'Повторить GPS', exact: true }).click();
  await firstWrite;
  await page.locator('.driver-core-location-notice').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.driverQaWatches.size), 1);
  await shot('gps-recovered');
  mark('permission_retry_recovers_one_watch_and_real_publication');

  await page.route(locationPattern, route => route.fulfill({ status: 503, contentType: 'application/json',
    body: JSON.stringify({ error: 'SERVICE_UNAVAILABLE' }) }));
  await context.setGeolocation({ latitude: 40.8458, longitude: 68.5044, accuracy: 8 });
  await page.getByRole('heading', { name: 'Координаты не отправлены', exact: true }).waitFor({ timeout: 25000 });
  await assertNoticeFits();
  await shot('gps-publication-failed');
  mark('failed_publication_is_not_silent');
  await page.unroute(locationPattern);
  const recoveredWrite = page.waitForResponse(response => response.url().endsWith('/api/drivers/me/location') && response.status() === 200);
  await page.getByRole('button', { name: 'Повторить GPS', exact: true }).click();
  const recovered = await (await recoveredWrite).json();
  assert.equal(Number(recovered.location.lng), 68.5044);
  await page.locator('.driver-core-location-notice').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.driverQaWatches.size), 1);
  mark('publication_retry_uses_latest_real_fix');

  await page.getByRole('button', { name: 'Уйти с линии', exact: true }).click();
  statusChanged = true;
  await page.getByRole('button', { name: 'Выйти на линию', exact: true }).waitFor();
  await page.waitForFunction(() => window.driverQaWatches.size === 0);
  assert.equal(await page.locator('.driver-core-location-notice').count(), 0);
  const after = await api('/api/driver/orders/active');
  assert.equal(after.activeOrder, null);
  assert.equal(after.driver.publicStatus || after.driver.status, 'OFFLINE');
  mark('going_offline_disposes_tracking_and_notice');
  assert.deepEqual(errors, []);
  mark('passed');
} catch (error) {
  await shot('failure').catch(() => {});
  throw error;
} finally {
  await browser.close();
  if (token && statusChanged && initialStatus) {
    const current = await api('/api/driver/orders/active');
    assert.equal(current.activeOrder, null, 'Do not restore status over a newly assigned order');
    await api(`/api/driver/status/${['ONLINE', 'FREE'].includes(initialStatus) ? 'online' : 'offline'}`, { method: 'POST' });
  }
  await writeFile(path.join(output, 'result.json'), JSON.stringify(evidence, null, 2));
}
