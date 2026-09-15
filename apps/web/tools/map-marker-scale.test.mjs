import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("compact tariff map scales route endpoints without shrinking the address picker", () => {
  assert.match(css, /\.smarttaxi-center-picker > \.smarttaxi-map-marker[\s\S]*?width:\s*64px;[\s\S]*?height:\s*86px;/);
  assert.match(css, /\.tariff-v14-map \.smarttaxi-map-marker\.native-address-pick-marker[\s\S]*?width:\s*44px;[\s\S]*?height:\s*59px;/);
  assert.match(css, /\.tariff-v14-map \.finish-flag-map-marker[\s\S]*?width:\s*40px;[\s\S]*?height:\s*52px;/);
});
