import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Hold an old authenticated request until after a second real login. The
// backend itself returns SESSION_SUPERSEDED; no tokens/responses are forged.
const base = process.env.QA_WEB_URL || 'http://127.0.0.1:5175';
const apiBase = process.env.QA_API_URL || 'http://127.0.0.1:4001';
for (const url of [base, apiBase]) assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname));
const ready = await (await fetch(`${apiBase}/api/health/ready`)).json();
assert.equal(ready.env, 'development');
assert.equal(ready.status, 'ok');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QA_PLAYWRIGHT_PACKAGE || 'playwright');
const output = process.env.QA_OUTPUT_DIR || path.join(os.tmpdir(), 'smarttaxi-driver-session-qa');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  ...(process.env.QA_BROWSER_EXECUTABLE ? { executablePath: process.env.QA_BROWSER_EXECUTABLE } : {}) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['geolocation'],
  geolocation: { latitude: 40.8458, longitude: 68.5041, accuracy: 8 } });
const page = await context.newPage();
const evidence = [];
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let heldRoute;
async function login() {
  await page.getByLabel('Телефон', { exact: true }).fill(process.env.QA_DRIVER_PHONE || '+77000000000');
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.QA_DRIVER_PASSWORD || '123456');
  const response = page.waitForResponse(response => response.url().endsWith('/api/auth/login/password'));
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  const payload = await (await response).json();
  assert.equal(payload.user?.role, 'DRIVER');
  await page.getByRole('navigation', { name: 'Меню водителя' }).waitFor();
  await page.locator('.driver-core-loading').waitFor({ state: 'hidden' });
  return payload.token;
}
try {
  await page.goto(`${base}/driver`);
  const oldToken = await login();
  const active = await (await fetch(`${apiBase}/api/driver/orders/active`, { headers: { Authorization: `Bearer ${oldToken}` } })).json();
  assert.equal(active.activeOrder, null, 'Session QA refuses an unrelated active trip');
  let resolveHeld;
  const held = new Promise(resolve => { resolveHeld = resolve; });
  await page.route('**/api/driver/profile', async route => {
    if (!heldRoute && route.request().headers().authorization === `Bearer ${oldToken}`) {
      heldRoute = route;
      resolveHeld();
    } else await route.continue();
  });
  // The existing 15-second reconciliation sends a genuine old-session request.
  await Promise.race([held, new Promise((_, reject) => setTimeout(() => reject(new Error('No old profile refresh was held')), 25000))]);
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  const newToken = await login();
  assert(newToken !== oldToken, 'Backend login rotates the session token');
  const staleResponse = page.waitForResponse(response => response.url().endsWith('/api/driver/profile') && response.request().headers().authorization === `Bearer ${oldToken}`);
  await heldRoute.continue();
  const response = await staleResponse;
  assert.equal(response.status(), 401);
  assert.equal((await response.json()).error, 'SESSION_SUPERSEDED');
  evidence.push({ step: 'actual_old_session_rejected_after_new_login', status: response.status() });
  // Drain the real fetch reaction and React's resulting render, not only the
  // earlier network response event fired by the browser automation library.
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(output, 'late-old-session.png'), animations: 'disabled' });
  assert((await page.evaluate(() => localStorage.getItem('smarttaxi_token'))) === newToken,
    'A stale response must not erase the newly authenticated session');
  assert(await page.getByRole('navigation', { name: 'Меню водителя' }).isVisible());
  assert.equal(await page.getByLabel('Пароль', { exact: true }).count(), 0);
  assert.equal(await page.locator('.driver-core-error').count(), 0, 'The old failed profile refresh must not enter the new screen');
  evidence.push({ step: 'new_session_and_driver_screen_preserved' });

  // Positive security control: a separate real local login still revokes the
  // browser's current session. This is not an authentication bypass.
  const replacement = await fetch(`${apiBase}/api/auth/login/password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: process.env.QA_DRIVER_PHONE || '+77000000000',
      password: process.env.QA_DRIVER_PASSWORD || '123456' })
  });
  assert.equal(replacement.status, 200);
  await page.getByLabel('Пароль', { exact: true }).waitFor({ timeout: 20000 });
  assert.equal(await page.evaluate(() => localStorage.getItem('smarttaxi_token')), null);
  assert.equal(await page.getByLabel('Пароль', { exact: true }).inputValue(), '', 'Logout clears the password field');
  assert.deepEqual(errors, []);
  evidence.push({ step: 'actual_current_session_supersession_still_logs_out' }, { step: 'passed' });
  console.log('Session isolation smoke passed');
} finally {
  await browser.close();
  await writeFile(path.join(output, 'result.json'), JSON.stringify(evidence, null, 2));
}
