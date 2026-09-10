import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("passenger authentication uses the original premium blue route hero", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const source = await readFile(new URL("../src/features/client/ClientApp.jsx", import.meta.url), "utf8");

  assert.match(source, /className="auth-photo-brand"/);
  assert.match(css, /url\("\/ui\/auth-welcome\/auth_premium_hero\.svg"\)/);
  assert.match(css, /\.auth-photo-brand\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.auth-reference-welcome-screen \.auth-primary-button\s*\{[^}]*color:\s*#fff/s);
  assert.doesNotMatch(css, /auth_full_hero_background_clean\.png/);
});
