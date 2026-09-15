import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const exists = (path) => existsSync(fileURLToPath(new URL(path, import.meta.url)));

const SOURCES = [
  "../src/features/client/ClientApp.jsx",
  "../src/features/landing/LandingPage.jsx",
  "../src/features/driver/DriverApp.jsx",
  "../src/features/admin/AdminApp.jsx",
];

test("the old brand name cannot come back split across markup", () => {
  // The rename passed straight over `<span>Smart<em>Taxi</em></span>`: the
  // landing page went on announcing the old name above a paragraph that used
  // the new one, because no search for the brand name can find it spelled in
  // halves.
  for (const path of SOURCES) {
    const source = read(path);
    for (const half of [">Smart<", ">Taxi<", "Smart<", ">Taxi"]) {
      assert.ok(
        !source.includes(half),
        `${path} spells half of the old brand name on its own`
      );
    }
    assert.ok(!/\bSmartTaxi\b/.test(source), `${path} still names the old brand`);
  }
});

test("the logotype is artwork, and the artwork is in the tree", () => {
  // Set as styled text it drifts with whatever font the page happens to have
  // loaded; as an SVG of outlines it is the same logo the app shows.
  const client = read("../src/features/client/ClientApp.jsx");
  const landing = read("../src/features/landing/LandingPage.jsx");
  assert.ok(client.includes('src="/brand/baisapar_wordmark.svg"'));
  assert.ok(landing.includes('src="/brand/baisapar_wordmark_light.svg"'));

  for (const file of [
    "../public/brand/baisapar_icon_192.png",
    "../public/brand/baisapar_icon_512.png",
    "../public/brand/baisapar_icon_1024.png",
    "../public/brand/baisapar_wordmark.svg",
    "../public/brand/baisapar_wordmark_light.svg",
    "../public/brand/baisapar_lockup.svg",
    "../public/brand/baisapar_apple_touch_icon.png",
  ]) {
    assert.ok(exists(file), `${file} is referenced but missing`);
  }

  // No shipped logo may depend on a font being installed where it renders:
  // an SVG loaded through <img> cannot reach the page's webfonts at all, so
  // a <text> element there silently falls back to Arial.
  for (const file of [
    "../public/brand/baisapar_wordmark.svg",
    "../public/brand/baisapar_wordmark_light.svg",
    "../public/brand/baisapar_lockup.svg",
  ]) {
    assert.ok(!read(file).includes("<text"), `${file} must be outlines, not text`);
  }
});

test("the page announces itself as BaiSapar", () => {
  const html = read("../index.html");
  assert.ok(html.includes("<title>BaiSapar</title>"));
  assert.ok(html.includes('href="/brand/baisapar_icon_192.png"'));
  assert.ok(html.includes('rel="apple-touch-icon"'));
  assert.ok(html.includes('rel="manifest"'));
  assert.ok(!html.includes("smarttaxi"));

  // "Add to home screen" reads the manifest, not the favicon, and a manifest
  // whose icons 404 gets the browser's own grey placeholder instead.
  const manifest = JSON.parse(read("../public/site.webmanifest"));
  assert.equal(manifest.name, "BaiSapar");
  for (const icon of manifest.icons) {
    assert.ok(exists(`../public${icon.src}`), `${icon.src} is declared but missing`);
  }
});

test("the address marker carries this brand's initial", () => {
  // The marker a rider drops is drawn three times over: here, in the Flutter
  // painter, and in the approved reference the two are checked against.
  const marker = read("../src/features/map/MapView.jsx");
  assert.ok(marker.includes('font-size="29" fill="url(#smarttaxiSquareMarkerGrad)">B</text>'));
});
