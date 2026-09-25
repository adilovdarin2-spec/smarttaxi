import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { buildingAtPoint } from '../../../packages/shared/src/building-selection.js';
import { serviceRegionCode } from '../../api/src/modules/routing/region-geo.js';

// Geometry integration QA: real vector tiles + the production shared polygon
// selector + the local reverse API. This is not a physical-device drive, nor
// a claim that every unlabelled building has an address in the source data.
const api = process.env.QA_API_URL || 'http://127.0.0.1:4001';
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(api).hostname));
const ready = await fetch(`${api}/api/health/ready`).then(r => r.json());
assert.equal(ready.env, 'development');
const { regions } = await fetch(`${api}/api/regions/active`).then(r => r.json());
assert.equal(regions.length, 13);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QA_PLAYWRIGHT_PACKAGE || 'playwright');
const mapDirectory = path.dirname(require.resolve('maplibre-gl/dist/maplibre-gl.mjs'));
const server = createServer(async (request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname.slice(1);
  if (!name) {
    response.setHeader('Content-Type','text/html');
    response.end('<div id="map" style="position:fixed;inset:0"></div>');
    return;
  }
  if (!/^maplibre-gl(?:-shared|-worker)?\.mjs$/.test(name)) { response.writeHead(404).end(); return; }
  try {
    response.setHeader('Content-Type','text/javascript');
    response.end(await readFile(path.join(mapDirectory,name)));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true,
  ...(process.env.QA_BROWSER_EXECUTABLE ? { executablePath: process.env.QA_BROWSER_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
const output = process.env.QA_OUTPUT_DIR || path.join(os.tmpdir(), 'onedriver-regional-building-qa');
await mkdir(output, { recursive: true });
const results = [];
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(async () => {
    const maplibregl = await import('/maplibre-gl.mjs');
    window.qaMap = new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/liberty',zoom:18,center:[68.509144,40.8443546]});
    await new Promise((resolve,reject) => {
      const timer=setTimeout(()=>reject(new Error('Vector style did not load')),30000);
      window.qaMap.once('load',()=>{clearTimeout(timer);resolve();});
    });
  });
  for (const region of regions) {
    const data = gunzipSync(await readFile(fileURLToPath(new URL(`../../api/data/addresses/${region.code}.jsonl.gz`, import.meta.url)))).toString('utf8');
    const rows = data.trim().split('\n').map(line => JSON.parse(line))
      .filter(row => serviceRegionCode(row.lat, row.lng) === region.code);
    const houses = rows.filter(row => row.kind === 'housenumber').sort((a,b) =>
      Math.hypot(a.lat-region.centerLat,a.lng-region.centerLng)-Math.hypot(b.lat-region.centerLat,b.lng-region.centerLng));
    const pois = rows.filter(row => row.kind === 'poi');
    const sample = houses[0] || pois[0];
    assert(sample, `${region.code}: no known address sample`);
    await page.evaluate(async point => {
      const map=window.qaMap;
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Vector tiles did not settle')),30000);
        map.once('idle',()=>{clearTimeout(timer);resolve();});
        map.jumpTo({center:[point.lng,point.lat],zoom:18});
      });
    }, sample);
    const features = await page.evaluate(() => window.qaMap.queryRenderedFeatures()
      .filter(f=>f.sourceLayer==='building').map(f=>({geometry:f.geometry})));
    const building = buildingAtPoint(features, sample);
    const params = new URLSearchParams({lat:String(sample.lat),lng:String(sample.lng)});
    if (building) params.set('building',JSON.stringify(building));
    const response=await fetch(`${api}/api/maps/reverse-geocode?${params}`);
    const { address }=await response.json();
    assert(response.ok && address && !address.fallback, `${region.code}: known sample unresolved`);
    assert.equal(address.label, sample.label, `${region.code}: selected known point changed its name`);
    if(building) assert.equal(address.matchKind,'selected-building');
    const result={region:region.code,requested:sample.label,resolved:address.label,source:address.source,
      footprintSelected:Boolean(building),point:{lat:sample.lat,lng:sample.lng}};
    results.push(result);
    console.log(JSON.stringify(result));
  }
} finally {
  await writeFile(path.join(output,'result.json'),JSON.stringify(results,null,2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log(`Regional pick QA: ${results.length} samples, ${results.filter(r=>r.footprintSelected).length} real selected footprints. Report: ${output}`);
