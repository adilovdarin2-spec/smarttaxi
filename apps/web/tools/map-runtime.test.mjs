import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { installMissingPoiFallbacks } from '../src/features/map/missingPoiFallbacks.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('map package and lock exclude the attribution XSS affected versions', () => {
  const manifest = JSON.parse(read('../package.json'));
  const lock = JSON.parse(read('../../../package-lock.json'));
  const version = lock.packages['node_modules/maplibre-gl'].version;
  assert.equal(manifest.dependencies['maplibre-gl'], version, 'Review and pin map runtime upgrades');
  const [major, minor, patch] = version.split('.').map(Number);
  assert(major > 6 || (major === 6 && (minor > 4 || (minor === 4 && patch >= 1))),
    'GHSA-jrc7-96c5-q579 requires MapLibre >= 6.4.1');
});

test('both taxi and dispatch maps use the self-contained Vite worker entry', () => {
  const runtime = read('../src/features/map/mapRuntime.js');
  assert.match(runtime, /maplibre-gl-worker\.mjs\?worker&url/);
  assert.match(runtime, /setWorkerUrl\(workerUrl\)/);
  assert.match(runtime, /maplibre-gl\/dist\/maplibre-gl\.css/);
  for (const file of ['map/MapView.jsx', 'admin/DriversLiveMap.jsx']) {
    const code = read(`../src/features/${file}`);
    assert.match(code, /import \{ maplibregl \} from ['"].*mapRuntime\.js['"]/);
    assert.doesNotMatch(code, /import maplibregl from/);
  }
});

test('missing POIs resolve in the current request and after a style reload', () => {
  const images = new Map();
  let resolver;
  let added = 0;
  const map = {
    hasImage: id => images.has(id),
    addImage(id, image, options) { images.set(id, image); added++; assert.equal(options.pixelRatio, 2); },
    setMissingStyleImageResolver(callback) { resolver = callback; },
  };
  const dispose = installMissingPoiFallbacks(map);
  resolver('office');
  assert.equal(images.get('office').data.length, 32 * 32 * 4);
  assert.equal(images.get('office').data[3], 0, 'Transparent corners, not a square block');
  resolver('office'); resolver('');
  assert.equal(added, 1, 'Existing provider/custom sprites are not overwritten');
  images.clear();
  resolver('office');
  assert.equal(added, 2, 'Reloaded style gets its fallback again');
  dispose();
  assert.equal(resolver, null);
});

test('a missing image racing style teardown is nonfatal and can retry', () => {
  let resolver;
  let calls = 0;
  const dispose = installMissingPoiFallbacks({
    hasImage: () => false,
    addImage() { calls++; if (calls === 1) throw Error('style removed'); },
    setMissingStyleImageResolver(callback) { resolver = callback; },
  });
  assert.doesNotThrow(() => resolver('sports_centre'));
  resolver('sports_centre');
  assert.equal(calls, 2);
  dispose();
});
