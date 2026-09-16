import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clearStandMarkers } from '../src/features/map/standMarkerLifecycle.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// A stand is a place on the map before it is a row in a list — that is how
// riders already know these lines. These guard the parts of the map pin that
// are easy to break silently: whose data goes in, and whether the pin survives
// the seat count changing underneath it.

test("the pin writes stand data as text, never as markup", () => {
  const source = read("../src/features/map/MapView.jsx");
  // The stand name is typed by the owner in the admin editor, so it reaches
  // this pin as untrusted data and must never be interpolated into innerHTML.
  assert.match(source, /count\.textContent = String\(seats\)/);
  assert.match(source, /name\.textContent = stand\.name \|\| "Стоянка"/);
  const builder = source.slice(source.indexOf("function standMarkerElement"));
  const innerHtml = builder.slice(0, builder.indexOf("addEventListener"));
  assert.doesNotMatch(innerHtml, /\$\{stand\./, "stand fields must not be interpolated into markup");
});

test("a changing seat count updates the pin instead of replacing it", () => {
  const source = read("../src/features/map/MapView.jsx");
  // Recreating every pin on each update makes the whole set blink, and the
  // count changes every time a driver takes a passenger.
  assert.match(source, /updateStandMarkerElement\(existing\.marker\.getElement\(\), stand\)/);
});

test("stand pins are torn down with the map", () => {
  const source = read("../src/features/map/MapView.jsx");
  assert.match(source, /clearStandMarkers\(standMarkersRef\.current\)/);
  assert.match(source, /markers\.set\(stand.id, \{ marker \}\)/);
  const removed = [];
  const registry = new Map(['a', 'b'].map(id => [id, { marker: { remove: () => removed.push(id) } }]));
  clearStandMarkers(registry);
  assert.deepEqual(removed, ['a', 'b']);
  assert.equal(registry.size, 0);
  clearStandMarkers(registry);
  assert.deepEqual(removed, ['a', 'b'], 'A second teardown cannot remove the old map pins again');
});

test("a full stand still shows, but cannot read as an open one", () => {
  const source = read("../src/features/map/MapView.jsx");
  assert.match(source, /element\.classList\.toggle\("muted", seats <= 0\)/);
  const css = read("../src/styles.css");
  assert.match(css, /\.stand-map-marker\.muted \.stand-map-marker-badge \{ background: #97a3b8; \}/);
});

test("the map lives on the stands screen, not on the ordering map", () => {
  // The home map is framed tightly on the rider's own address, so a stand
  // several hundred metres away lands far outside the viewport — a pin nobody
  // can see. The stands screen's map has the stands as its whole subject.
  const app = read("../src/features/client/ClientApp.jsx");
  assert.doesNotMatch(app, /onStandClick/, "the ordering map must not carry stand pins");

  const section = read("../src/features/client/ClientStandsSection.jsx");
  assert.match(section, /<StandsMap stands=\{stands\} onStandClick=\{openStandById\} compact \/>/);
});

test("every camera move agrees on what the map is about", () => {
  const source = read("../src/features/map/MapView.jsx");
  // Three places move the camera: the initial load, the subject-changed
  // effect, and the resize observer that fires right after mount. When they
  // decided separately, the two that did not know about stands re-framed the
  // map on the default region and left every pin off-screen.
  assert.match(source, /function fitSubject\(map, \{ standPoints,/);
  const calls = source.match(/(?<!function )fitSubject\(map, \{/g) || [];
  assert.equal(calls.length, 4, "every camera move must go through fitSubject");
  assert.match(source, /if \(standPoints\?\.length\) \{\s+fitMap\(map, standPoints, compact\);/);

  // The observer has to re-run when the subject changes, or it keeps
  // re-fitting to the one it closed over.
  const observerDeps = source.slice(source.indexOf("observer.observe(containerRef.current)"));
  assert.match(observerDeps.slice(0, 400), /followDriver, standPoints\]/);
});

test("opening the stands screen does not download MapLibre with it", () => {
  const section = read("../src/features/client/ClientStandsSection.jsx");
  // A megabyte of map must not delay the lines, the cars and the phone
  // numbers, which are what the rider actually came for.
  assert.match(section, /React\.lazy\(\(\) => import\("\.\.\/map\/MapView\.jsx"\)\)/);
  assert.doesNotMatch(section, /^import MapView from/m);
});

test("a one-storey town is drawn as buildings, not as a plan", () => {
  // The cut-off used to be nine metres — three storeys. In Атакент 2305 of the
  // 2319 buildings that carry a height are single-storey, so nine metres left
  // nine of them standing and flattened the whole town.
  const source = readFileSync(new URL("../src/features/map/MapView.jsx", import.meta.url), "utf8");
  assert.match(source, /const EXTRUDED_FROM_METRES = 3;/);
  // One constant, so the flat fills and the extrusion can never disagree about
  // which buildings each of them owns.
  assert.equal((source.match(/EXTRUDED_FROM_METRES/g) || []).length, 4);
  assert.doesNotMatch(source, /measuredHeight, 9\]/, "the old three-storey cut-off must not come back");

  // A footprint with no recorded height still stays flat: drawing it would be
  // inventing a building nobody measured.
  assert.match(source, /\["coalesce", \["get", "render_height"\], \["get", "height"\], 0\]/);
});
