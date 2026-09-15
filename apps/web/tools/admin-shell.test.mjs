import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

test("admin loading and login use a centered full-viewport access shell", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { hostname: "127.0.0.1" } };
  const root = fileURLToPath(new URL("..", import.meta.url));
  const server = await createServer({
    root,
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const { default: AdminApp } = await server.ssrLoadModule("/src/features/admin/AdminApp.jsx");
    const markup = renderToStaticMarkup(h(AdminApp));
    assert.match(markup, /class="admin-control-shell admin-access-shell"/);
    assert.match(markup, /Проверяем сессию/);

    const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
    assert.match(css, /\.admin-control-shell\.admin-access-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*place-items:\s*center/s);
    assert.match(css, /\.admin-login-form\s*\{[^}]*width:\s*min\(100%, 360px\)/s);
  } finally {
    await server.close();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
