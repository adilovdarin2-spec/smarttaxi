import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("pickup and destination address search expose explicit input semantics", async () => {
  const source = await readFile(new URL("../src/features/client/ClientApp.jsx", import.meta.url), "utf8");

  assert.match(source, /aria-label=\{mode === "pickup" \? "Поиск точки подачи" : "Поиск пункта назначения"\}/);
  assert.match(source, /autoComplete="street-address"/);
  assert.match(source, /inputMode="search"/);
  assert.match(source, /enterKeyHint="search"/);
});
