import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Read-only screens after the real local seeded-driver login. Does not
// toggle the shift, publish GPS, accept orders or change payment state.
const base = process.env.QA_WEB_URL || 'http://127.0.0.1:5175';
const api = process.env.QA_API_URL || 'http://127.0.0.1:4001';
for (const url of [base, api]) {
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname));
}
const ready = await fetch(`${api}/api/health/ready`).then(r => r.json());
assert.equal(ready.env, 'development');
assert.equal(ready.status, 'ok');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QA_PLAYWRIGHT_PACKAGE || 'playwright');
const output = process.env.QA_OUTPUT_DIR || path.join(os.tmpdir(), 'smarttaxi-driver-presentation');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  ...(process.env.QA_BROWSER_EXECUTABLE ? { executablePath: process.env.QA_BROWSER_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/driver`);
  await page.getByRole('button', { name: 'Войти', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, 'login-390.png') });
  await page.getByLabel('Телефон', { exact: true }).fill(process.env.QA_DRIVER_PHONE || '+77000000000');
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.QA_DRIVER_PASSWORD || '123456');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('navigation', { name: 'Меню водителя', exact: true }).waitFor();
  for (const [key, label] of [['line', 'Линия'], ['orders', 'Заказы'], ['money', 'Доход']]) {
    await page.getByRole('navigation', { name: 'Меню водителя', exact: true }).getByRole('button', { name: label, exact: true }).click();
    await page.waitForTimeout(1000);
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 740 });
      const phone = page.locator('.driver-core-phone');
      const bounds = await phone.boundingBox();
      assert(bounds.x >= -1 && bounds.x + bounds.width <= width + 1, `${key}: outer overflow`);
      for (const card of await page.locator('.driver-core-line-card, .driver-core-money-card, .driver-core-money-grid > div').all()) {
        assert.equal(await card.evaluate(el => el.scrollWidth > el.clientWidth + 1), false, `${key}: card content overflow`);
      }
      if (key === 'line') {
        const card = await page.locator('.driver-core-line-card').boundingBox();
        const action = await page.locator('.driver-core-line-card .app-button').boundingBox();
        assert(action.width >= card.width - 2, 'Shift action should span the sheet');
        const stats = await page.locator('.driver-core-stats').boundingBox();
        assert(stats.height >= 60, 'Earnings strip must not collapse in a scrolling sheet');
        const badge = await page.locator('.map-badge').boundingBox();
        const attribution = await page.locator('.map-attribution').boundingBox();
        assert(badge.height < 64, 'Map status must not stretch over the map');
        assert(attribution.height < 40, 'Map attribution must stay a compact readable label');
      }
      await page.screenshot({ path: path.join(output, `${key}-${width}.png`) });
    }
    console.log(`Checked driver presentation: ${key}`);
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ local: true, shiftChanged: false, errors }, null, 2));
} finally {
  await browser.close();
}
