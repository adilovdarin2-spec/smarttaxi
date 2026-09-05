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

async function assertPickerAnchor(page) {
  const canvas = await page.locator(".maplibre-canvas-host").boundingBox();
  const tail = await page.locator(".smarttaxi-center-picker .approved-address-marker-tail").boundingBox();
  const sheet = await page.locator(".address-picker-sheet").boundingBox();
  assert(canvas && tail && sheet);
  assert(Math.abs(tail.x + tail.width / 2 - canvas.x - canvas.width / 2) < 1,
    "Pin must not inherit a second horizontal translation");
  assert(tail.y + tail.height < sheet.y, "Pin tip remains on the visible map above the sheet");
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
  assert.equal(await page.locator('.final10-sheet-heading h1').evaluate(element => getComputedStyle(element).fontWeight), '600', 'Heading uses the restrained presentation hierarchy');
  assert.equal(await page.locator('.final10-chip span').first().evaluate(element => getComputedStyle(element).color), 'rgb(66, 81, 106)', 'Quick actions remain readable neutral text');
  assert.equal(await page.locator('.smarttaxi-center-picker').count(), 1);
  assert.equal(await page.locator('.final10-marker-wrap').count(), 0, 'No decorative duplicate pickup pin');
  await assertOnScreen(destination, 844);
  await page.screenshot({ path: path.join(output, "home.png") });

  // A centred zoom emits movestart/zoomstart but does not change coordinates.
  // It must settle back to the same valid address, not remain in loading.
  await page.getByRole("button", { name: "Приблизить карту", exact: true }).click();
  await destination.waitFor({ timeout: 10000 });
  assert(await destination.isEnabled());
  await destination.click();
  await page.getByRole("button", { name: "Выбрать точку на карте", exact: true }).click();
  await page.waitForFunction(() => {
    const button = document.querySelector(".address-picker-confirm");
    return button && !button.disabled;
  }, null, { timeout: 15000 });
  const confirmPoint = page.getByRole("button", { name: "Выбрать адрес", exact: true });
  await assertOnScreen(confirmPoint, 844);
  await assertPickerAnchor(page);
  await page.screenshot({ path: path.join(output, "address-map.png") });
  await page.setViewportSize({ width: 360, height: 740 });
  await page.waitForFunction(() => !document.querySelector(".address-picker-confirm").disabled);
  await assertOnScreen(confirmPoint, 740);
  await assertPickerAnchor(page);
  await page.screenshot({ path: path.join(output, "address-map-360.png") });

  // The local service seed puts Myrzakent about 20 km south of Atakent.
  // Changing only the tab text while keeping the old map must fail this test.
  const regionLookup = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname.endsWith("/maps/reverse-geocode") &&
      Math.abs(Number(url.searchParams.get("lat")) - 40.665495) < 0.02 &&
      Math.abs(Number(url.searchParams.get("lng")) - 68.549994) < 0.02;
  }, { timeout: 15000 });
  await page.getByRole("button", { name: "Мырзакент (Славянка)", exact: true }).click();
  await regionLookup;
  await page.waitForFunction(() => !document.querySelector(".address-map-point-card").textContent.includes("Определяем"));
  await page.screenshot({ path: path.join(output, "address-map-region.png") });
  await page.getByRole("button", { name: "Атакент (Ильич)", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".address-picker-confirm").disabled);

  // Hold one real geocoder response until the next map drag is in progress.
  // An answer for the previous centre must never enable confirmation mid-drag.
  let releaseHeld;
  const releasePromise = new Promise(resolve => { releaseHeld = resolve; });
  let captured;
  const capturedPromise = new Promise(resolve => { captured = resolve; });
  let holdNext = true;
  await page.route("**/api/maps/reverse-geocode**", async request => {
    if (!holdNext) return request.continue();
    holdNext = false;
    const response = await request.fetch();
    captured();
    await releasePromise;
    await request.fulfill({ response });
  });
  await page.mouse.move(140, 150);
  await page.mouse.down();
  await page.mouse.move(220, 150, { steps: 12 });
  await page.mouse.up();
  await Promise.race([
    capturedPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("No reverse request after dragging")), 10000))
  ]);
  await page.mouse.move(200, 150);
  await page.mouse.down();
  await page.mouse.move(150, 170, { steps: 8 });
  const heldResponse = page.waitForResponse(response => response.url().includes("/api/maps/reverse-geocode") && response.ok());
  releaseHeld();
  await heldResponse;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert(await page.locator(".address-picker-confirm").isDisabled(), "Stale reverse answer cannot confirm a moving pin");
  await page.waitForTimeout(1100);
  assert(await page.locator(".address-picker-confirm").isDisabled(), "Recovery timer must not confirm a long map drag");
  await page.mouse.up();
  await page.unroute("**/api/maps/reverse-geocode**");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Вернуться к поиску", exact: true }).click();
  await page.getByRole("button", { name: /Базар Атакент/ }).click();
  const order = page.getByRole("button", { name: /Заказать за/ });
  await page.waitForFunction(() => {
    const button = document.querySelector(".tariff-v12-order");
    return button && !button.disabled;
  }, null, { timeout: 30000 });
  assert.equal(await page.getByRole("tab").count(), 2, "Exactly the two supported tariffs");
  for (const car of await page.locator('.tariff-v14-car img').all()) {
    const box = await car.boundingBox();
    assert(box.width >= 76 && box.height >= 60, 'Original vehicle art stays large enough to identify');
  }
  assert.equal(await page.locator('.tariff-v14-card-fare strong').count(), 2, 'Both tariffs keep their real right-aligned fare');
  await page.waitForFunction(() => [...document.querySelectorAll('.tariff-v14-card-fare strong')].every(element => element.textContent.includes('₸')));
  await page.locator(".tariff-v14-map .maplibregl-marker").first().waitFor();
  await waitForVisibleRoute(page);
  await assertOnScreen(order, 844);
  await page.screenshot({ path: path.join(output, "tariffs.png") });

  await page.setViewportSize({ width: 360, height: 740 });
  await waitForVisibleRoute(page);
  await assertOnScreen(order, 740);
  await page.screenshot({ path: path.join(output, "tariffs-360.png") });
  await page.getByRole("button", { name: /Способ оплаты/ }).click();
  await page.getByRole("heading", { name: "Как оплатить?", exact: true }).waitFor();
  assert(await page.getByRole("button", { name: /^Наличные/ }).isVisible());
  assert(await page.getByRole("button", { name: /^Бонусами/ }).isVisible());
  await page.screenshot({ path: path.join(output, "payment.png"), animations: "disabled" });
  const paymentDialog = page.getByRole('dialog', { name: 'Способ оплаты', exact: true });
  await page.keyboard.press('Shift+Tab');
  assert(await paymentDialog.evaluate(dialog => dialog.contains(document.activeElement)), 'Keyboard focus stays within payment choices');
  await page.keyboard.press('Escape');
  assert.equal(await paymentDialog.count(), 0, 'Escape closes the payment sheet');
  assert(await page.getByRole('button', { name: /Способ оплаты/ }).evaluate(button => button === document.activeElement), 'Closing payment restores focus to the opening control');
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
  await failurePage.getByRole("button", { name: "Выбрать точку на карте", exact: true }).click();
  await failurePage.getByText("Адрес не найден", { exact: true }).waitFor();
  assert(await failurePage.getByRole("button", { name: "Подтвердить адрес", exact: true }).isDisabled());
  await failurePage.screenshot({ path: path.join(output, "address-map-unresolved.png") });
  await failureContext.close();
  console.log(`Client UI smoke passed. Screenshots: ${output}`);
} catch (error) {
  // Keep failure evidence outside the release captures, including when a
  // tile/reverse provider fails before the first screen can settle.
  const failureDir = path.join(os.tmpdir(), 'smarttaxi-client-ui-failure');
  await mkdir(failureDir, { recursive: true });
  let index = 0;
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      await page.screenshot({ path: path.join(failureDir, `screen-${index++}.png`) }).catch(() => {});
      console.error('Failed screen:', await page.locator('body').innerText().catch(() => 'unavailable'));
    }
  }
  throw error;
} finally {
  await browser.close();
}
