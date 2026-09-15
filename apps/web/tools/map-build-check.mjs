import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { Script } from 'node:vm';

// Verify the production artifact, not only Vite's dev transform. MapLibre 6
// needs an emitted, self-contained worker; a plain ?url asset silently loses
// its sibling shared module and leaves the published vector map empty.
const assets = new URL('../dist/assets/', import.meta.url);
const files = readdirSync(assets);
const workers = files.filter(file => /^maplibre-gl-worker-[\w-]+\.js$/.test(file));
assert.equal(workers.length, 1, 'Expected one bundled MapLibre worker asset');
const worker = workers[0];
const code = readFileSync(new URL(worker, assets), 'utf8');
assert(code.length > 5000, 'Worker cannot be an empty entry or error document');
new Script(code, { filename: worker }); // Syntax only: never executes the worker.
assert(files.some(file => file !== worker && file.endsWith('.js') &&
  readFileSync(new URL(file, assets), 'utf8').includes(worker)), 'Map runtime must reference the emitted worker');
assert(files.some(file => file.endsWith('.css') &&
  readFileSync(new URL(file, assets), 'utf8').includes('.maplibregl-marker')), 'Map marker positioning CSS must ship');
console.log('Map build check ok: bundled worker, runtime reference and marker CSS');
