import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// A fresh account, issued by the real local development SMS/password flow.
// No production sessions, forged tokens, legal submissions or payment writes.
const api = process.env.QA_API_URL || "http://127.0.0.1:4001";
const base = process.env.QA_WEB_URL || "http://127.0.0.1:5175";
for (const url of [api, base]) {
  assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname), "Account QA is local-only");
}
async function request(endpoint, body) {
  const response = await fetch(api + endpoint, {
    method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  assert(response.ok, `${endpoint}: ${response.status}`);
  return response.json();
}
const ready = await request("/api/health/ready");
assert.equal(ready.env, "development");
assert.equal(ready.status, "ok");
const phone = `+7708${String(Date.now()).slice(-7)}`;
const sent = await request("/api/auth/sms/send", { phone, purpose: "REGISTER" });
assert(sent.devCode, "Local development SMS required");
const verified = await request("/api/auth/sms/verify", { phone, purpose: "REGISTER", code: sent.devCode });
const account = await request("/api/auth/register/password", {
  phone, verificationToken: verified.verificationToken, name: "Проверка дизайна", password: "123456"
});
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QA_PLAYWRIGHT_PACKAGE || "playwright");
const output = process.env.QA_OUTPUT_DIR || path.join(os.tmpdir(), "smarttaxi-account-ui-qa");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.QA_BROWSER_EXECUTABLE ? { executablePath: process.env.QA_BROWSER_EXECUTABLE } : {})
});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(token => localStorage.setItem("smarttaxi_token", token), account.token);
  const page = await context.newPage();
  const errors = [];
  const evidence = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/order`);
  async function section(key, label) {
    await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
    if (key === "profile") await page.locator(".client-drawer-account-row").click();
    else await page.locator(".client-drawer-nav button").filter({ has: page.getByText(label, { exact: true }) }).click();
    await page.locator(".client-drawer.open").waitFor({ state: "hidden" });
  }
  for (const [key, label] of [
    ["profile", "Ваш профиль"], ["trips", "История поездок"], ["favorites", "Избранные адреса"],
    ["recurring", "Регулярные поездки"], ["drivers", "Мои водители"], ["notifications", "Уведомления"],
    ["wallet", "Кошелёк"], ["promo", "Промокоды"], ["referral", "Пригласить друга"],
    ["support", "Поддержка"], ["application", "Стать водителем"], ["faq", "FAQ"],
    ["settings", "Настройки"], ["about", "О приложении"], ["regions", "Регион обслуживания"]
  ]) {
    await section(key, label);
    const screen = page.locator(".app-content > .screen-grid, .app-content > .client-simple-section").last();
    await screen.waitFor();
    await page.waitForTimeout(600);
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: width === 360 ? 740 : 844 });
      const bounds = await screen.boundingBox();
      assert(bounds.x >= -1 && bounds.x + bounds.width <= width + 1, `${key}: page overflows at ${width}`);
      await page.screenshot({ path: path.join(output, `${key}-${width}.png`) });
    }
    if (key === "settings") {
      const row = page.locator(".settings-list-premium .settings-row-premium").first();
      assert.equal(await row.evaluate(element => getComputedStyle(element).borderRadius), "0px", "Settings must be a divided list, not nested pill cards");
      await row.click();
      await page.locator(".profile-screen").waitFor();
      await section("settings", "Настройки");
      await page.locator(".settings-row-premium").filter({ hasText: "Уведомления" }).click();
      await page.getByRole("heading", { name: "Уведомления", exact: true }).waitFor();
      await section("settings", "Настройки");
      await page.locator(".settings-row-premium").filter({ hasText: "Безопасность" }).click();
      await page.locator(".legal-card").waitFor();
      await section("settings", "Настройки");
    }
    evidence.push({ key, headings: await screen.locator("h1,h2").allTextContents() });
    console.log(`Checked account screen: ${key}`);
  }
  await page.getByRole("button", { name: "Уведомления", exact: true }).click();
  await page.getByRole("heading", { name: "Уведомления", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "result.json"), JSON.stringify({
    web: base, localRegistration: true, evidence, settingsNavigation: true, notificationBell: true, errors
  }, null, 2));
} finally {
  await browser.close();
}
