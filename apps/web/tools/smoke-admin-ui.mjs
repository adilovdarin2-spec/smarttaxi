import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Read-only owner navigation on the local development stack. Authentication
// uses the seeded QA account; no settings, payouts or business data are edited.
const api = process.env.QA_API_URL || 'http://127.0.0.1:4001';
const base = process.env.QA_WEB_URL || 'http://127.0.0.1:5175';
const role = process.env.QA_ADMIN_ROLE || 'OWNER';
assert(['OWNER', 'FINANCE'].includes(role));
for (const url of [api, base]) {
  assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname));
}
const ready = await fetch(`${api}/api/health/ready`).then(r => r.json());
assert.equal(ready.env, 'development');
assert.equal(ready.checks.sms, 'dev');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QA_PLAYWRIGHT_PACKAGE || 'playwright');
const output = process.env.QA_OUTPUT_DIR || path.join(os.tmpdir(), `baisapar-${role.toLowerCase()}-ui-qa`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  ...(process.env.QA_BROWSER_EXECUTABLE ? { executablePath: process.env.QA_BROWSER_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const failures = [];
const evidence = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  if (response.url().startsWith(api + '/api/admin/') && response.status() >= 400) {
    failures.push({ path: new URL(response.url()).pathname, status: response.status() });
  }
});
try {
  await page.goto(`${base}/admin`);
  await page.getByLabel('Телефон', { exact: true }).fill(process.env.QA_ADMIN_PHONE || (role === 'OWNER' ? '+77000000099' : '+77000000097'));
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.QA_ADMIN_PASSWORD || (role === 'OWNER' ? 'ChangeMe_2026!' : '123456'));
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  const navigation = page.locator('.admin-control-sidebar nav button');
  await navigation.first().waitFor();
  const count = await navigation.count();
  assert.equal(count, role === 'OWNER' ? 19 : 16, 'Management navigation must match the role');
  if (role === 'FINANCE') {
    for (const label of ['Стоянки', 'Заявки', 'Дорога']) {
      assert.equal(await navigation.filter({ has: page.getByText(label, {exact:true}) }).count(), 0,
        `${label}: owner-only section leaked to finance`);
    }
  }
  for (let index = 0; index < count; index++) {
    const button = navigation.nth(index);
    const label = await button.locator('span').innerText();
    await button.click();
    await page.locator('.admin-topbar h1').filter({ hasText: label }).waitFor();
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('.admin-login-form').count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: desktop overflow`);
    await page.screenshot({ path: path.join(output, `section-${index}.png`), fullPage: true });
    evidence.push(label);
    console.log(`Checked ${role} section: ${label}`);
  }
  assert.deepEqual(errors, [], 'Uncaught browser errors');
  assert.deepEqual(failures, [], 'Management endpoints failed');
} finally {
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ evidence, errors, failures }, null, 2));
  await browser.close();
}
