import assert from "node:assert/strict";
import test from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

test("app recovery provides a safe reload without clearing session or replaying orders", async () => {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
  });
  try {
    const { AppRecoveryScreen, AppErrorBoundary, isAccountStorageChange } =
      await server.ssrLoadModule("/src/app/AppRecovery.jsx");
    const html = renderToStaticMarkup(h(AppRecoveryScreen));
    assert.match(html, /role="alert"/);
    assert.match(html, /Обновить приложение/);
    assert.match(html, /не отменяет заказ и не создаёт новый/);
    assert.doesNotMatch(html, /Выйти|Создать заказ|database|stacktrace/i);
    assert.deepEqual(
      AppErrorBoundary.getDerivedStateFromError(
        new Error("private implementation error"),
      ),
      { failed: true },
    );
    assert.equal(isAccountStorageChange({ key: "smarttaxi_token" }), true);
    assert.equal(isAccountStorageChange({ key: null }), true);
    assert.equal(isAccountStorageChange({ key: "unrelated-setting" }), false);
  } finally {
    await server.close();
  }
});
