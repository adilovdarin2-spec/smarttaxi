import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Bounded, read-only investigation of the Maktaaral detour. Never edits OSM,
// addresses, orders or routing configuration; a shorter line is not evidence
// that a road connection is legal or physically passable.
const base = process.env.QA_OSRM_URL || 'https://router.project-osrm.org';
const points = [[68.5327223, 40.7248972], [68.5300275, 40.723856]];
const output = process.env.QA_OUTPUT_DIR || path.join(os.tmpdir(), 'baisapar-road-access-qa');
async function request(url, format = 'json') {
  const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`${new URL(url).host}: HTTP ${response.status}`);
  return format === 'json' ? response.json() : response.text();
}
const attrs = text => Object.fromEntries([...text.matchAll(/([\w:]+)="([^"]*)"/g)]
  .map(match => [match[1], match[2]]));
const evidence = { time: new Date().toISOString(), points, provider: base, nearest: [], roads: [] };
await mkdir(output, { recursive: true });
try {
  for (const point of points) {
    const data = await request(`${base}/nearest/v1/driving/${point.join(',')}?number=5`);
    evidence.nearest.push({ point, code: data.code, waypoints: data.waypoints?.map(({ hint, ...value }) => value) });
  }
  const data = await request(`${base}/route/v1/driving/${points.map(p => p.join(',')).join(';')}?overview=full&geometries=geojson&steps=true&alternatives=true&radiuses=250;250`);
  evidence.route = data;
  const xml = await request('https://api.openstreetmap.org/api/0.6/map?bbox=68.529,40.723,68.535,40.727', 'text');
  const nodes = new Map([...xml.matchAll(/<node\s+([^>]+)/g)].map(match => {
    const node = attrs(match[1]);
    return [node.id, [Number(node.lon), Number(node.lat)]];
  }));
  evidence.roads = [...xml.matchAll(/<way\s+([^>]+)>([\s\S]*?)<\/way>/g)].map(match => {
    const tags = Object.fromEntries([...match[2].matchAll(/<tag\s+([^>]+)/g)]
      .map(tag => { const value = attrs(tag[1]); return [value.k, value.v]; }));
    const refs = [...match[2].matchAll(/<nd ref="(\d+)"/g)].map(ref => ref[1]);
    return { id: attrs(match[1]).id, tags, nodes: refs, geometry: refs.map(ref => nodes.get(ref)) };
  }).filter(way => way.tags.highway);
  console.log(JSON.stringify({ nearest: evidence.nearest, roads: evidence.roads,
    routes: data.routes?.map(route => ({ meters: route.distance, seconds: route.duration })) }, null, 2));
} catch (error) {
  evidence.error = error.message;
  throw error;
} finally {
  await writeFile(path.join(output, 'road-access.json'), JSON.stringify(evidence, null, 2));
  console.log(`Road access evidence: ${output}`);
}
