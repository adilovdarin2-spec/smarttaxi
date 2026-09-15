import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("driver road-alert controls expose explicit accessible names", async () => {
  const source = await readFile(new URL("../src/features/driver/DriverApp.jsx", import.meta.url), "utf8");

  assert.match(source, /aria-label="Тип дорожного события"/);
  assert.match(source, /aria-label="Комментарий к дорожному событию"/);
});
