import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const base = process.env.QA_API_URL || 'http://127.0.0.1:4001';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname));
async function call(endpoint, token, body, status = 200, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + endpoint, { method, headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  const data = await response.json();
  assert.equal(response.status, status, `${endpoint}: ${JSON.stringify(data)}`);
  return data;
}
const health = await call('/api/health/ready');
assert.equal(health.env, 'development'); assert.equal(health.checks.sms, 'dev');
async function register(prefix) {
  const phone = `+770${prefix}${String(Date.now()).slice(-7)}`;
  const sent = await call('/api/auth/sms/send', null, { phone, purpose: 'REGISTER' });
  const verified = await call('/api/auth/sms/verify', null, { phone, purpose: 'REGISTER', code: sent.devCode });
  return { phone, ...(await call('/api/auth/register/password', null, { phone, name: 'QA onboarding', password: '123456', verificationToken: verified.verificationToken }, 201)) };
}
const owner = await call('/api/auth/login/password', null, { phone: '+77000000099', password: 'ChangeMe_2026!' });
const applicant = await register('4');
const stranger = await register('3');
const region = (await call('/api/regions/active')).regions.find(r => r.code === 'ATAKENT');
assert(region);
const body = { fullName: `QA onboarding ${Date.now()}`, phone: applicant.phone, carModel: 'QA synthetic car', plateNumber: 'QA ONLY', comment: 'Local synthetic test, not real identity/document approval' };
let application, driverId, driverToken, browser;
try {
  await call('/api/admin/driver-applications', null, body, 401);
  assert.equal((await call('/api/admin/driver-applications', stranger.token, body, 400)).error, 'APPLICATION_PHONE_MISMATCH');
  assert.equal((await call('/api/admin/driver-applications/mine', applicant.token)).application, null);
  const concurrent = await Promise.all([1, 2].map(() => call('/api/admin/driver-applications', applicant.token, body, 201)));
  application = concurrent[0].application;
  assert.equal(concurrent[1].application.id, application.id);
  assert.equal(application.status, 'PENDING');
  assert.equal(application.user_id, applicant.user.id);
  assert.equal((await call('/api/admin/driver-applications/mine', stranger.token)).application, null);
  const endpoint = `/api/admin/driver-applications/${application.id}`;
  await call(endpoint, applicant.token, { status: 'APPROVED', regionId: region.id }, 403, 'PATCH');
  await call(`/api/driver-applications/${application.id}/documents`, null, undefined, 401);
  await call(`/api/driver-applications/${application.id}/documents`, stranger.token, undefined, 404);
  const form = () => { const data = new FormData(); data.set('type', 'OTHER'); data.set('file', new Blob(['Local QA fixture, not an identity document'], { type: 'application/pdf' }), 'QA-ONLY.pdf'); return data; };
  await call(`/api/driver-applications/${application.id}/documents`, stranger.token, form(), 404);
  const document = (await call(`/api/driver-applications/${application.id}/documents`, applicant.token, form(), 201)).document;
  assert.equal((await call(`/api/driver-applications/${application.id}/documents`, applicant.token)).documents[0].id, document.id);
  await call(endpoint, owner.token, { status: 'NEEDS_INFO', comment: 'QA: correct car' }, 200, 'PATCH');
  const corrected = (await call('/api/admin/driver-applications', applicant.token, { ...body, carModel: 'QA corrected car' }, 201)).application;
  assert.equal(corrected.id, application.id); assert.equal(corrected.car_model, 'QA corrected car');
  assert.equal((await call(endpoint, owner.token, { status: 'APPROVED' }, 400, 'PATCH')).error, 'APPLICATION_REGION_REQUIRED');
  let page;
  if (process.env.QA_PLAYWRIGHT_PACKAGE) {
    const web = process.env.QA_WEB_URL || 'http://127.0.0.1:5175';
    assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(web).hostname));
    const { chromium } = createRequire(import.meta.url)(process.env.QA_PLAYWRIGHT_PACKAGE);
    browser = await chromium.launch({ headless: true, executablePath: process.env.QA_BROWSER_EXECUTABLE });
    const context = await browser.newContext({ viewport: { width: Number(process.env.QA_VIEWPORT_WIDTH || 390), height: 844 } });
    await context.addInitScript(token => localStorage.setItem('smarttaxi_token', token), applicant.token);
    page = await context.newPage();
    const applicantErrors = [];
    page.on('pageerror', error => applicantErrors.push(error.message));
    await page.goto(web + '/order');
    await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
    await page.locator('.client-drawer-nav button').filter({ has: page.getByText('Стать водителем', { exact: true }) }).click();
    await page.getByRole('heading', { name: 'Заявка на проверке', exact: true }).waitFor();
    await page.getByText('QA-ONLY.pdf', { exact: true }).waitFor();
    const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await adminContext.addInitScript(token => localStorage.setItem('smarttaxi_token', token), owner.token);
    const admin = await adminContext.newPage();
    const ownerErrors = [];
    admin.on('pageerror', error => ownerErrors.push(error.message));
    admin.on('console', message => { if (message.type() === 'error') ownerErrors.push(message.text()); });
    await admin.goto(web + '/admin');
    await admin.locator('.admin-control-sidebar nav button').filter({ has: admin.getByText('Заявки', { exact: true }) }).click();
    await admin.locator('.admin-table-row.applications').filter({ hasText: body.fullName }).getByRole('button', { name: 'Открыть', exact: true }).click();
    const approve = admin.locator('.admin-modal-actions').getByRole('button', { name: 'Одобрить', exact: true });
    assert(await approve.isDisabled(), 'Owner must explicitly choose region');
    await admin.getByText('QA-ONLY.pdf', { exact: true }).waitFor();
    assert.deepEqual(ownerErrors, [], 'Owner application must render documents without crashing');
    await admin.getByLabel('Регион допуска', { exact: true }).selectOption(region.id);
    await admin.getByLabel('Регион допуска', { exact: true }).scrollIntoViewIfNeeded();
    const output = path.join(os.tmpdir(), 'onedriver-driver-onboarding-qa'); await mkdir(output, { recursive: true });
    await admin.screenshot({ path: path.join(output, 'owner-region.png') });
    await approve.click();
    await admin.getByLabel('Регион допуска', { exact: true }).waitFor({ state: 'hidden' });
    assert.deepEqual(ownerErrors, []);
    await page.getByRole('button', { name: 'Обновить статус', exact: true }).click();
    await page.getByRole('heading', { name: 'Заявка одобрена', exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Applicant layout must fit the viewport');
    await page.screenshot({ path: path.join(output, `approved-${process.env.QA_VIEWPORT_WIDTH || 390}.png`) });
    await page.getByRole('button', { name: 'Вернуться в режим водителя', exact: true }).click();
    await page.waitForURL('**/driver');
    await page.getByRole('navigation', { name: 'Меню водителя' }).waitFor();
    assert.deepEqual(applicantErrors, [], 'Applicant and driver mode must not crash');
    console.log('Browser applicant restored application/docs, owner chose region, applicant entered real driver mode');
  }
  const approved = await Promise.all([1, 2].map(() => call(endpoint, owner.token, { status: 'APPROVED', regionId: region.id, comment: 'Synthetic QA only' }, 200, 'PATCH')));
  driverId = approved[0].application.driver_id;
  assert(driverId); assert.equal(approved[1].application.driver_id, driverId);
  assert.equal((await call(endpoint, owner.token, { status: 'REJECTED' }, 409, 'PATCH')).error, 'APPLICATION_ALREADY_PROVISIONED');
  await call(`/api/driver-applications/${application.id}/documents`, applicant.token, form(), 409);
  // Approval does not invalidate the existing passenger session or forge a token.
  assert.equal((await call('/api/admin/driver-applications/mine', applicant.token)).application.status, 'APPROVED');
  driverToken = (await call('/api/auth/mode/driver', applicant.token, {})).token;
  const profile = (await call('/api/driver/profile', driverToken)).driver;
  assert.equal(profile.id, driverId); assert.equal(profile.currentRegionId, region.id); assert.equal(profile.status, 'OFFLINE');
  const regions = await call(`/api/admin/drivers/${driverId}/regions`, owner.token);
  const allowed = regions.regions.filter(r => r.status === 'APPROVED'); assert.equal(allowed.length, 1);
  assert.equal((await call('/api/drivers/me/documents', driverToken)).documents[0].id, document.id);
  assert.equal((await call('/api/driver/status/online', driverToken, {})).driver.status, 'FREE');
  await call('/api/driver/status/offline', driverToken, {});
  const fresh = await call('/api/auth/login/password', null, { phone: applicant.phone, password: '123456' });
  assert.equal(fresh.user.role, 'DRIVER'); driverToken = fresh.token;
  const rider = await call('/api/auth/mode/passenger', driverToken, {});
  assert.equal(rider.user.role, 'CLIENT');
  assert.equal((await call('/api/auth/mode/driver', rider.token, {})).user.role, 'DRIVER');
  console.log('Local HTTP onboarding: ownership, duplicate submit/review, needs-info correction, single region, document transfer, old session, fresh login and online passed');
} finally {
  await browser?.close();
  if (driverId) await call(`/api/admin/drivers/${driverId}/block`, owner.token, { isBlocked: true, reason: 'Local QA fixture completed' }, 200, 'PATCH');
  else if (application) {
    const current = (await call('/api/admin/driver-applications/mine', applicant.token)).application;
    if (current?.driver_id) await call(`/api/admin/drivers/${current.driver_id}/block`, owner.token, { isBlocked: true, reason: 'Local QA fixture completed' }, 200, 'PATCH');
    else await call(`/api/admin/driver-applications/${application.id}`, owner.token, { status: 'REJECTED', comment: 'Local QA fixture completed' }, 200, 'PATCH');
  }
}
