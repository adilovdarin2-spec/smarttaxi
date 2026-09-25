import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("../src/features/map/MapView.jsx", import.meta.url)),
  "utf8"
);

// Reproduced on the live site: press the zoom buttons a couple of times and
// the address picker sits on "Определяем адрес…" for ever with the confirm
// button disabled. MapLibre was left believing a zoom was still running —
// isMoving() and isZooming() true, no animation frame scheduled, the camera
// standing still — and the "wait for the camera to settle" retry looped every
// 180ms without ever publishing a centre. No reverse lookup was ever sent.
test("waiting for the camera to settle has a deadline", () => {
  assert.match(
    source,
    /if \(map\.isMoving\(\) && Date\.now\(\) < settleDeadline\)/,
    "the settle retry must be bounded, or a stuck flag hangs the picker"
  );
  assert.ok(
    !/if \(map\.isMoving\(\)\) \{/.test(source),
    "an unbounded isMoving() guard is the hang itself"
  );
});

test("the deadline is armed by the gesture, not by module load", () => {
  // Armed in markChanging (movestart/zoomstart) so each gesture gets its own
  // grace, and left at zero otherwise so a flag that is already stuck cannot
  // hold back the very first publish.
  const marker = source.indexOf("const markChanging = ()");
  assert.ok(marker > 0);
  const body = source.slice(marker, marker + 600);
  assert.match(body, /settleDeadline = Date\.now\(\) \+ SETTLE_DEADLINE_MS;/);
  assert.match(source, /let settleDeadline = 0;/);
});

test("the grace is long enough for anything MapLibre animates", () => {
  const [, value] = source.match(/const SETTLE_DEADLINE_MS = (\d+);/) || [];
  assert.ok(value, "the deadline must be a named constant");
  // Inertia after a flick is well under a second, easeTo a few hundred ms,
  // flyTo a couple of seconds.
  assert.ok(Number(value) >= 3000, "shorter than a flyTo would cut real animations short");
  assert.ok(Number(value) <= 8000, "longer than this is indistinguishable from the hang");
});
