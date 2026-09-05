import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Browser-level checks against a running local Docker stack. The normal
// booking preview uses real API data. Only the failure case intercepts the
// reverse-geocoder, so its recovery path is reproducible without an outage.
const base = process.env.QA_WEB_URL || "http://127.0.0.1:5175";
assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname), "UI smoke is local-only");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QA_PLAYWRIGHT_PACKAGE || "playwright");
const output = process.env.QA_OUTPUT_DIR || path.join(os.tmpdir(), "smarttaxi-web-ui-qa");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.QA_BROWSER_EXECUTABLE ? { executablePath: process.env.QA_BROWSER_EXECUTABLE } : {})
});

async function assertOnScreen(locator, height) {
  const box = await locator.boundingBox();
  assert(box && box.y >= 0 && box.y + box.height <= height + 1, "Primary action must fit the viewport");
}

async function waitForVisibleRoute(page) {
  await page.waitForFunction(() => {
    const sheet = document.querySelector(".tariff-v14-sheet").getBoundingClientRect();
    const markers = [...document.querySelectorAll(".tariff-v14-map .maplibregl-marker")];
    return markers.length === 2 && markers.every(marker => {
      const box = marker.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= sheet.top && box.left >= 0 && box.right <= innerWidth;
    });
  }, null, { timeout: 15000 });
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/order`);
  const destination = page.getByRole("button", { name: "Выбрать пункт назначения", exact: true });
  await destination.waitFor({ timeout: 30000 });
  assert(await destination.isEnabled());
  await assertOnScreen(destination, 844);
  await page.screenshot({ path: path.join(output, "home.png") });

  // A centred zoom emits movestart/zoomstart but does not change coordinates.
  // It must settle back to the same valid address, not remain in loading.
  await page.getByRole("button", { name: "Приблизить карту", exact: true }).click();
  await destination.waitFor({ timeout: 10000 });
  assert(await destination.isEnabled());
  await destination.click();
  await page.getByRole("button", { name: /Базар Атакент/ }).click();
  const order = page.getByRole("button", { name: /Заказать за/ });
  await page.waitForFunction(() => {
    const button = document.querySelector(".tariff-v12-order");
    return button && !button.disabled;
  }, null, { timeout: 30000 });
  assert.equal(await page.getByRole("tab").count(), 2, "Exactly the two supported tariffs");
  await page.locator(".tariff-v14-map .maplibregl-marker").first().waitFor();
  await waitForVisibleRoute(page);
  await assertOnScreen(order, 844);
  await page.screenshot({ path: path.join(output, "tariffs.png") });

  await page.setViewportSize({ width: 360, height: 740 });
  await waitForVisibleRoute(page);
  await assertOnScreen(order, 740);
  await page.screenshot({ path: path.join(output, "tariffs-360.png") });
  assert.deepEqual(errors, [], "No uncaught browser errors");
  await context.close();

  const failureContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const failurePage = await failureContext.newPage();
  await failurePage.route("**/api/maps/reverse-geocode**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ address: { title: "Адрес не определён", lat: 40.844435, lng: 68.509021, fallback: true } })
  }));
  await failurePage.goto(`${base}/order`);
  await failurePage.getByRole("button", { name: /Откуда Адрес не найден/i }).waitFor({ timeout: 30000 });
  const manual = failurePage.getByRole("button", { name: "Выбрать адрес подачи", exact: true });
  assert(await manual.isEnabled(), "Failed reverse lookup must offer manual selection");
  assert.equal(await failurePage.getByRole("button", { name: "Определяем адрес", exact: true }).count(), 0);
  await assertOnScreen(manual, 844);
  await failurePage.screenshot({ path: path.join(output, "address-unresolved.png") });
  await manual.click();
  await failurePage.getByRole("heading", { name: "Откуда?", exact: true }).waitFor();
  await failureContext.close();
  console.log(`Client UI smoke passed. Screenshots: ${output}`);
} finally {
  await browser.close();
}
