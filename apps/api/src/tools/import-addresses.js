// Harvests OSM address data for every configured region into the local
// `addresses` table, so address search can be answered from our own DB.
//
// Why this exists: the app resolves addresses through live geocoding, which
// surfaces far less than OSM actually holds for these towns. Counted against
// Overpass on 2026-08-04, Атакент carries ~2 914 house numbers and Шымкент
// ~99 386 plus 609 named buildings — a real address base we were not reading.
// See docs/status/address-coverage-2026-08-04.md.
//
// Usage:
//   node src/tools/import-addresses.js              # every active region
//   node src/tools/import-addresses.js MYRZAKENT    # one region by code
//
// Safe to re-run: rows are keyed on (osm_type, osm_id) and upserted, so a
// second pass refreshes rather than duplicates.

import { query } from "../db/pool.js";

// The public Overpass endpoints rate-limit aggressively and start returning
// 429/504 under a tight loop — that is exactly what broke the first coverage
// probe. Requests are therefore serialised, spaced, and retried with growing
// backoff rather than fired in parallel.
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
const PAUSE_BETWEEN_QUERIES_MS = 4_000;
const MAX_ATTEMPTS = 4;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function overpass(body) {
  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    // Alternate endpoints between attempts so one mirror being busy does
    // not doom the whole query.
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // Overpass rejects requests without a UA and asks that clients
          // identify themselves so operators can reach heavy users.
          "User-Agent": "SmartTaxi/1.0 (address import)"
        },
        body: new URLSearchParams({ data: body })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      // 8s, 16s, 24s — long enough for a rate-limit window to lapse.
      await sleep(8_000 * (attempt + 1));
    }
  }
  throw lastError;
}

function boundaryOf(region) {
  return typeof region.boundary === "string"
    ? JSON.parse(region.boundary)
    : region.boundary;
}

function bboxOf(region) {
  const boundary = boundaryOf(region);
  // Boundary points are stored [lng, lat]; Overpass wants
  // south,west,north,east.
  const lats = boundary.map((point) => point[1]);
  const lngs = boundary.map((point) => point[0]);
  return `${Math.min(...lats)},${Math.min(...lngs)},${Math.max(...lats)},${Math.max(...lngs)}`;
}

function pointInPolygon(lat, lng, boundary) {
  let inside = false;
  for (let index = 0, previous = boundary.length - 1; index < boundary.length; previous = index++) {
    const [x, y] = boundary[index];
    const [previousX, previousY] = boundary[previous];
    const crosses = (y > lat) !== (previousY > lat)
      && lng < ((previousX - x) * (lat - y)) / (previousY - y) + x;
    if (crosses) inside = !inside;
  }
  return inside;
}

// Four element classes, ordered by how likely a rider is to want them.
// `out center` gives ways a representative point without pulling geometry.
function queriesFor(bbox) {
  return [
    {
      kind: "housenumber",
      body: `[out:json][timeout:180];(node["addr:housenumber"](${bbox});way["addr:housenumber"](${bbox}););out center tags;`
    },
    {
      kind: "poi",
      body: `[out:json][timeout:180];(node["amenity"]["name"](${bbox});node["shop"]["name"](${bbox});way["amenity"]["name"](${bbox});way["shop"]["name"](${bbox}););out center tags;`
    },
    {
      kind: "building",
      body: `[out:json][timeout:180];way["building"]["name"](${bbox});out center tags;`
    },
    {
      kind: "street",
      body: `[out:json][timeout:180];way["highway"]["name"](${bbox});out center tags;`
    }
  ];
}

function labelFor(kind, tags) {
  const street = tags["addr:street"];
  const housenumber = tags["addr:housenumber"];
  const name = tags.name;
  if (kind === "housenumber") {
    // A bare number with no street is unsearchable — skip it rather than
    // store "12" on its own.
    if (!street) return null;
    return housenumber ? `${street}, ${housenumber}` : street;
  }
  if (!name) return null;
  // A shop is far easier to find when its address rides along with it.
  if (street && housenumber) return `${name} (${street}, ${housenumber})`;
  if (street) return `${name} (${street})`;
  return name;
}

function coordsOf(element) {
  if (element.type === "node") return [element.lat, element.lon];
  if (element.center) return [element.center.lat, element.center.lon];
  return [null, null];
}

export async function importRegion(region) {
  const bbox = bboxOf(region);
  const boundary = boundaryOf(region);
  let written = 0;
  for (const { kind, body } of queriesFor(bbox)) {
    let payload;
    try {
      payload = await overpass(body);
    } catch (error) {
      // One class failing must not cost the rest of the region — report and
      // carry on, since a partial gazetteer still beats none.
      console.error(`  ${region.name}/${kind}: FAILED (${error.message})`);
      continue;
    }
    const elements = payload.elements || [];
    let kept = 0;
    for (const element of elements) {
      const tags = element.tags || {};
      const label = labelFor(kind, tags);
      if (!label) continue;
      const [lat, lng] = coordsOf(element);
      if (lat == null || lng == null) continue;
      // Overpass receives a rectangle; do not import a place merely because
      // it sits in that rectangle. Rider-visible data must be inside the
      // region polygon selected by operations.
      if (!pointInPolygon(lat, lng, boundary)) continue;
      await query(
        `INSERT INTO addresses(region_id, kind, label, street, housenumber, name, lat, lng, osm_type, osm_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (osm_type, osm_id) DO UPDATE SET
           region_id=EXCLUDED.region_id, kind=EXCLUDED.kind, label=EXCLUDED.label,
           street=EXCLUDED.street, housenumber=EXCLUDED.housenumber, name=EXCLUDED.name,
           lat=EXCLUDED.lat, lng=EXCLUDED.lng, updated_at=NOW()`,
        [
          region.id, kind, label,
          tags["addr:street"] || null,
          tags["addr:housenumber"] || null,
          tags.name || null,
          lat, lng, element.type, element.id
        ]
      );
      kept += 1;
    }
    written += kept;
    console.log(`  ${region.name}/${kind}: ${kept} of ${elements.length}`);
    await sleep(PAUSE_BETWEEN_QUERIES_MS);
  }
  return written;
}

async function main() {
  const wanted = process.argv[2];
  const regions = (await query(
    wanted
      ? "SELECT * FROM regions WHERE code=$1"
      : "SELECT * FROM regions WHERE is_active=true ORDER BY name",
    wanted ? [wanted] : []
  )).rows;

  if (!regions.length) {
    console.error(wanted ? `No region with code ${wanted}` : "No active regions");
    process.exit(1);
  }

  console.log(`Importing addresses for ${regions.length} region(s)`);
  let total = 0;
  for (const region of regions) {
    console.log(`${region.name} (${region.code})`);
    total += await importRegion(region);
  }
  console.log(`Done: ${total} address rows written`);
  process.exit(0);
}

// Only run the CLI flow when this file is executed directly. The admin
// route imports importRegion() from here, and must not trigger a full
// import (and a process.exit) merely by loading the module.
if (process.argv[1] && process.argv[1].endsWith("import-addresses.js")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
