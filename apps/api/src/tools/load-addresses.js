// Loads the harvested address files in data/addresses/ into the `addresses`
// table. Runs inside the container, and makes no outbound calls.
//
// This is the second half of the split described in harvest-addresses.js:
// the production container cannot reach any Overpass mirror, so the harvest
// happens on a developer machine and its output is committed to the
// repository. Everything here reads local files only.
//
// Idempotent, and safe to call on every boot: rows are keyed on
// (osm_type, osm_id) and upserted, and the whole pass is skipped when the
// table already holds what the files contain.
//
// Usage:
//   node src/tools/load-addresses.js           # every file
//   node src/tools/load-addresses.js MYRZAKENT # one region by code

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

import { query } from "../db/pool.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, "../../data/addresses");

const BATCH_SIZE = 500;

// Everything a rider might type for this place, in one string: the label we
// show plus every name spelling OSM gave us. See the search_text column note
// in migrations.js.
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

async function flush(regionId, batch) {
  if (!batch.length) return 0;
  // One statement per batch rather than per row: at ~27k rows a region, a
  // round trip each would dominate the load time.
  const COLUMNS = 11;
  const tuples = [];
  const params = [];
  for (const row of batch) {
    const base = params.length;
    tuples.push(
      `(${Array.from({ length: COLUMNS }, (_, i) => `$${base + i + 1}`).join(",")})`
    );
    params.push(
      regionId,
      row.kind,
      row.label,
      searchTextFor(row),
      row.street || null,
      row.housenumber || null,
      row.name || null,
      row.lat,
      row.lng,
      row.osmType,
      row.osmId
    );
  }
  const sql = `
    INSERT INTO addresses(region_id, kind, label, search_text, street, housenumber, name, lat, lng, osm_type, osm_id)
    VALUES ${tuples.join(",")}
    ON CONFLICT (osm_type, osm_id) DO UPDATE SET
      region_id=EXCLUDED.region_id, kind=EXCLUDED.kind, label=EXCLUDED.label,
      search_text=EXCLUDED.search_text, street=EXCLUDED.street,
      housenumber=EXCLUDED.housenumber, name=EXCLUDED.name,
      lat=EXCLUDED.lat, lng=EXCLUDED.lng, updated_at=NOW()`;
  await query(sql, params);
  return batch.length;
}

async function loadFile(file, regionId) {
  // Harvest files are gzipped (see harvest-addresses.js); a plain .jsonl is
  // still accepted so a file dropped in by hand also loads.
  const raw = fs.createReadStream(file);
  const stream = file.endsWith(".gz") ? raw.pipe(zlib.createGunzip()) : raw;
  stream.setEncoding("utf8");
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let batch = [];
  let written = 0;
  for await (const line of lines) {
    const text = line.trim();
    if (!text) continue;
    let row;
    try {
      row = JSON.parse(text);
    } catch {
      // A single malformed line must not abort a 27 000-row file.
      continue;
    }
    if (!row.label || row.lat == null || row.lng == null) continue;
    batch.push(row);
    if (batch.length >= BATCH_SIZE) {
      written += await flush(regionId, batch);
      batch = [];
    }
  }
  written += await flush(regionId, batch);
  return written;
}

// Row counts come from the manifest the harvester writes, so the common
// case — every boot after the first — reads a few hundred bytes of JSON
// instead of synchronously gunzipping 1.9 MB inside a process that is
// already serving requests. Counting the file is the fallback for a file
// dropped in by hand with no manifest entry.
let manifestCounts = null;

function manifestCountFor(name) {
  if (manifestCounts === null) {
    try {
      manifestCounts = JSON.parse(
        fs.readFileSync(path.join(DATA_DIR, "manifest.json"), "utf8")
      ).counts || {};
    } catch {
      manifestCounts = {};
    }
  }
  return manifestCounts[name];
}

function countLines(file) {
  const buffer = fs.readFileSync(file);
  const text = file.endsWith(".gz")
    ? zlib.gunzipSync(buffer).toString("utf8")
    : buffer.toString("utf8");
  let count = 0;
  for (const line of text.split("\n")) if (line.trim()) count += 1;
  return count;
}

/// Loads every harvested region whose file holds more rows than the database
/// currently has for it. Returns the number of rows written.
///
/// `wantedCode` restricts the pass to one region.
export async function loadHarvestedAddresses({ wantedCode = null, log = console.log } = {}) {
  if (!fs.existsSync(DATA_DIR)) {
    log(`[addresses] no data directory at ${DATA_DIR}, nothing to load`);
    return 0;
  }
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((name) => name.endsWith(".jsonl.gz") || name.endsWith(".jsonl"))
    .filter((name) => !wantedCode || name.startsWith(`${wantedCode.toUpperCase()}.jsonl`));
  if (!files.length) {
    log("[addresses] no harvested files found");
    return 0;
  }

  let total = 0;
  for (const name of files) {
    const code = name.replace(/\.jsonl(\.gz)?$/, "");
    const file = path.join(DATA_DIR, name);
    const regions = await query("SELECT id, name FROM regions WHERE code=$1", [code]);
    const region = regions.rows[0];
    if (!region) {
      // A harvested region that does not exist in this environment is not an
      // error — the file set is shared across environments.
      log(`[addresses] ${code}: no such region, skipping`);
      continue;
    }
    const fileRows = manifestCountFor(name) ?? countLines(file);
    const existing = await query(
      "SELECT COUNT(*)::int AS count FROM addresses WHERE region_id=$1",
      [region.id]
    );
    const have = existing.rows[0]?.count || 0;
    if (have >= fileRows) {
      log(`[addresses] ${region.name}: ${have} rows already loaded, skipping`);
      continue;
    }
    log(`[addresses] ${region.name}: loading ${fileRows} rows (had ${have})`);
    const written = await loadFile(file, region.id);
    log(`[addresses] ${region.name}: ${written} rows written`);
    total += written;
  }
  return total;
}

async function main() {
  const total = await loadHarvestedAddresses({ wantedCode: process.argv[2] || null });
  console.log(`Done: ${total} rows written`);
  process.exit(0);
}

// Only run the CLI flow when executed directly — server.js imports
// loadHarvestedAddresses() and must not trigger a process.exit by loading
// the module.
if (process.argv[1] && process.argv[1].endsWith("load-addresses.js")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
