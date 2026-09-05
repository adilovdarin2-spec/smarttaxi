import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("finish flag has alternating blue and white cells, not a solid blue fill", () => {
  const source = readFileSync(new URL("../src/features/map/MapView.jsx", import.meta.url), "utf8");
  const markup = source.match(/const finishFlagMarkerMarkup = `([^`]+)`;/)?.[1];
  assert(markup, "Shared finish SVG exists");
  const path = markup.match(/<path d="([^"]+)" fill="#1D6FFF"\/>/)?.[1];
  assert(path, "Blue checker cells exist");
  const cells = [...path.matchAll(/M([\d.]+) ([\d.]+)H([\d.]+)V([\d.]+)H([\d.]+)V([\d.]+)Z/g)];
  assert.equal(cells.length, 8, "Only half of the four-by-four cells are blue");
  assert.equal(cells.map(cell => cell[0]).join(""), path);
  const occupied = new Set();
  for (const [, xText, yText, rightText, bottomText, leftText, topText] of cells) {
    const [x, y, right, bottom, left, top] = [xText, yText, rightText, bottomText, leftText, topText].map(Number);
    const column = (x - 21) / 6;
    const row = (y - 14.5) / 6.5;
    assert(Number.isInteger(row) && row >= 0 && row < 4);
    assert(Number.isInteger(column) && column >= 0 && column < 4);
    assert.equal((row + column) % 2, 0);
    assert.equal(right - x, 6);
    assert.equal(bottom - y, 6.5);
    assert.equal(left, x);
    assert.equal(top, y);
    occupied.add(`${row}:${column}`);
  }
  assert.equal(occupied.size, 8, "No repeated cells hide an absent square");
});
