// Verifies the committed address files are readable and well-formed, using
// the same gunzip + parse path load-addresses.js uses at boot.
//
// This exists because the loader's database half cannot be exercised on a
// developer machine here (no local Postgres credentials, Docker hangs), so
// the half that CAN be checked is checked properly rather than assumed: the
// files decompress, every line parses, the required fields are present, and
// the search text really does carry both name spellings where OSM had them.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

import { REGION_GEO, serviceBoundaryForCode, serviceRegionCode } from "../modules/routing/region-geo.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, "../../data/addresses");

function fail(message) {
  console.error(`Address data check FAILED: ${message}`);
  process.exit(1);
}

// Mirrors searchTextFor() in load-addresses.js. Kept as its own copy on
// purpose: if the loader's version drifts, this check should notice rather
// than silently follow it.
function searchTextFor(row) {
  const parts = [row.label, ...(Array.isArray(row.variants) ? row.variants : [])];
  const seen = new Set();
  const unique = [];
  for (const part of parts) {
    const text = String(part || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(text);
  }
  return unique.join(" · ");
}

if (!fs.existsSync(DATA_DIR)) fail(`no data directory at ${DATA_DIR}`);

const files = fs.readdirSync(DATA_DIR).filter((name) => name.endsWith(".jsonl.gz"));
if (!files.length) fail("no harvested address files found");
for (const region of REGION_GEO) {
  const expectedFile = `${region.code}.jsonl.gz`;
  if (!files.includes(expectedFile)) {
    fail(`active region ${region.code} has no local address catalogue`);
  }
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "manifest.json"), "utf8"));
} catch (error) {
  fail(`manifest.json is missing or unreadable: ${error.message}`);
}

const KINDS = new Set(["housenumber", "poi", "building", "street"]);
let total = 0;
let multiVariant = 0;
// Harvest boxes overlap, so the same object appears in several files. Keyed
// by OSM identity so the cross-border check below counts objects, not copies.
const seenObjects = new Set();
const allRows = [];

for (const name of files) {
  const file = path.join(DATA_DIR, name);
  let text;
  try {
    text = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");
  } catch (error) {
    fail(`${name} does not decompress: ${error.message}`);
  }
  let rows = 0;
  let owned = 0;
  const code = name.replace(/\.jsonl\.gz$/, "");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch (error) {
      fail(`${name} line ${rows + 1} is not valid JSON: ${error.message}`);
    }
    if (!row.label) fail(`${name} line ${rows + 1} has no label`);
    if (!KINDS.has(row.kind)) fail(`${name} line ${rows + 1} has unknown kind ${row.kind}`);
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) {
      fail(`${name} line ${rows + 1} has non-numeric coordinates`);
    }
    // Southern Turkistan region, generously bounded. A row outside this has
    // come from a mis-computed bounding box, which is exactly the bug the
    // cosine-of-latitude correction in the harvester guards against.
    if (row.lat < 39 || row.lat > 44 || row.lng < 65 || row.lng > 72) {
      fail(`${name} line ${rows + 1} is outside the service area: ${row.lat},${row.lng}`);
    }
    if (!row.osmType || row.osmId == null) fail(`${name} line ${rows + 1} has no OSM identity`);
    if (!searchTextFor(row).includes(row.label)) {
      fail(`${name} line ${rows + 1}: search text does not contain the label`);
    }
    if (Array.isArray(row.variants) && row.variants.length > 1) multiVariant += 1;
    const identity = `${row.osmType}:${row.osmId}`;
    if (!seenObjects.has(identity)) {
      seenObjects.add(identity);
      allRows.push(row);
    }
    if (serviceRegionCode(row.lat, row.lng) === code) owned += 1;
    rows += 1;
  }
  if (!rows) fail(`${name} is empty`);
  // The manifest holds the count the loader will actually write — rows whose
  // nearest region centre is this file's region — not the raw line count.
  // Harvest boxes overlap heavily, so those differ by a lot: 81 603 lines
  // across the files describe 27 476 distinct objects.
  //
  // The loader trusts this number to decide whether it has work to do, so a
  // stale entry would either skip a real load or force a pointless one on
  // every boot, and nothing else would notice.
  const claimed = manifest.counts?.[name];
  if (claimed == null) fail(`${name} has no manifest entry`);
  if (claimed !== owned) {
    fail(`${name}: manifest claims ${claimed} rows, file owns ${owned} (of ${rows} lines)`);
  }
  if (!owned) fail(`${name} owns no rows at all — check the region centres`);
  console.log(`  ${name}: ${owned} owned of ${rows} lines`);
  total += owned;
}

for (const name of Object.keys(manifest.counts || {})) {
  if (!files.includes(name)) fail(`manifest lists ${name}, which is not on disk`);
}

// No service area may reach across the state border.
//
// Атамекен's polygon used to run to 68.62 and so lay mostly inside
// Uzbekistan: 40% of everything harvested inside it was Uzbek ("Sirdaryo
// tumani 10-maktab", "Marxamat ko'chasi"), and a rider selecting Атамекен
// was offered destinations no driver can reach. Every other region measured
// 0-2%, so the two cases are far apart and a blunt threshold separates them.
//
// Latin-only labels are the signal, not proof of nationality — Kazakhstan has
// Latin-named businesses, and the Uzbek side has Cyrillic ones ("Заправка" at
// 68.5955). It does not need to classify a single row correctly; it needs to
// notice when a whole box moves onto the wrong side of a border.
function pointInServicePolygon(lat, lng, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    const crosses = (y > lat) !== (previousY > lat)
      && lng < ((previousX - x) * (lat - y)) / (previousY - y) + x;
    if (crosses) inside = !inside;
  }
  return inside;
}

const FOREIGN_SHARE_LIMIT = 0.1;
const hasLatin = /[a-zA-Z]/;
const hasCyrillic = /[Ѐ-ӿ]/;

for (const region of REGION_GEO) {
  const ring = serviceBoundaryForCode(region.code);
  if (!ring) fail(`${region.code} has no service boundary`);
  const inside = allRows.filter((row) => pointInServicePolygon(row.lat, row.lng, ring));
  if (!inside.length) continue;
  const foreign = inside.filter(
    (row) => hasLatin.test(row.label) && !hasCyrillic.test(row.label)
  ).length;
  const share = foreign / inside.length;
  if (share > FOREIGN_SHARE_LIMIT) {
    fail(
      `${region.code}: ${foreign} of ${inside.length} objects inside the service area `
      + `carry Latin-only names (${Math.round(share * 100)}%) — the polygon looks like `
      + "it crosses the state border"
    );
  }
}

if (!multiVariant) {
  fail("no row anywhere carries two name spellings — the Russian/Kazakh variants are not being captured");
}

console.log(`Address data checks ok: ${total} rows across ${files.length} regions, ${multiVariant} with more than one name spelling`);
